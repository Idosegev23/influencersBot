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
  product_line: string | null;
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
    /** Share of the comparison period that is classified, for delta sanity. */
    previousClassifiedPct: number;
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
    byComplaintRate: Array<{ productId: string; productName: string; mentions: number; complaints: number; complaintRate: number; belowSampleFloor: boolean }>;
  };
  /**
   * Product lines (סדרות). Customers name a line far more often than a SKU, so
   * this is where most of the real product attribution lands.
   */
  series: {
    byMentions: Array<{ line: string; mentions: number; complaints: number; complaintRate: number }>;
    byComplaintRate: Array<{ line: string; mentions: number; complaints: number; complaintRate: number; belowSampleFloor: boolean }>;
    attributedPct: number;
  };
  channels: Array<{ channel: string; count: number; connected: boolean }>;
  keywords: Array<{ keyword: string; count: number }>;
}

/**
 * Mentions a product or line needs before its complaint RATE is treated as a
 * ranked signal. Argania's data made the case: חומצה היאלורונית showed 40% on
 * 10 mentions while the flagship סדרת קיק showed 6% on 509 — ranking on rate
 * alone puts a ten-conversation sample at the top of the page. Rows below the
 * floor are still returned, flagged, and sorted after the ones above it.
 */
export const MIN_MENTIONS_FOR_RATE = 10;

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

/**
 * Orders by complaint rate, but only among entries with enough mentions for the
 * rate to mean anything. Thin samples keep their place in the list, flagged, so
 * nothing is hidden — they simply stop outranking real signal.
 */
function rankByComplaintRate<T extends { mentions: number; complaints: number; complaintRate: number }>(
  stats: T[]
): Array<T & { belowSampleFloor: boolean }> {
  return stats
    .filter((s) => s.complaints > 0)
    .map((s) => ({ ...s, belowSampleFloor: s.mentions < MIN_MENTIONS_FOR_RATE }))
    .sort((a, b) =>
      Number(a.belowSampleFloor) - Number(b.belowSampleFloor) ||
      b.complaintRate - a.complaintRate ||
      b.mentions - a.mentions);
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
  /** Same, for the comparison period. Lets consumers tell a real change from an
   *  uneven classification run. */
  previousSessionsInRange?: number;
}): ConversationReport {
  const { current, previous, connectedChannels } = opts;
  const universe = opts.sessionsInRange ?? current.length;
  const previousUniverse = opts.previousSessionsInRange ?? previous.length;

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

  const perSeries = new Map<string, { mentions: number; complaints: number }>();
  for (const r of current) {
    if (!r.product_line) continue;
    const e = perSeries.get(r.product_line) || { mentions: 0, complaints: 0 };
    e.mentions++;
    if (r.is_complaint) e.complaints++;
    perSeries.set(r.product_line, e);
  }
  const seriesStats = [...perSeries.entries()].map(([line, e]) => ({
    line,
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
      previousClassifiedPct: pct(previous.filter((r) => r.status === 'ok').length, previousUniverse),
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
      byComplaintRate: rankByComplaintRate(productStats),
    },
    series: {
      byMentions: [...seriesStats].sort((a, b) => b.mentions - a.mentions),
      byComplaintRate: rankByComplaintRate(seriesStats),
      attributedPct: pct(complaints.filter((r) => !!r.product_line).length, complaints.length),
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
