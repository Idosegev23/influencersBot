import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildValueProof } from '@/lib/analytics/value-proof/metrics';

const raw = {
  window: { since: '2026-06-12T00:00:00Z', until: '2026-07-26T00:00:00Z' },
  attributed: {
    direct: { n: 149, revenue: 24579 }, assisted: { n: 0, revenue: 0 },
    influenced: { n: 10, revenue: 1927 }, none: { n: 8984, revenue: 1533472 },
  },
  conversations: 1703, deflected: 131, support_intent: 268, topic_tagged: 1291,
  tickets: 446, auto_escalations: 4, handoffs: 0,
  escalation_reasons: [{ reason: 'human_demand', n: 3 }],
  tickets_resolved: 386, close_seconds_p50: 201240, latency_samples: 0,
  carts: { with_email: 7959, recovered_7d: 1676, recovered_7d_value: 507356, bestie_touched: 2 },
  aov: { bestie: 167, other: 186, bestie_n: 160, other_n: 8376 },
  setup_days: 0.5, dashboard_visits: 0,
};

describe('brand audience payload', () => {
  it('omits the three internal-only metrics entirely', () => {
    const brand: any = buildValueProof(raw, { audience: 'brand', costPerTicket: 12 });
    expect(brand.accuracy).toBeUndefined();
    expect(brand.setup).toBeUndefined();
    expect(brand.clientUsage).toBeUndefined();
    // Serialised, not just undefined on the object — nothing internal leaks.
    const json = JSON.stringify(brand);
    expect(json).not.toContain('staffHours');
    expect(json).not.toContain('dashboard_visit');
    expect(json).not.toContain('sampling process');
  });

  it('still includes the escalation rate — the honesty metric is shown to the brand', () => {
    const brand: any = buildValueProof(raw, { audience: 'brand', costPerTicket: 12 });
    expect(brand.escalation.gaveUpRate.measured).toBe(true);
    expect(brand.escalation.anyHumanRate.measured).toBe(true);
    expect(brand.escalation.byReason.measured).toBe(true);
  });

  it('the admin payload does carry all three', () => {
    const admin: any = buildValueProof(raw, { audience: 'admin', costPerTicket: 12 });
    expect(admin.accuracy).toBeDefined();
    expect(admin.setup).toBeDefined();
    expect(admin.clientUsage).toBeDefined();
  });

  it('the brand route resolves the account from the session, never from a query param', () => {
    // An IDOR of exactly this shape was found and fixed on dm-settings.
    const src = readFileSync('src/app/api/influencer/[username]/analytics/value-proof/route.ts', 'utf8');
    expect(src).toContain('checkInfluencerAuth(username)');
    expect(src).toContain("audience: 'brand'");
    expect(src).not.toContain("searchParams.get('accountId')");
  });
});
