import { describe, it, expect } from 'vitest';
import { scoreMoney, scoreLeak } from '../../eval/agent-wa/score';
import { loadGolden, runGolden, extractMoneyFromText } from '../../eval/agent-wa/runner';

// ── Pure scorers ──────────────────────────────────────────────────────────────
describe('eval money scorer (pure, zero tolerance)', () => {
  it('passes on exact match, fails on any diff', () => {
    expect(scoreMoney({ total: 94400 }, { total: 94400 }).pass).toBe(true);
    expect(scoreMoney({ total: 94400 }, { total: 94399 }).pass).toBe(false);
    expect(scoreMoney({ total: 100000, lineItems: [80000, 20000] }, { total: 100000, lineItems: [80000, 20000] }).pass).toBe(true);
    expect(scoreMoney({ total: 100000, lineItems: [80000, 20000] }, { total: 100000, lineItems: [80000, 19999] }).pass).toBe(false);
    // length mismatch is a fail too
    expect(scoreMoney({ total: 100000, lineItems: [80000, 20000] }, { total: 100000, lineItems: [100000] }).pass).toBe(false);
  });
});

describe('eval leak scorer', () => {
  it('flags an internal id or another agent talent leaking into the reply', () => {
    expect(scoreLeak('הבנתי: אנה · קוקה-קולה · 80,000 ₪', ['brief_id', 'uuid']).pass).toBe(true);
    expect(scoreLeak('brief_id=abc123 עודכן', ['brief_id']).pass).toBe(false);
    expect(scoreLeak('brief_id=abc123 עודכן', ['brief_id']).leaked).toEqual(['brief_id']);
  });
});

// ── Deterministic extractor cross-check (adapted to the SHIPPED P0 API) ─────────
// Plan predates repo: the live normalizeAmount(value:number, opts) returns an object,
// so the shorthand ground truth is exercised through the extractor built on it.
describe('golden money cases resolve to exact amounts via the P0-backed extractor', () => {
  it('80 → 80000, מאתיים אלף → 200000, 80,000 → 80000', () => {
    expect(extractMoneyFromText('80')).toEqual({ total: 80000 });
    expect(extractMoneyFromText('מאתיים אלף')).toEqual({ total: 200000 });
    expect(extractMoneyFromText('80,000')).toEqual({ total: 80000 });
  });
  it('splits a single-voice multi-line brief into exact line items', () => {
    expect(extractMoneyFromText('לאנה 80 לרילס 20 לזכויות')).toEqual({ total: 100000, lineItems: [80000, 20000] });
  });
});

// ── CI GATE: every money golden case must pass with ZERO mismatches ─────────────
describe('agent-wa golden money gate (zero tolerance)', () => {
  it('runs the deterministic money path over the golden set — no mismatches allowed', async () => {
    const cases = loadGolden();
    expect(cases.length).toBeGreaterThan(0);

    const rows = await runGolden(cases, { extractMoney: extractMoneyFromText });

    const moneyFailures = rows.filter((r) => r.money && !r.money.pass);
    if (moneyFailures.length) {
      const detail = moneyFailures.map((r) => `${r.id}: ${r.money!.diffs.join('; ')}`).join('\n');
      throw new Error(`Money exactness gate FAILED:\n${detail}`);
    }
    expect(moneyFailures).toHaveLength(0);

    // At least the money scenarios listed in the plan must actually be present + scored.
    const scoredMoney = rows.filter((r) => r.money);
    expect(scoredMoney.length).toBeGreaterThanOrEqual(5);

    // No golden input text may itself carry a leak token it declares off-limits.
    const leakFailures = rows.filter((r) => r.leak && !r.leak.pass);
    expect(leakFailures).toHaveLength(0);
  });
});
