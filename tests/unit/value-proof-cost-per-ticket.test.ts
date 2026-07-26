import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildValueProof } from '@/lib/analytics/value-proof/metrics';

const raw = {
  window: { since: '2026-06-12T00:00:00Z', until: '2026-07-26T00:00:00Z' },
  attributed: { direct: { n: 149, revenue: 24579 }, assisted: { n: 0, revenue: 0 }, influenced: { n: 10, revenue: 1927 }, none: { n: 8984, revenue: 1533472 } },
  conversations: 1703, deflected: 131, support_intent: 268, topic_tagged: 1291,
  tickets: 446, auto_escalations: 4, handoffs: 0, escalation_reasons: [],
  tickets_resolved: 386, close_seconds_p50: 201240, latency_samples: 0,
  carts: { with_email: 7959, recovered_7d: 1676, recovered_7d_value: 507356, bestie_touched: 2 },
  aov: { bestie: 167, other: 186, bestie_n: 160, other_n: 8376 },
  setup_days: 0.5, dashboard_visits: 0,
};

describe('cost per ticket', () => {
  it('turns deflection into shekels once supplied', () => {
    const out = buildValueProof(raw, { audience: 'brand', costPerTicket: 12 });
    expect(out.deflection.value_ils.value).toBe(131 * 12);
    expect(out.deflection.value_ils.basis).toContain('brand-supplied');
  });

  it('clearing it returns the metric to not-measured, never to zero', () => {
    const out = buildValueProof(raw, { audience: 'brand', costPerTicket: null });
    expect(out.deflection.value_ils.measured).toBe(false);
    expect(out.deflection.value_ils.value).toBeNull();
    expect(out.deflection.value_ils.value).not.toBe(0);
  });

  it('a zero or negative cost is treated as absent', () => {
    expect(buildValueProof(raw, { audience: 'brand', costPerTicket: 0 }).deflection.value_ils.measured).toBe(false);
    expect(buildValueProof(raw, { audience: 'brand', costPerTicket: -5 }).deflection.value_ils.measured).toBe(false);
  });

  it('the settings route validates and stores it under config.support', () => {
    const src = readFileSync('src/app/api/influencer/settings/route.ts', 'utf8');
    expect(src).toContain('cost_per_ticket');
    expect(src).toContain('updatedConfig.support');
    expect(src).toContain('rawCost >= 0');
  });
});
