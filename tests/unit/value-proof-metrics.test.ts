import { describe, it, expect } from 'vitest';
import { metric, notMeasured, matchedComparison, buildValueProof } from '@/lib/analytics/value-proof/metrics';

describe('metric envelope', () => {
  it('marks n<30 as low confidence but still reports the value', () => {
    const m = metric(0.224, 17, 'attributed orders / conversations');
    expect(m.measured).toBe(true);
    expect(m.lowConfidence).toBe(true);
    expect(m.value).toBe(0.224);
    expect(m.n).toBe(17);
  });

  it('does not flag n>=30', () => {
    expect(metric(0.095, 1703, 'x').lowConfidence).toBe(false);
  });

  it('notMeasured is null, never zero', () => {
    const m = notMeasured('chat_handoffs is empty — feature not built');
    expect(m.measured).toBe(false);
    expect(m.value).toBeNull();
    expect(m.value).not.toBe(0);
  });

  it('a comparison across mismatched windows is not measured', () => {
    const m = matchedComparison(
      { value: 165.0, n: 149, from: '2026-06-12' },
      { value: 160.9, n: 26056, from: '2026-01-07' },
      'AOV',
    );
    expect(m.measured).toBe(false);
    expect(m.value).toBeNull();
  });

  it('a period-matched comparison reports the delta', () => {
    const m = matchedComparison(
      { value: 165.0, n: 149, from: '2026-06-12' },
      { value: 173.3, n: 8996, from: '2026-06-12' },
      'AOV',
    );
    expect(m.measured).toBe(true);
    expect(m.value!.deltaPct).toBeCloseTo(-4.79, 1);
    expect(m.value!.withChat).toBe(165.0);
  });
});

const raw = {
  window: { since: '2026-06-12T00:00:00Z', until: '2026-07-26T00:00:00Z' },
  attributed: {
    direct: { n: 149, revenue: 24579 }, assisted: { n: 0, revenue: 0 },
    influenced: { n: 10, revenue: 1927 }, none: { n: 8984, revenue: 1533472 },
  },
  conversations: 1703,
  deflected: 131,
  support_intent: 268,
  topic_tagged: 1291,
  tickets: 446,
  auto_escalations: 4,
  handoffs: 0,
  escalation_reasons: [],
  tickets_resolved: 386,
  close_seconds_p50: 201240,
  latency_samples: 0,
  carts: { with_email: 7959, recovered_7d: 1676, recovered_7d_value: 507356, bestie_touched: 5 },
  aov: { bestie: 165.0, other: 173.3, bestie_n: 149, other_n: 8996 },
  setup_days: 1,
  dashboard_visits: 0,
};

describe('buildValueProof', () => {
  it('reports the three tiers separately and never as one number', () => {
    const out = buildValueProof(raw, { audience: 'admin', costPerTicket: null });
    expect(out.revenue.byTier.direct.value).toBe(24579);
    expect(out.revenue.byTier.assisted.measured).toBe(false);
    expect(out.revenue.byTier.influenced.value).toBe(1927);
    expect(out.revenue.total.value).toBe(26506);
    expect(out.revenue.total.basis).toContain('direct');
  });

  it('a tier the RPC returns as null is not measured', () => {
    const nulled = { ...raw, attributed: { ...raw.attributed, assisted: { n: null, revenue: null } } };
    expect(buildValueProof(nulled, { audience: 'admin', costPerTicket: null }).revenue.byTier.assisted.measured).toBe(false);
  });

  it('deflection divides by support-intent conversations, not all traffic', () => {
    const out = buildValueProof(raw, { audience: 'admin', costPerTicket: 12 });
    expect(out.deflection.rate.value).toBeCloseTo(131 / 268, 4);
    expect(out.deflection.rate.n).toBe(268);
    expect(out.deflection.value_ils.value).toBe(131 * 12);
  });

  it('an account with no classified topics cannot report deflection at all', () => {
    const untagged = { ...raw, support_intent: 0, topic_tagged: 0 };
    const out = buildValueProof(untagged, { audience: 'admin', costPerTicket: 12 });
    expect(out.deflection.rate.measured).toBe(false);
    expect(out.deflection.rate.basis).toContain('no classified topics');
    expect(out.deflection.value_ils.measured).toBe(false);
  });

  it('deflection in shekels is not measured until cost per ticket is supplied', () => {
    expect(buildValueProof(raw, { audience: 'admin', costPerTicket: null }).deflection.value_ils.measured).toBe(false);
  });

  it('first-response latency is not measured when there are no latency samples', () => {
    expect(buildValueProof(raw, { audience: 'admin', costPerTicket: null }).responseTime.firstResponse.measured).toBe(false);
  });

  it('escalation reasons are not measured when none are recorded', () => {
    expect(buildValueProof(raw, { audience: 'admin', costPerTicket: null }).escalation.byReason.measured).toBe(false);
  });

  it('the platform cart baseline is always unmeasured — QuickShop never sends it', () => {
    const out = buildValueProof(raw, { audience: 'admin', costPerTicket: null });
    expect(out.carts.platformBaseline.measured).toBe(false);
    expect(out.carts.recoveryRate.value).toBeCloseTo(1676 / 7959, 4);
  });

  it('the brand audience never receives accuracy, setup time, or usage', () => {
    const brand = buildValueProof(raw, { audience: 'brand', costPerTicket: 12 }) as any;
    expect(brand.accuracy).toBeUndefined();
    expect(brand.setup).toBeUndefined();
    expect(brand.clientUsage).toBeUndefined();
    expect(brand.revenue).toBeDefined();
    expect(brand.escalation).toBeDefined();
    expect(JSON.stringify(brand)).not.toContain('staffHours');
  });
});
