/**
 * The one place classification rows are read for a surface.
 *
 * The page, the drill-down and the export all go through here so a filter
 * added in one place cannot quietly disagree with another.
 */

import { supabase } from '@/lib/supabase';
import type { ClassificationLite } from './aggregate';

/** Columns every surface needs, joined to the canonical topic and product name. */
const SELECT =
  'session_id, channel, started_at, inquiry_type, topic_raw, is_complaint, complaint_kind, ' +
  'sentiment, outcome, summary, product_id, product_category, product_line, keywords, status, ' +
  'conversation_topics(label), widget_products(name_he, name)';

export interface RowFilters {
  channel?: string | null;
  inquiryType?: string | null;
  complaintsOnly?: boolean;
  productId?: string | null;
  keyword?: string | null;
  topic?: string | null;
}

export function filtersFromParams(sp: URLSearchParams): RowFilters {
  return {
    channel: sp.get('channel'),
    inquiryType: sp.get('inquiry_type'),
    complaintsOnly: sp.get('complaints') === '1',
    productId: sp.get('product_id'),
    keyword: sp.get('keyword'),
    topic: sp.get('topic'),
  };
}

export function toLite(r: any): ClassificationLite & { summary?: string | null } {
  return {
    session_id: r.session_id,
    channel: r.channel,
    started_at: r.started_at,
    inquiry_type: r.inquiry_type,
    topic_label: r.conversation_topics?.label || r.topic_raw || null,
    is_complaint: !!r.is_complaint,
    complaint_kind: r.complaint_kind,
    sentiment: r.sentiment,
    outcome: r.outcome,
    product_id: r.product_id,
    product_name: r.widget_products?.name_he || r.widget_products?.name || null,
    product_category: r.product_category,
    product_line: r.product_line ?? null,
    keywords: r.keywords || [],
    status: r.status,
    summary: r.summary ?? null,
  };
}

function applyFilters(q: any, f: RowFilters) {
  if (f.channel) q = q.eq('channel', f.channel);
  if (f.inquiryType) q = q.eq('inquiry_type', f.inquiryType);
  if (f.complaintsOnly) q = q.eq('is_complaint', true);
  if (f.productId) q = q.eq('product_id', f.productId);
  if (f.keyword) q = q.contains('keywords', [f.keyword]);
  return q;
}

const MAX_ROWS = 20000;

export async function fetchClassificationRows(opts: {
  accountId: string;
  fromIso: string;
  toIso: string;
  filters?: RowFilters;
}): Promise<Array<ClassificationLite & { summary?: string | null }>> {
  let q = supabase
    .from('conversation_classifications')
    .select(SELECT)
    .eq('account_id', opts.accountId)
    .gte('started_at', opts.fromIso)
    .lt('started_at', opts.toIso);

  q = applyFilters(q, opts.filters || {});

  const { data, error } = await q.limit(MAX_ROWS);
  if (error) throw new Error(error.message);

  const rows = (data || []).map(toLite);
  // `topic` filters on the resolved label, which only exists after the join.
  return opts.filters?.topic
    ? rows.filter((r) => r.topic_label === opts.filters!.topic)
    : rows;
}

export async function fetchClassificationPage(opts: {
  accountId: string;
  fromIso: string;
  toIso: string;
  filters?: RowFilters;
  page: number;
  pageSize: number;
}): Promise<{ rows: any[]; total: number }> {
  let q = supabase
    .from('conversation_classifications')
    .select(SELECT, { count: 'exact' })
    .eq('account_id', opts.accountId)
    .gte('started_at', opts.fromIso)
    .lt('started_at', opts.toIso);

  q = applyFilters(q, opts.filters || {});

  const { data, count, error } = await q
    .order('started_at', { ascending: false })
    .range((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize - 1);

  if (error) throw new Error(error.message);
  return { rows: (data || []).map(toLite), total: count || 0 };
}

/** Which channels this account actually has, so "0" is never shown for one it never connected. */
export async function fetchConnectedChannels(accountId: string): Promise<string[]> {
  const out = ['web'];
  const { data: acc } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  if ((acc as any)?.config?.whatsapp_cs?.enabled === true) out.push('whatsapp');
  const { count } = await supabase
    .from('ig_graph_connections')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('is_active', true);
  if ((count || 0) > 0) out.push('instagram');
  return out;
}

/**
 * Insights written by the weekly job, for the cards at the top of the page.
 * Scoped to the viewed range so an old week's insight does not float above a
 * report it has nothing to do with.
 */
export async function fetchInsights(opts: {
  accountId: string;
  fromIso: string;
  toIso: string;
  limit?: number;
}): Promise<Array<{ id: string; insight_type: string; title: string; content: string; occurrence_count: number; examples: any[] }>> {
  const { data, error } = await supabase
    .from('conversation_insights')
    .select('id, insight_type, title, content, occurrence_count, examples, created_at')
    .eq('account_id', opts.accountId)
    .eq('is_active', true)
    .gte('created_at', opts.fromIso)
    .lte('created_at', opts.toIso)
    .order('created_at', { ascending: false })
    .order('occurrence_count', { ascending: false })
    .limit(opts.limit ?? 6);

  if (error) throw new Error(error.message);
  return (data || []) as any[];
}

/**
 * Sessions that exist in the range — the denominator for the coverage bar.
 *
 * Counted from chat_sessions, not from conversation_classifications, precisely
 * so an incomplete classification run shows up as low coverage instead of
 * reading as a complete report of a smaller period.
 */
export async function countSessionsInRange(opts: {
  accountId: string;
  fromIso: string;
  toIso: string;
}): Promise<number> {
  const { count, error } = await supabase
    .from('chat_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', opts.accountId)
    .gte('created_at', opts.fromIso)
    .lt('created_at', opts.toIso);

  if (error) throw new Error(error.message);
  return count || 0;
}
