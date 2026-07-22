import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { rows: [] as any[], updateResult: [{ wa_id: 'x' }] };

vi.mock('@/lib/supabase', () => {
  const from = () => {
    const ctx: any = {};
    ctx.select = () => ctx;
    ctx.eq = () => ctx;
    ctx.maybeSingle = async () => ({ data: state.rows[0] ?? null, error: null });
    ctx.single = async () => ({ data: state.insertRow, error: null });
    ctx.insert = (row: any) => { state.insertRow = { ...row }; return ctx; };
    ctx.update = (patch: any) => { state.lastPatch = patch; return ctx; };
    // update().eq().eq().select() → resolves to updated rows (thenable)
    ctx.then = (resolve: any) => resolve({ data: state.updateResult, error: null });
    return ctx;
  };
  return { supabase: { from } };
});

describe('cs-session store', () => {
  beforeEach(() => { state.rows = []; state.insertRow = null; state.updateResult = [{ wa_id: 'x' }]; });

  it('isWarm true when last activity < 45 min', async () => {
    const { isWarm, WARM_WINDOW_MS } = await import('@/lib/cs/cs-session');
    expect(WARM_WINDOW_MS).toBe(45 * 60 * 1000);
    const now = Date.parse('2026-07-21T10:00:00Z');
    const warm = { last_activity_at: '2026-07-21T09:40:00Z' } as any;
    const cold = { last_activity_at: '2026-07-21T09:00:00Z' } as any;
    expect(isWarm(warm, now)).toBe(true);
    expect(isWarm(cold, now)).toBe(false);
  });

  it('createCsSession inserts an onboarding-phase row', async () => {
    const { createCsSession } = await import('@/lib/cs/cs-session');
    const row = await createCsSession('972500000000', 'contact-1');
    expect(state.insertRow).toMatchObject({ wa_id: '972500000000', contact_id: 'contact-1', phase: 'onboarding', version: 0 });
    expect(row.wa_id).toBe('972500000000');
  });

  it('saveCsSession returns true when a row was updated (version matched)', async () => {
    const { saveCsSession } = await import('@/lib/cs/cs-session');
    const prev = { wa_id: 'x', version: 2, phase: 'onboarding' } as any;
    const ok = await saveCsSession(prev, { phase: 'serving', active_account_id: 'acc-1' });
    expect(state.lastPatch).toMatchObject({ phase: 'serving', active_account_id: 'acc-1', version: 3 });
    expect(ok).toBe(true);
  });

  it('saveCsSession returns false on a version conflict (no rows updated)', async () => {
    state.updateResult = [];
    const { saveCsSession } = await import('@/lib/cs/cs-session');
    const ok = await saveCsSession({ wa_id: 'x', version: 2 } as any, { phase: 'serving' });
    expect(ok).toBe(false);
  });
});
