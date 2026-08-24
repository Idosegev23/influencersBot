/**
 * Stage 2: fold raw L2 topic strings into canonical per-account clusters.
 *
 * Every merge the model makes is written back as an alias, so the same phrasing
 * next week costs nothing. Only genuinely new phrasings ever reach the model.
 */

import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

const CLUSTER_MODEL = 'gpt-5.6-luna';

/**
 * Raw topics per model call. One call for everything overflowed
 * max_output_tokens and came back as truncated JSON ("Unterminated string in
 * JSON at position 5277") on the very first real run — 95 topics was already
 * too many, and a full backfill has thousands.
 */
const CLUSTER_BATCH = 40;

/**
 * Batches per invocation. A full backfill leaves thousands of raw topics —
 * 2,542 after Argania's first retro, which is 64 sequential model calls and a
 * guaranteed FUNCTION_INVOCATION_TIMEOUT inside one 300s request. The caller
 * loops on `remaining` instead.
 */
const MAX_BATCHES_PER_RUN = 6;

export interface TopicRow { id: string; label: string; aliases: string[] }

const norm = (s: string) => s.trim().replace(/[\s ]+/g, ' ');

export function matchAlias(topics: TopicRow[], raw: string): string | null {
  const k = norm(raw || '');
  if (!k) return null;
  for (const t of topics) {
    if (norm(t.label) === k) return t.id;
    if (t.aliases.some((a) => norm(a) === k)) return t.id;
  }
  return null;
}

export interface ClusterDeps {
  fetchTopics: (accountId: string) => Promise<TopicRow[]>;
  /** A page of distinct unassigned raw topics — never the whole set. */
  fetchUnassignedRaw: (accountId: string) => Promise<string[]>;
  /** Rows still lacking a topic across the whole account, for honest progress. */
  countUnassignedRows: (accountId: string) => Promise<number>;
  callModel: (args: { existingLabels: string[]; rawTopics: string[] }) => Promise<{
    assignments: Array<{ raw: string; label: string }>;
  }>;
  upsertTopic: (accountId: string, label: string, alias: string | null) => Promise<string>;
  assignTopicToRaw: (accountId: string, raw: string, topicId: string) => Promise<void>;
}

export async function clusterTopics(opts: {
  accountId: string;
  maxBatches?: number;
  deps?: Partial<ClusterDeps>;
}): Promise<{
  matchedByAlias: number;
  clustered: number;
  newTopics: number;
  /** Distinct raw topics left in THIS page — a window estimate, not a total. */
  remaining: number;
  /** Classification rows still without a topic, account-wide. This is the number to loop on. */
  rowsRemaining: number;
}> {
  const deps: ClusterDeps = { ...defaultDeps(), ...(opts.deps || {}) } as ClusterDeps;
  const { accountId } = opts;

  const maxBatches = opts.maxBatches ?? MAX_BATCHES_PER_RUN;

  const raws = await deps.fetchUnassignedRaw(accountId);
  if (!raws.length) {
    return { matchedByAlias: 0, clustered: 0, newTopics: 0, remaining: 0, rowsRemaining: 0 };
  }

  const topics = await deps.fetchTopics(accountId);
  const known = new Set(topics.map((t) => t.label));

  let matchedByAlias = 0;
  const unseen: string[] = [];

  for (const raw of raws) {
    const hit = matchAlias(topics, raw);
    if (hit) {
      await deps.assignTopicToRaw(accountId, raw, hit);
      matchedByAlias++;
    } else {
      unseen.push(raw);
    }
  }

  if (!unseen.length) {
    return {
      matchedByAlias, clustered: 0, newTopics: 0, remaining: 0,
      rowsRemaining: await deps.countUnassignedRows(accountId),
    };
  }

  let clustered = 0;
  let newTopics = 0;

  const budget = maxBatches * CLUSTER_BATCH;
  const thisRun = unseen.slice(0, budget);
  const remaining = unseen.length - thisRun.length;

  for (let i = 0; i < thisRun.length; i += CLUSTER_BATCH) {
    const batch = thisRun.slice(i, i + CLUSTER_BATCH);

    let assignments: Array<{ raw: string; label: string }> = [];
    try {
      // Labels accumulate across batches, so a topic named in batch 1 is
      // offered to batch 2 and the clusters converge instead of fragmenting.
      ({ assignments } = await deps.callModel({
        existingLabels: [...known],
        rawTopics: batch,
      }));
    } catch (e: any) {
      // One bad batch must not discard the batches that already succeeded.
      console.error(`[topics] batch ${i / CLUSTER_BATCH} failed:`, e?.message || e);
      continue;
    }

    for (const a of assignments || []) {
      if (!a?.raw || !a?.label) continue;
      if (!known.has(a.label)) { known.add(a.label); newTopics++; }
      const topicId = await deps.upsertTopic(accountId, a.label, a.raw === a.label ? null : a.raw);
      await deps.assignTopicToRaw(accountId, a.raw, topicId);
      clustered++;
    }
  }

  return {
    matchedByAlias, clustered, newTopics, remaining,
    rowsRemaining: await deps.countUnassignedRows(accountId),
  };
}

function defaultDeps(): ClusterDeps {
  let client: OpenAI | null = null;
  const openai = () => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

  return {
    async fetchTopics(accountId) {
      const { data } = await supabase
        .from('conversation_topics')
        .select('id, label, aliases')
        .eq('account_id', accountId);
      return (data || []).map((t: any) => ({ id: t.id, label: t.label, aliases: t.aliases || [] }));
    },

    async countUnassignedRows(accountId) {
      const { count } = await supabase
        .from('conversation_classifications')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .is('topic_id', null)
        .not('topic_raw', 'is', null);
      return count || 0;
    },

    async fetchUnassignedRaw(accountId) {
      const { data } = await supabase
        .from('conversation_classifications')
        .select('topic_raw')
        .eq('account_id', accountId)
        .is('topic_id', null)
        .not('topic_raw', 'is', null)
        .limit(2000);
      return [...new Set((data || []).map((r: any) => r.topic_raw).filter(Boolean))];
    },

    async callModel({ existingLabels, rawTopics }) {
      const response = await openai().responses.create({
        model: CLUSTER_MODEL,
        instructions: `אתה מאחד נושאי שיחה לקטגוריות קנוניות.
לכל נושא גולמי החזר label: או אחד מהתוויות הקיימות אם המשמעות זהה, או תווית חדשה קצרה בעברית.
אל תמציא איחוד בין נושאים שונים במהותם.

תוויות קיימות:
${existingLabels.map((l) => `- ${l}`).join('\n') || '(אין)'}`,
        input: JSON.stringify({ rawTopics }),
        max_output_tokens: 4000,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'topic_assignments',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                assignments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { raw: { type: 'string' }, label: { type: 'string' } },
                    required: ['raw', 'label'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['assignments'],
              additionalProperties: false,
            },
          },
        },
      } as any);
      return JSON.parse((response as any).output_text);
    },

    async upsertTopic(accountId, label, alias) {
      const { data: existing } = await supabase
        .from('conversation_topics')
        .select('id, aliases')
        .eq('account_id', accountId)
        .eq('label', label)
        .maybeSingle();

      if (existing) {
        if (alias && !(existing.aliases || []).includes(alias)) {
          await supabase
            .from('conversation_topics')
            .update({ aliases: [...(existing.aliases || []), alias], last_seen_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
        return existing.id;
      }

      const { data, error } = await supabase
        .from('conversation_topics')
        .insert({ account_id: accountId, label, aliases: alias ? [alias] : [] })
        .select('id')
        .single();
      if (error) throw new Error(`upsertTopic: ${error.message}`);
      return data.id;
    },

    async assignTopicToRaw(accountId, raw, topicId) {
      await supabase
        .from('conversation_classifications')
        .update({ topic_id: topicId })
        .eq('account_id', accountId)
        .eq('topic_raw', raw)
        .is('topic_id', null);
    },
  };
}
