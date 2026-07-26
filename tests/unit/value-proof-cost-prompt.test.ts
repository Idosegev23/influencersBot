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

describe('cost-per-ticket inline prompt', () => {
  it('the saved cost is recoverable from the payload so the input can prefill', () => {
    // The prompt divides value_ils by its n to show what the brand entered.
    const out = buildValueProof(raw, { audience: 'brand', costPerTicket: 12.5 });
    const m = out.deflection.value_ils;
    expect(m.measured).toBe(true);
    expect(m.n).toBe(131);
    expect(m.value! / m.n).toBeCloseTo(12.5, 4);
  });

  it('the prompt is excluded from the printed report', () => {
    const src = readFileSync('src/app/influencer/[username]/analytics/CostPerTicketPrompt.tsx', 'utf8');
    expect(src).toContain('vp-no-print');
    const css = readFileSync('src/components/value-proof/value-proof.css', 'utf8');
    expect(css).toContain('.vp-no-print { display: none !important; }');
  });

  it('the prompt posts only the cost, so no other setting is overwritten', () => {
    const src = readFileSync('src/app/influencer/[username]/analytics/CostPerTicketPrompt.tsx', 'utf8');
    expect(src).toContain('JSON.stringify({ username, cost_per_ticket: parsed })');
  });
});
