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
 * them through the same retrieval the live assistant uses, and report which its
 * content answers most and least strongly. See the note on the score scale below
 * for why almost everything here is stated relatively.
 *
 * Real audience questions are still used, and rank first when they exist, because
 * somebody actually typing a question outranks any simulation of one.
 *
 * The evidence for a probe is the retrieval result — the score and the closest
 * thing we did find — so every claim can be re-run and checked.
 */

const PROBE_MODEL = 'gpt-5.6-luna';

/** Ask for this many probe questions; the model may return fewer. */
const PROBE_COUNT = 14;

/**
 * Retrieval scores are NOT on a calibrated 0-1 scale.
 *
 * `RetrievedSource.confidence` is a reranker score on one path and a raw cosine
 * similarity on another; a live ABA run produced 0.942, 0.989 and 1.018 — above
 * one. An absolute "below X means uncovered" threshold against that is
 * meaningless: the first version of this used 0.45 and declared 100% coverage,
 * which is not an insight, it is a broken measurement reported as good news.
 *
 * So there is exactly one ABSOLUTE claim we are entitled to make — retrieval
 * returned nothing at all — and everything else is stated RELATIVELY, as which
 * questions this account's own content answers most and least strongly. A
 * relative ranking is true whatever the scale.
 */

/** Questions whose weakest-scoring share gets reported as thin coverage. */
const WEAK_SHARE = 0.3;
/** Below this spread between best and worst, there is no meaningful ranking to report. */
const MIN_SPREAD_RATIO = 1.05;

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
      // A comment carrying a link is the account promoting itself or somebody
      // dropping a reference — not a member asking something. A live ABA run put
      // "What's new in Virginia? https://virginia.org/..." and a Freedom Riders
      // link-drop into the results as though a visitor had asked them.
      if (/https?:\/\/|\bwww\./i.test(t)) return false;
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

  const insights: ContentInsight[] = [];
  const byScore = [...results].sort((a, b) => a.topScore - b.topScore);

  // ── The one absolute claim: retrieval returned nothing at all. ──
  const unanswerable = byScore.filter((r) => r.topScore === 0);
  if (unanswerable.length > 0) {
    const realCount = unanswerable.filter((r) => r.source === 'audience').length;
    insights.push({
      type: 'content_gaps',
      title: 'Questions your content cannot answer at all',
      summary:
        `We put ${results.length} realistic visitor questions through your assistant's retrieval. ` +
        `${unanswerable.length} returned nothing at all` +
        (realCount > 0 ? `, including ${realCount} asked by real people in your comments` : '') +
        `. Your assistant will be asked these and will have to say it doesn't know.`,
      rank: 0,
      metrics: { probed: results.length, unanswerable: unanswerable.length, fromRealAudience: realCount },
      evidence: unanswerable.slice(0, 8).map(toEvidence),
    });
  }

  // ── Everything else is relative, because the score scale is not calibrated. ──
  const answered = byScore.filter((r) => r.topScore > 0);
  const spread = answered.length > 1 ? answered[answered.length - 1].topScore / (answered[0].topScore || 1) : 1;

  if (answered.length >= 4 && spread >= MIN_SPREAD_RATIO) {
    const weakCount = Math.max(2, Math.round(answered.length * WEAK_SHARE));
    const weakest = answered.slice(0, weakCount);

    insights.push({
      type: 'content_gaps',
      title: 'Where your content is thinnest',
      summary:
        `Across ${results.length} questions we tested, these matched your content least strongly. ` +
        `Your assistant can answer them, but from further away — they are the ones worth writing about next. ` +
        `Scores are relative to this account's own content, not an absolute scale.`,
      rank: unanswerable.length > 0 ? 1 : 0,
      metrics: {
        probed: results.length,
        reportedAsThin: weakest.length,
        weakestScore: weakest[0]?.topScore,
        strongestScore: answered[answered.length - 1]?.topScore,
      },
      evidence: weakest.map(toEvidence),
    });

    insights.push({
      type: 'content_gaps',
      title: 'What your assistant answers best',
      summary:
        `These questions matched your content most strongly of the ${results.length} we tested — ` +
        `the ones it will answer confidently and with a source to point at.`,
      rank: unanswerable.length > 0 ? 2 : 1,
      metrics: { probed: results.length, strongestScore: answered[answered.length - 1]?.topScore },
      evidence: [...answered].reverse().slice(0, 5).map(toEvidence),
    });
  }

  return insights;
}

function toEvidence(r: ProbeResult): InsightEvidence {
  return {
    kind: 'probe',
    title: r.question,
    excerpt: r.bestMatch ? `Closest match: ${r.bestMatch}` : 'Nothing relevant retrieved',
    metric: r.source === 'audience' ? 'asked by a real visitor · match strength' : 'match strength',
    value: r.topScore,
  };
}
