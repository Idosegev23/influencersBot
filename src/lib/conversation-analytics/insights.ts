/**
 * Stage 3a: derive a handful of insights from the aggregates.
 *
 * The model sees counts and movements — never raw conversation text. Anything
 * it returns without a number or a piece of evidence behind it is discarded:
 * an insight without evidence is an opinion, and the brand will act on it.
 */

import type { ConversationReport } from './aggregate';

const ALLOWED_TYPES = new Set([
  'rising_topic', 'complaint_cluster', 'product_risk', 'unanswered', 'channel_shift',
  'faq', 'topic_interest', 'pain_point', 'objection', 'sentiment', 'product_inquiry',
]);

/** Cap so the page stays readable — six cards is already a lot to act on in a week. */
const MAX_INSIGHTS = 6;

export interface GeneratedInsight {
  insight_type: string;
  title: string;
  content: string;
  occurrence_count: number;
  confidence_score: number;
  examples: any[];
  tags: string[];
}

/** The aggregate slice handed to the model — deliberately free of session ids. */
export function insightInput(report: ConversationReport) {
  return {
    kpis: report.kpis,
    inquiryTypes: report.inquiryTypes,
    topTopics: report.topics.slice(0, 20),
    complaintsByKind: report.complaints.byKind,
    productsByComplaintRate: report.products.byComplaintRate.slice(0, 10),
    channels: report.channels,
    topKeywords: report.keywords.slice(0, 20),
  };
}

export async function generateInsights(
  report: ConversationReport,
  deps: { callModel: (summary: ReturnType<typeof insightInput>) => Promise<{ insights: any[] }> }
): Promise<GeneratedInsight[]> {
  let raw: any[] = [];
  try {
    const res = await deps.callModel(insightInput(report));
    raw = Array.isArray(res?.insights) ? res.insights : [];
  } catch (e: any) {
    console.error('[insights] model failed:', e?.message || e);
    return [];
  }

  const out: GeneratedInsight[] = [];
  for (const i of raw) {
    const count = Number(i?.occurrence_count) || 0;
    const evidence = Array.isArray(i?.evidence) ? i.evidence.filter(Boolean) : [];
    if (count <= 0 || evidence.length === 0) continue; // no evidence, no insight
    if (!i?.title || !i?.content) continue;

    const type = ALLOWED_TYPES.has(i.insight_type) ? i.insight_type : 'pain_point';
    const conf = Number(i?.confidence);

    out.push({
      insight_type: type,
      title: String(i.title).slice(0, 200),
      content: String(i.content).slice(0, 2000),
      occurrence_count: count,
      confidence_score: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
      examples: evidence.slice(0, 10),
      tags: Array.isArray(i?.tags) ? i.tags.filter((t: any) => typeof t === 'string').slice(0, 5) : [],
    });
  }
  return out.slice(0, MAX_INSIGHTS);
}
