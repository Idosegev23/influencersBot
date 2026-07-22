import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeSupabase(row: any) {
  const updates: any[] = [];
  const api: any = {
    updates,
    from() {
      const ctx: any = {};
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.maybeSingle = async () => ({ data: row, error: null });
      ctx.update = (patch: any) => {
        updates.push(patch);
        return { eq: async () => ({ data: null, error: null }) };
      };
      return ctx;
    },
  };
  return api;
}

describe('bot-pause', () => {
  beforeEach(() => vi.resetModules());

  it('isBotPaused reads chat_sessions.bot_paused', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSupabase({ bot_paused: true }) }));
    const { isBotPaused } = await import('@/lib/handoff/bot-pause');
    expect(await isBotPaused('cs-1')).toBe(true);
  });

  it('isBotPaused returns false for empty id (no query)', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSupabase(null) }));
    const { isBotPaused } = await import('@/lib/handoff/bot-pause');
    expect(await isBotPaused('')).toBe(false);
  });

  it('pauseBot sets all three columns', async () => {
    const sb = makeSupabase(null);
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { pauseBot } = await import('@/lib/handoff/bot-pause');
    await pauseBot('cs-1', 'human_reply');
    expect(sb.updates[0].bot_paused).toBe(true);
    expect(sb.updates[0].bot_paused_reason).toBe('human_reply');
    expect(sb.updates[0].bot_paused_at).toBeTruthy();
  });

  it('resumeBot clears all three columns', async () => {
    const sb = makeSupabase(null);
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { resumeBot } = await import('@/lib/handoff/bot-pause');
    await resumeBot('cs-1');
    expect(sb.updates[0]).toEqual({ bot_paused: false, bot_paused_at: null, bot_paused_reason: null });
  });
});
