import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeSupabase(opts: { config?: any; recent?: any[] } = {}) {
  const inserts: any[] = [];
  const api: any = {
    inserts,
    from(table: string) {
      const ctx: any = { table };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.gte = () => ctx;
      ctx.order = () => ctx;
      ctx.limit = () => ctx;
      ctx.single = async () =>
        table === 'accounts' ? { data: { config: opts.config ?? {} }, error: null } : { data: null, error: null };
      ctx.insert = async (row: any) => { inserts.push({ table, row }); return { data: null, error: null }; };
      ctx.then = (resolve: any) =>
        resolve({ data: table === 'support_requests' ? (opts.recent ?? []) : [], error: null });
      return ctx;
    },
  };
  return api;
}

describe('runCsHandoffCheck', () => {
  beforeEach(() => { vi.resetModules(); process.env.ESCALATION_ENABLED = 'true'; });

  it('is a no-op when the flag is off', async () => {
    process.env.ESCALATION_ENABLED = 'false';
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'החזר כספי' },
      { supabase: makeSupabase() as any, sendEmail: vi.fn() as any, pauseBot: vi.fn() as any, now: () => 0 },
    );
    expect(r).toEqual({ escalated: false, skipped: 'flag_off' });
  });

  it('does nothing when no trigger fires', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const pauseBot = vi.fn();
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'מתי יגיע?' },
      { supabase: makeSupabase({ config: { escalation: { enabled: true } } }) as any, sendEmail: vi.fn() as any, pauseBot: pauseBot as any, now: () => 0 },
    );
    expect(r.escalated).toBe(false);
    expect(pauseBot).not.toHaveBeenCalled();
  });

  it('on trigger: pauses bot, emails a recipient, and writes an audit row', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const pauseBot = vi.fn();
    const sendEmail = vi.fn().mockResolvedValue({ success: true });
    const sb = makeSupabase({
      config: { escalation: { enabled: true, recipients: [{ name: 'Rep', email: 'rep@brand.co' }] } },
    });
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'המוצר הגיע שבור, אני רוצה החזר כספי' },
      { supabase: sb as any, sendEmail: sendEmail as any, pauseBot: pauseBot as any, now: () => 0 },
    );
    expect(r.escalated).toBe(true);
    expect(pauseBot).toHaveBeenCalledWith('cs1', expect.stringContaining('handoff'));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const audit = sb.inserts.find((i: any) => i.table === 'support_requests');
    expect(audit.row.source).toBe('auto_escalation');
    expect(audit.row.metadata.escalation.origin).toBe('whatsapp_cs');
  });

  it('dedups a second alert inside the window', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const sb = makeSupabase({ config: { escalation: { enabled: true } }, recent: [{ id: 'x' }] });
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'החזר כספי' },
      { supabase: sb as any, sendEmail: vi.fn() as any, pauseBot: vi.fn() as any, now: () => 0 },
    );
    expect(r).toEqual({ escalated: false, deduped: true });
  });

  it('force bypasses re-detection and escalates even on a message with no trigger keywords', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const pauseBot = vi.fn();
    const sendEmail = vi.fn().mockResolvedValue({ success: true });
    const sb = makeSupabase({
      config: { escalation: { enabled: true, recipients: [{ name: 'Rep', email: 'rep@brand.co' }] } },
    });
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'מתי יגיע?', force: true },
      { supabase: sb as any, sendEmail: sendEmail as any, pauseBot: pauseBot as any, now: () => 0 },
    );
    expect(r.escalated).toBe(true);
    expect(pauseBot).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('force still respects the ESCALATION_ENABLED flag gate', async () => {
    process.env.ESCALATION_ENABLED = 'false';
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const pauseBot = vi.fn();
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'anything', force: true },
      { supabase: makeSupabase() as any, sendEmail: vi.fn() as any, pauseBot: pauseBot as any, now: () => 0 },
    );
    expect(r).toEqual({ escalated: false, skipped: 'flag_off' });
    expect(pauseBot).not.toHaveBeenCalled();
  });
});
