import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Budget alerting, three layers, as chosen after the 2026-07-25 incident:
 *   session  > $5   — catches the exact failure mode (one runaway chained conversation)
 *   account  > $20  — catches a bad day concentrated on one brand
 *   org/day  > $80  — catches a slow leak spread across many sessions
 * Each with a 1h cooldown so a bad day sends 3 emails, not 300.
 */

const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));

const sendAdminAlert = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/email', () => ({ sendAdminAlert }));

// Running totals are kept in Redis as integer MICRO-DOLLARS (1e-6 USD): `redisIncrBy` is
// integer-only, and cents would round a $0.02 turn away to nothing.
let redisStore: Record<string, number> = {};
vi.mock('@/lib/redis', () => ({
  isRedisAvailable: () => true,
  redisGet: vi.fn(async (k: string) => redisStore[k] ?? null),
  redisSet: vi.fn(async (k: string, v: any) => { redisStore[k] = v; }),
  redisExpire: vi.fn(async () => true),
  redisIncrBy: vi.fn(async (k: string, by: number) => {
    redisStore[k] = (redisStore[k] ?? 0) + by;
    return redisStore[k];
  }),
}));

const TURN = {
  accountId: 'acc-1',
  sessionId: 'sess-1',
  usage: { model: 'gpt-5.4', inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 500 },
};

beforeEach(() => {
  vi.clearAllMocks();
  redisStore = {};
});

describe('recordTurnCost — accounting', () => {
  it('writes the turn to cost_tracking via the increment_cost RPC', async () => {
    const { recordTurnCost } = await import('@/lib/costs/recorder');
    await recordTurnCost(TURN);
    expect(rpc).toHaveBeenCalledWith('increment_cost', expect.objectContaining({
      p_account_id: 'acc-1',
      p_period_type: 'day',
    }));
    const args = rpc.mock.calls[0][1];
    expect(args.p_tokens).toBe(10_500);
    expect(args.p_cost).toBeGreaterThan(0);
  });

  it('is a no-op for a turn with no usage — never writes a zero row', async () => {
    const { recordTurnCost } = await import('@/lib/costs/recorder');
    await recordTurnCost({ ...TURN, usage: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never throws — cost accounting must not break a chat turn', async () => {
    rpc.mockRejectedValueOnce(new Error('db down'));
    const { recordTurnCost } = await import('@/lib/costs/recorder');
    await expect(recordTurnCost(TURN)).resolves.toBeUndefined();
  });
});

describe('recordTurnCost — session alert (>$5)', () => {
  it('stays quiet for an ordinary turn', async () => {
    const { recordTurnCost } = await import('@/lib/costs/recorder');
    await recordTurnCost(TURN);
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });

  it('fires once a single session crosses $5', async () => {
    const { recordTurnCost, SESSION_ALERT_USD } = await import('@/lib/costs/recorder');
    expect(SESSION_ALERT_USD).toBe(5);
    // 143K input on gpt-5.4 long-context ≈ $0.72/turn — the shape of the incident.
    const big = { ...TURN, usage: { model: 'gpt-5.4', inputTokens: 143_000, cachedInputTokens: 0, outputTokens: 500 } };
    for (let i = 0; i < 8; i++) await recordTurnCost(big);
    expect(sendAdminAlert).toHaveBeenCalled();
    const call = sendAdminAlert.mock.calls[0][0];
    expect(call.level).toBe('warning');
    expect(`${call.subject} ${call.message}`).toContain('sess-1');
  });

  it('alerts only once per session despite further expensive turns (cooldown)', async () => {
    const { recordTurnCost } = await import('@/lib/costs/recorder');
    const big = { ...TURN, usage: { model: 'gpt-5.4', inputTokens: 143_000, cachedInputTokens: 0, outputTokens: 500 } };
    for (let i = 0; i < 20; i++) await recordTurnCost(big);
    const sessionAlerts = sendAdminAlert.mock.calls.filter(c => `${c[0].subject}`.includes('שיחה'));
    expect(sessionAlerts).toHaveLength(1);
  });
});

describe('recordTurnCost — account alert (>$20/day)', () => {
  it('fires when one account crosses the daily threshold', async () => {
    const { recordTurnCost, ACCOUNT_DAILY_ALERT_USD } = await import('@/lib/costs/recorder');
    expect(ACCOUNT_DAILY_ALERT_USD).toBe(20);
    // The RPC reports the running daily total for the account.
    rpc.mockResolvedValue({ data: [{ new_tokens: 1, new_cost: '21.5', budget_limit: null, over_budget: false }], error: null });
    await recordTurnCost(TURN);
    const acc = sendAdminAlert.mock.calls.find(c => `${c[0].subject}`.includes('חשבון'));
    expect(acc).toBeTruthy();
    expect(acc![0].level).toBe('warning');
  });

  it('stays quiet below the threshold', async () => {
    const { recordTurnCost } = await import('@/lib/costs/recorder');
    rpc.mockResolvedValue({ data: [{ new_tokens: 1, new_cost: '3.10', budget_limit: null, over_budget: false }], error: null });
    await recordTurnCost(TURN);
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });
});

describe('recordTurnCost — org alert (>$80/day)', () => {
  it('fires when the org-wide daily total crosses the threshold', async () => {
    const { recordTurnCost, ORG_DAILY_ALERT_USD } = await import('@/lib/costs/recorder');
    expect(ORG_DAILY_ALERT_USD).toBe(80);
    const big = { ...TURN, usage: { model: 'gpt-5.4', inputTokens: 143_000, cachedInputTokens: 0, outputTokens: 500 } };
    // ~$0.72/turn — 120 turns clears $80 org-wide.
    for (let i = 0; i < 120; i++) await recordTurnCost({ ...big, sessionId: `s-${i}` });
    const org = sendAdminAlert.mock.calls.find(c => `${c[0].subject}`.includes('יומי'));
    expect(org).toBeTruthy();
    expect(org![0].level).toBe('critical');
  });
});
