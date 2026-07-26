/**
 * The honesty layer. Every number leaves here wrapped in a Metric envelope, so
 * the UI can render "not measured" instead of a zero that reads like a result.
 *
 * Three rules are enforced HERE rather than trusted to callers:
 *  1. A metric with no data source reports measured:false and value:null.
 *  2. A comparison whose two sides do not share a start date is not measured —
 *     this is the exact error that produced a flattering +2.5% AOV instead of
 *     the real -4.8% (see spec §1.3).
 *  3. n < 30 sets lowConfidence so the UI can print n beside the percentage.
 */
import { LOW_CONFIDENCE_N, type Metric } from './types';

export function metric<T>(value: T | null, n: number, basis: string): Metric<T> {
  if (value === null || value === undefined) return notMeasured<T>(basis);
  return { value, n, measured: true, lowConfidence: n < LOW_CONFIDENCE_N, basis };
}

/**
 * Generic so callers get a Metric of the right shape without casting. The value
 * is always null — that is the whole point: an unmeasured metric must be
 * distinguishable from a measured zero.
 */
export function notMeasured<T = number>(basis: string): Metric<T> {
  return { value: null, n: 0, measured: false, lowConfidence: false, basis };
}

export interface ComparisonSide { value: number; n: number; from: string }
export interface Comparison { withChat: number; without: number; deltaPct: number }

/**
 * Both sides MUST start on the same date. An unmatched window measures the
 * campaign calendar, not Bestie, so it is refused rather than reported.
 */
export function matchedComparison(a: ComparisonSide, b: ComparisonSide, basis: string): Metric<Comparison> {
  if (a.from !== b.from) {
    return notMeasured<Comparison>(`${basis} — windows not matched (${a.from} vs ${b.from})`);
  }
  if (!(b.value > 0)) return notMeasured<Comparison>(`${basis} — no comparison baseline`);
  return metric<Comparison>(
    { withChat: a.value, without: b.value, deltaPct: (a.value / b.value - 1) * 100 },
    Math.min(a.n, b.n),
    `${basis} — both sides from ${a.from}`,
  );
}

export type TierKey = 'direct' | 'assisted' | 'influenced';

export interface ValueProofSummary {
  window: { since: string; until: string };
  revenue: {
    byTier: Record<TierKey, Metric<number>>;
    orders: Record<TierKey, Metric<number>>;
    total: Metric<number>;
  };
  conversion: Metric<number>;
  aov: Metric<Comparison>;
  carts: {
    recoveryRate: Metric<number>;
    recoveredValue: Metric<number>;
    bestieTouched: Metric<number>;
    platformBaseline: Metric<number>;
  };
  deflection: { rate: Metric<number>; value_ils: Metric<number> };
  responseTime: { firstResponse: Metric<number>; timeToClose: Metric<number> };
  escalation: {
    gaveUpRate: Metric<number>;
    anyHumanRate: Metric<number>;
    byReason: Metric<Array<{ reason: string; n: number }>>;
  };
  accuracy?: Metric<number>;
  setup?: { days: Metric<number>; staffHours: Metric<number> };
  clientUsage?: Metric<number>;
}

const day = (iso: string) => String(iso).slice(0, 10);
const num = (v: unknown) => (Number(v) || 0);

export function buildValueProof(
  raw: any,
  opts: { audience: 'admin' | 'brand'; costPerTicket: number | null }
): ValueProofSummary {
  const since = day(raw?.window?.since ?? '');

  // A tier with no rows means we could not SEE it, not that it earned nothing.
  // The RPC's left join yields {n: null} for an empty tier, so coerce before testing.
  const tierRows = (tier: TierKey) => {
    const t = raw?.attributed?.[tier];
    return { n: num(t?.n), revenue: num(t?.revenue) };
  };
  const tierRevenue = (tier: TierKey): Metric<number> => {
    const t = tierRows(tier);
    if (t.n === 0) return notMeasured(`${tier} tier — no attributable rows in window`);
    return metric(t.revenue, t.n, `${tier} tier`);
  };
  const tierOrders = (tier: TierKey): Metric<number> => {
    const t = tierRows(tier);
    if (t.n === 0) return notMeasured(`${tier} tier — no attributable rows in window`);
    return metric(t.n, t.n, `${tier} tier`);
  };

  const tiers: TierKey[] = ['direct', 'assisted', 'influenced'];
  const attributedOrders = tiers.reduce((s, t) => s + tierRows(t).n, 0);
  const attributedRevenue = tiers.reduce((s, t) => s + tierRows(t).revenue, 0);

  const conversations = num(raw?.conversations);
  const supportIntent = num(raw?.support_intent);
  const cartsWithEmail = num(raw?.carts?.with_email);

  const summary: ValueProofSummary = {
    window: { since: raw?.window?.since, until: raw?.window?.until },

    revenue: {
      byTier: { direct: tierRevenue('direct'), assisted: tierRevenue('assisted'), influenced: tierRevenue('influenced') },
      orders: { direct: tierOrders('direct'), assisted: tierOrders('assisted'), influenced: tierOrders('influenced') },
      total: metric(
        attributedRevenue,
        attributedOrders,
        'sum of direct + assisted + influenced — always shown with the per-tier breakdown',
      ),
    },

    conversion: conversations > 0
      ? metric(attributedOrders / conversations, conversations, 'attributed orders / conversations with >=1 user message')
      : notMeasured('no conversations in window'),

    aov: matchedComparison(
      { value: num(raw?.aov?.bestie), n: num(raw?.aov?.bestie_n), from: since },
      { value: num(raw?.aov?.other), n: num(raw?.aov?.other_n), from: since },
      'AOV',
    ),

    carts: {
      recoveryRate: cartsWithEmail > 0
        ? metric(num(raw.carts.recovered_7d) / cartsWithEmail, cartsWithEmail, 'derived: same email placed a paid non-POS order within 7d')
        : notMeasured('no carts with an email'),
      recoveredValue: cartsWithEmail > 0
        ? metric(num(raw.carts.recovered_7d_value), num(raw.carts.recovered_7d), 'cart subtotal of carts recovered within 7d')
        : notMeasured('no carts with an email'),
      bestieTouched: cartsWithEmail > 0
        ? metric(num(raw.carts.bestie_touched), num(raw.carts.recovered_7d), 'recovered carts with a Bestie touch between abandonment and purchase')
        : notMeasured('no carts with an email'),
      // QuickShop never populates recovered_at (14,416 rows checked 2026-07-26).
      platformBaseline: notMeasured('QuickShop /abandoned-carts returns recovered_at=null on every row'),
    },

    // Denominator is SUPPORT-INTENT conversations, never all traffic. An account
    // whose sessions carry no classified topics cannot be measured here at all.
    deflection: {
      rate: supportIntent > 0
        ? metric(num(raw.deflected) / supportIntent, supportIntent,
            `support-intent conversations closed with no ticket — upper bound, chat_handoffs has ${num(raw?.handoffs)} rows`)
        : notMeasured(
            num(raw?.topic_tagged) > 0
              ? 'no support-intent conversations in window'
              : 'no classified topics on any session — support intent cannot be identified',
          ),
      value_ils: opts.costPerTicket && opts.costPerTicket > 0 && supportIntent > 0
        ? metric(num(raw.deflected) * opts.costPerTicket, num(raw.deflected),
            `deflected support-intent conversations x cost per ticket (₪${opts.costPerTicket}, brand-supplied)`)
        : notMeasured('cost per ticket not supplied by the brand'),
    },

    responseTime: {
      // chat_messages.created_at is a WRITE time, not a send time — 75% of pairs
      // are sub-second, which is impossible for a real model response.
      firstResponse: num(raw?.latency_samples) > 0
        ? metric(num(raw.latency_p50_ms), num(raw.latency_samples), 'median metadata.latency_ms on assistant messages')
        : notMeasured('no latency_ms samples yet — chat_messages timestamps are write times'),
      timeToClose: num(raw?.tickets_resolved) > 0
        ? metric(num(raw.close_seconds_p50), num(raw.tickets_resolved), 'median ticket created_at -> resolved_at')
        : notMeasured('no resolved tickets in window'),
    },

    escalation: {
      gaveUpRate: conversations > 0
        ? metric(num(raw.auto_escalations) / conversations, conversations, "support_requests where source='auto_escalation'")
        : notMeasured('no conversations in window'),
      anyHumanRate: conversations > 0
        ? metric(num(raw.tickets) / conversations, conversations, 'any support ticket / conversations')
        : notMeasured('no conversations in window'),
      byReason: (raw?.escalation_reasons || []).length > 0
        ? metric(
            raw.escalation_reasons,
            raw.escalation_reasons.reduce((s: number, r: any) => s + num(r.n), 0),
            'support_requests.escalation_reason',
          )
        : notMeasured<Array<{ reason: string; n: number }>>('no escalation triggers recorded in window'),
    },
  };

  if (opts.audience === 'admin') {
    summary.accuracy = notMeasured('no sampling process — separate project');
    summary.setup = {
      days: metric(num(raw?.setup_days), 1, 'accounts.created_at -> first answered message'),
      staffHours: notMeasured('never recorded'),
    };
    summary.clientUsage = num(raw?.dashboard_visits) > 0
      ? metric(num(raw.dashboard_visits), num(raw.dashboard_visits), 'dashboard_visit events in window')
      : notMeasured('no dashboard_visit events recorded yet');
  }

  return summary;
}
