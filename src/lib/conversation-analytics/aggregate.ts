/**
 * Turns classification rows into the payload every surface renders: the page,
 * the xlsx, the frozen snapshot and the weekly email all read this one shape,
 * so they cannot disagree.
 */

import { INQUIRY_TYPE_LABEL_HE, COMPLAINT_KIND_LABEL_HE, type InquiryType } from './taxonomy';

export const ALL_CHANNELS = ['web', 'whatsapp', 'instagram'] as const;

export interface ClassificationLite {
  session_id: string;
  channel: string;
  started_at: string;
  inquiry_type: string | null;
  topic_label: string | null;
  is_complaint: boolean;
  complaint_kind: string | null;
  sentiment: string | null;
  outcome: string | null;
  product_id: string | null;
  product_name: string | null;
  product_category: string | null;
  keywords: string[];
  status: string;
}

interface KpiBlock {
  total: number; complaints: number; resolvedByBot: number; escalated: number; negative: number;
}

export interface ConversationReport {
  coverage: {
    total: number;
    classified: number;
    classifiedPct: number;
    complaints: number;
    complaintsWithProduct: number;
    complaintsWithProductPct: number;
  };
  kpis: KpiBlock & { previous: KpiBlock };
  inquiryTypes: Array<{ type: string; label: string; count: number; previousCount: number; delta: number }>;
  topics: Array<{ label: string; count: number; previousCount: number; delta: number; isNew: boolean }>;
  complaints: {
    byKind: Array<{ kind: string; label: string; count: number }>;
    byProduct: Array<{ productId: string; productName: string; count: number }>;
    kindByCategory: Array<{ kind: string; category: string; count: number }>;
  };
  products: {
    byMentions: Array<{ productId: string; productName: string; mentions: number; complaints: number; complaintRate: number }>;
    byComplaintRate: Array<{ productId: string; productName: string; mentions: number; complaints: number; complaintRate: number }>;
  };
  channels: Array<{ channel: string; count: number; connected: boolean }>;
  keywords: Array<{ keyword: string; count: number }>;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function tally<T>(rows: T[], key: (r: T) => string | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

export function buildReport(opts: {
  current: ClassificationLite[];
  previous: ClassificationLite[];
  connectedChannels: string[];
  /**
   * Sessions that exist in the range, classified or not. Coverage is measured
   * against this, NOT against the rows we happen to have: a pipeline that has
   * only reached 3% of an account must not display 100% classified. Omit only
   * when the universe is genuinely unknown, and accept that the percentage then
   * describes the fetched rows alone.
   */
  sessionsInRange?: number;
}): ConversationReport {
  const { current, previous, connectedChannels } = opts;
  const universe = opts.sessionsInRange ?? current.length;

  const usable = current.filter((r) => r.status === 'ok');
  const complaints = current.filter((r) => r.is_complaint);
  const complaintsWithProduct = complaints.filter((r) => !!r.product_id);

  const kpisFor = (rows: ClassificationLite[]): KpiBlock => ({
    total: rows.length,
    complaints: rows.filter((r) => r.is_complaint).length,
    resolvedByBot: rows.filter((r) => r.outcome === 'resolved_by_bot').length,
    escalated: rows.filter((r) => r.outcome === 'escalated').length,
    negative: rows.filter((r) => r.sentiment === 'negative').length,
  });

  const curTypes = tally(current, (r) => r.inquiry_type);
  const prevTypes = tally(previous, (r) => r.inquiry_type);
  const inquiryTypes = [...curTypes.entries()]
    .map(([type, count]) => ({
      type,
      label: INQUIRY_TYPE_LABEL_HE[type as InquiryType] || type,
      count,
      previousCount: prevTypes.get(type) || 0,
      delta: count - (prevTypes.get(type) || 0),
    }))
    .sort((a, b) => b.count - a.count);

  const curTopics = tally(current, (r) => r.topic_label);
  const prevTopics = tally(previous, (r) => r.topic_label);
  const topics = [...curTopics.entries()]
    .map(([label, count]) => {
      const previousCount = prevTopics.get(label) || 0;
      return { label, count, previousCount, delta: count - previousCount, isNew: previousCount === 0 };
    })
    .sort((a, b) => b.count - a.count);

  // Product stats: mentions and complaints per resolved SKU. Unresolved
  // mentions are deliberately absent — an unattributed complaint must not be
  // silently folded into some product's rate.
  const perProduct = new Map<string, { productName: string; mentions: number; complaints: number }>();
  for (const r of current) {
    if (!r.product_id) continue;
    const e = perProduct.get(r.product_id) || { productName: r.product_name || r.product_id, mentions: 0, complaints: 0 };
    e.mentions++;
    if (r.is_complaint) e.complaints++;
    perProduct.set(r.product_id, e);
  }
  const productStats = [...perProduct.entries()].map(([productId, e]) => ({
    productId,
    productName: e.productName,
    mentions: e.mentions,
    complaints: e.complaints,
    complaintRate: pct(e.complaints, e.mentions),
  }));

  const kindByCategory = new Map<string, number>();
  for (const r of complaints) {
    if (!r.complaint_kind || !r.product_category) continue;
    const k = `${r.complaint_kind}|${r.product_category}`;
    kindByCategory.set(k, (kindByCategory.get(k) || 0) + 1);
  }

  const kwMap = new Map<string, number>();
  for (const r of current) for (const k of r.keywords || []) kwMap.set(k, (kwMap.get(k) || 0) + 1);

  const channelCounts = tally(current, (r) => r.channel);

  const complaintProductNames = new Map<string, string>();
  for (const r of complaintsWithProduct) {
    if (r.product_id && !complaintProductNames.has(r.product_id)) {
      complaintProductNames.set(r.product_id, r.product_name || r.product_id);
    }
  }

  return {
    coverage: {
      total: universe,
      classified: usable.length,
      classifiedPct: pct(usable.length, universe),
      complaints: complaints.length,
      complaintsWithProduct: complaintsWithProduct.length,
      complaintsWithProductPct: pct(complaintsWithProduct.length, complaints.length),
    },
    kpis: { ...kpisFor(current), previous: kpisFor(previous) },
    inquiryTypes,
    topics,
    complaints: {
      byKind: [...tally(complaints, (r) => r.complaint_kind).entries()]
        .map(([kind, count]) => ({
          kind,
          label: COMPLAINT_KIND_LABEL_HE[kind as keyof typeof COMPLAINT_KIND_LABEL_HE] || kind,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      byProduct: [...tally(complaintsWithProduct, (r) => r.product_id).entries()]
        .map(([productId, count]) => ({
          productId,
          productName: complaintProductNames.get(productId) || productId,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      kindByCategory: [...kindByCategory.entries()]
        .map(([k, count]) => {
          const [kind, category] = k.split('|');
          return { kind, category, count };
        })
        .sort((a, b) => b.count - a.count),
    },
    products: {
      byMentions: [...productStats].sort((a, b) => b.mentions - a.mentions),
      // Rate first, mentions as the tie-breaker so a 1-of-1 fluke does not top the list.
      byComplaintRate: [...productStats]
        .filter((p) => p.complaints > 0)
        .sort((a, b) => b.complaintRate - a.complaintRate || b.mentions - a.mentions),
    },
    channels: ALL_CHANNELS.map((channel) => ({
      channel,
      count: channelCounts.get(channel) || 0,
      connected: connectedChannels.includes(channel),
    })),
    keywords: [...kwMap.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40),
  };
}
