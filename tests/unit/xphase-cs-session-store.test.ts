import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeSupabase(affected: number) {
  const api: any = {
    from() {
      const ctx: any = {};
      ctx.update = () => ctx; ctx.eq = () => ctx;
      // final eq resolves the update; select().then simulates rows-affected
      ctx.select = () => ({ then: (resolve: any) => resolve({ data: new Array(affected).fill({}), error: null }) });
      ctx.then = (resolve: any) => resolve({ data: new Array(affected).fill({}), error: null });
      return ctx;
    },
  };
  return api;
}

describe('cs-session store (isWarm + optimistic version)', () => {
  beforeEach(() => vi.resetModules());

  it('isWarm is true within WARM_WINDOW_MS and false after', async () => {
    // cs-session.ts imports the real @/lib/supabase at module top; mock it so the import
    // doesn't hit the real client (which throws on missing env vars under vitest).
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSupabase(1) }));
    const { isWarm, WARM_WINDOW_MS } = await import('@/lib/cs/cs-session');
    const now = Date.parse('2026-07-21T12:00:00Z');
    const warm: any = { last_activity_at: new Date(now - 10 * 60 * 1000).toISOString() };
    const cold: any = { last_activity_at: new Date(now - (WARM_WINDOW_MS + 1000)).toISOString() };
    expect(isWarm(warm, now)).toBe(true);
    expect(isWarm(cold, now)).toBe(false);
  });

  it('saveCsSession succeeds when the version row is updated', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSupabase(1) }));
    const { saveCsSession } = await import('@/lib/cs/cs-session');
    const prev: any = { wa_id: '972501234567', version: 3, phase: 'onboarding' };
    const ok = await saveCsSession(prev, { phase: 'serving' });
    expect(ok).toBe(true);
  });

  it('saveCsSession returns false on a version conflict (0 rows updated)', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSupabase(0) }));
    const { saveCsSession } = await import('@/lib/cs/cs-session');
    const prev: any = { wa_id: '972501234567', version: 3, phase: 'onboarding' };
    const ok = await saveCsSession(prev, { phase: 'serving' });
    expect(ok).toBe(false);
  });
});
