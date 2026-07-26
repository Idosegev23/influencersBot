/**
 * The questions this account's bot could not answer, grouped so they can be
 * fixed one topic at a time instead of one ticket at a time.
 *
 * Only rows with a recorded escalation_reason count. A row without one is not a
 * gap we understand, and bucketing it as "unknown" would put a fake, unfixable
 * item at the top of a list whose entire value is that every item is actionable.
 */

export interface GapSource {
  escalation_reason: string | null;
  source: string | null;
  message: string | null;
  created_at: string;
}

export interface KnowledgeGap {
  topic: string;
  count: number;
  examples: string[];
}

export function groupKnowledgeGaps(rows: GapSource[], maxExamples = 5): KnowledgeGap[] {
  const byTopic = new Map<string, { count: number; examples: string[] }>();

  for (const row of rows) {
    const topic = row.escalation_reason?.trim();
    if (!topic) continue;

    const entry = byTopic.get(topic) ?? { count: 0, examples: [] };
    entry.count++;

    const message = row.message?.trim();
    if (message && entry.examples.length < maxExamples) entry.examples.push(message);

    byTopic.set(topic, entry);
  }

  return [...byTopic.entries()]
    .map(([topic, e]) => ({ topic, count: e.count, examples: e.examples }))
    .sort((a, b) => b.count - a.count);
}
