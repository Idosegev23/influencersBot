import OpenAI from 'openai';
import { retrieveContext } from '@/lib/rag/retrieve';
import { topicLabel } from './deterministic';
import type { ContentInsight, InsightCorpus, InsightEvidence } from './types';

/**
 * Content gaps — questions this account's knowledge cannot answer.
 *
 * WHAT THIS IS NOT. The first design read gaps out of what the audience asked in
 * comments. Measured against the real corpus that turned out to be unusable for
 * most accounts: ABA's Instagram carries 2 comments across 12 posts, Facebook's
 * `topComments` came back on 1 post in 12, and the comments that do exist are
 * congratulations ("See you there", "Well deserved!"), not questions. Building a
 * headline insight on that would have meant inventing an audience.
 *
 * WHAT THIS IS. A coverage audit. We ask the model for the questions a real
 * visitor to THIS account would arrive with — grounded in the account's own topic
 * map, so the questions are about what it actually does — then put every one of
 * them through the same retrieval the live assistant uses. A question whose best
 * match scores below the floor is a genuine hole: the assistant will be asked it
 * and will have to hedge.
 *
 * Real audience questions are still used, and rank first when they exist, because
 * somebody actually typing a question outranks any simulation of one.
 *
 * The evidence for a probe is the retrieval result — the score and the closest
 * thing we did find — so every claim can be re-run and checked.
 */

const PROBE_MODEL = 'gpt-5.6-luna';

/** Retrieval confidence (0-1) below which the corpus does not really answer a question. */
const COVERAGE_FLOOR = 0.45;
/** Ask for this many probe questions; the model may return fewer. */
const PROBE_COUNT = 14;
/**
 * If more than this share of probes come back uncovered, the finding is not "you
 * have some gaps" — it is that retrieval or the scan is broken. Reporting a dozen
 * confident gaps in that state would be the worst kind of wrong.
 */
const BROKEN_THRESHOLD = 0.8;

function openai(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const QUESTION_STARTERS =
  /^(what|when|where|who|why|how|is|are|do|does|did|can|could|should|would|will|any|anyone|has|have)\b/i;

/** Comments that are actually asking something, not applauding. */
export function extractAudienceQuestions(comments: { text: string; postUrl: string | null; platform: string }[]) {
  const seen = new Set<string>();
  return comments
    .filter((c) => {
      const t = c.text.trim();
      if (t.length < 8 || t.length > 300) return false;
      if (!t.includes('?') && !QUESTION_STARTERS.test(t)) return false;
      const key = t.toLowerCase().replace(/\W+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

/** Ask the model for questions a visitor to this specific account would arrive with. */
async function generateProbeQuestions(corpus: InsightCorpus): Promise<string[]> {
  const topics = Object.entries(corpus.topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([t, count]) => `${topicLabel(t)} (${count} passages)`);

  if (topics.length === 0) return [];

  const response = await openai().responses.create({
    model: PROBE_MODEL,
    instructions:
      'You write the questions a real visitor would arrive with, for a specific organisation.\n' +
      'Write in natural, native English — the way a person actually types, not survey language.\n' +
      'Ground every question in the subject areas you are given: do not invent a line of business ' +
      'the organisation has not shown.\n' +
      'Mix the obvious practical questions with the harder specifics a genuinely interested person asks ' +
      '(costs, deadlines, eligibility, process, positions). The specific ones are the point — a list of ' +
      'easy questions tells the owner nothing.\n' +
      'One sentence each. No numbering, no preamble.',
    input: JSON.stringify({
      organisation: corpus.displayName,
      kind: corpus.archetype,
      subjectAreas: topics,
      howManyQuestions: PROBE_COUNT,
    }),
    max_output_tokens: 1200,
    reasoning: { effort: 'low' },
    text: {
      format: {
        type: 'json_schema',
        name: 'probe_questions',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            questions: { type: 'array', items: { type: 'string' } },
          },
          required: ['questions'],
        },
      },
    },
  } as any);

  try {
    const parsed = JSON.parse((response as any).output_text || '{}');
    const questions: unknown = parsed?.questions;
    if (!Array.isArray(questions)) return [];
    return questions.map((q) => String(q).trim()).filter((q) => q.length > 8).slice(0, PROBE_COUNT);
  } catch {
    return [];
  }
}

interface ProbeResult {
  question: string;
  topScore: number;
  bestMatch: string | null;
  source: 'audience' | 'simulated';
}

/** Run one question through the live retrieval path and record what came back. */
async function probe(
  corpus: InsightCorpus,
  question: string,
  source: ProbeResult['source'],
): Promise<ProbeResult | null> {
  try {
    const { sources } = await retrieveContext({
      accountId: corpus.accountId,
      query: question,
      topK: 3,
      archetype: corpus.archetype,
    });
    const best = sources[0];
    return {
      question,
      topScore: best ? Number(best.confidence.toFixed(3)) : 0,
      bestMatch: best ? best.title || best.excerpt.slice(0, 120) : null,
      source,
    };
  } catch {
    return null;
  }
}

export async function generateContentGaps(corpus: InsightCorpus): Promise<ContentInsight[]> {
  const audienceQuestions = extractAudienceQuestions(corpus.comments);
  const simulated = await generateProbeQuestions(corpus);
  if (audienceQuestions.length === 0 && simulated.length === 0) return [];

  const results: ProbeResult[] = [];
  for (const c of audienceQuestions) {
    const r = await probe(corpus, c.text, 'audience');
    if (r) results.push(r);
  }
  for (const q of simulated) {
    const r = await probe(corpus, q, 'simulated');
    if (r) results.push(r);
  }
  if (results.length === 0) return [];

  const uncovered = results.filter((r) => r.topScore < COVERAGE_FLOOR);
  const coveredShare = Math.round(((results.length - uncovered.length) / results.length) * 100);

  // Everything scored low. That is a broken retrieval or a thin scan, not a
  // content strategy finding, and it must not be dressed up as one.
  if (uncovered.length / results.length > BROKEN_THRESHOLD) {
    return [
      {
        type: 'content_gaps',
        title: 'Your knowledge base is too thin to answer visitor questions',
        summary:
          `We put ${results.length} realistic visitor questions through your assistant's retrieval and ` +
          `${uncovered.length} of them found nothing relevant. That is a coverage problem across the board, ` +
          `not a gap in one topic — the scan needs more source material before these numbers mean anything.`,
        rank: 0,
        metrics: { probed: results.length, uncovered: uncovered.length, floor: COVERAGE_FLOOR },
        evidence: uncovered.slice(0, 5).map(toEvidence),
      },
    ];
  }

  const insights: ContentInsight[] = [];

  if (uncovered.length > 0) {
    // Audience-sourced gaps lead: a question somebody actually typed beats a
    // simulated one every time.
    const ordered = [...uncovered].sort((a, b) =>
      a.source === b.source ? a.topScore - b.topScore : a.source === 'audience' ? -1 : 1,
    );
    const realCount = ordered.filter((r) => r.source === 'audience').length;

    insights.push({
      type: 'content_gaps',
      title: 'Questions your content cannot answer',
      summary:
        `We put ${results.length} realistic visitor questions through your assistant's retrieval. ` +
        `${uncovered.length} found nothing solid to answer from` +
        (realCount > 0 ? `, including ${realCount} asked by real people in your comments` : '') +
        `. Each one is a question your assistant will be asked and will have to hedge on.`,
      rank: 0,
      metrics: {
        probed: results.length,
        uncovered: uncovered.length,
        coveredSharePct: coveredShare,
        fromRealAudience: realCount,
        floor: COVERAGE_FLOOR,
      },
      evidence: ordered.slice(0, 8).map(toEvidence),
    });
  }

  // The other half of the audit, and the reassuring one: what it answers well.
  const strongest = results
    .filter((r) => r.topScore >= COVERAGE_FLOOR)
    .sort((a, b) => b.topScore - a.topScore)
    .slice(0, 5);

  if (strongest.length > 0) {
    insights.push({
      type: 'content_gaps',
      title: 'What your assistant already answers well',
      summary:
        `${coveredShare}% of the questions we tested found solid grounding in your content. ` +
        `These are the ones it will answer confidently and with a source.`,
      rank: 1,
      metrics: { probed: results.length, coveredSharePct: coveredShare },
      evidence: strongest.map(toEvidence),
    });
  }

  return insights;
}

function toEvidence(r: ProbeResult): InsightEvidence {
  return {
    kind: 'probe',
    title: r.question,
    excerpt: r.bestMatch ? `Closest match: ${r.bestMatch}` : 'Nothing relevant retrieved',
    metric: r.source === 'audience' ? 'asked by a real visitor · match score' : 'match score',
    value: r.topScore,
  };
}
