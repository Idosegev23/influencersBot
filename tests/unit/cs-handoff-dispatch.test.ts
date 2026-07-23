import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeSupabase(opts: { config?: any; recent?: any[]; ticket?: any } = {}) {
  const inserts: any[] = [];
  const updates: any[] = [];
  const api: any = {
    inserts,
    updates,
    from(table: string) {
      const ctx: any = { table };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.gte = () => ctx;
      ctx.order = () => ctx;
      ctx.limit = () => ctx;
      ctx.single = async () =>
        table === 'accounts' ? { data: { config: opts.config ?? {} }, error: null } : { data: null, error: null };
      // The CS-conversation ticket read (dedup + flag). Returns the configured ticket row.
      ctx.maybeSingle = async () =>
        table === 'support_requests' ? { data: opts.ticket ?? null, error: null } : { data: null, error: null };
      ctx.insert = async (row: any) => {
        // Mirror the real `support_requests.customer_name` NOT NULL (no default) constraint:
        // PostgREST/Postgres would reject a null insert with 23502, not silently succeed.
        if (table === 'support_requests' && (row.customer_name === null || row.customer_name === undefined)) {
          return {
            data: null,
            error: { code: '23502', message: 'null value in column "customer_name" violates not-null constraint' },
          };
        }
        inserts.push({ table, row });
        return { data: null, error: null };
      };
      ctx.update = (row: any) => { updates.push({ table, row }); return ctx; };
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

  it('defaults ON when ESCALATION_ENABLED is unset (no env var needed to enable)', async () => {
    delete process.env.ESCALATION_ENABLED;
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'החזר כספי' },
      { supabase: makeSupabase() as any, sendEmail: vi.fn() as any, pauseBot: vi.fn() as any, now: () => 0 },
    );
    expect(r.skipped).not.toBe('flag_off');
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

  // One ticket per conversation: when a bound CS ticket exists, the handoff FLAGS it instead of
  // spawning a second (auto_escalation) ticket. Two tickets is what doubled the customer's
  // "awaiting_customer" notifications (live-observed 2026-07-23).
  it('on trigger WITH a bound CS ticket: pauses, emails, FLAGS the ticket, creates NO second ticket', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const pauseBot = vi.fn();
    const sendEmail = vi.fn().mockResolvedValue({ success: true });
    const sb = makeSupabase({
      config: { escalation: { enabled: true, recipients: [{ name: 'Rep', email: 'rep@brand.co' }] } },
      ticket: { metadata: {} },
    });
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'המוצר הגיע שבור, אני רוצה החזר כספי' },
      { supabase: sb as any, sendEmail: sendEmail as any, pauseBot: pauseBot as any, now: () => 0 },
    );
    expect(r.escalated).toBe(true);
    expect(pauseBot).toHaveBeenCalledWith('cs1', expect.stringContaining('handoff'));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    // NO separate auto_escalation ticket is inserted...
    expect(sb.inserts.find((i: any) => i.table === 'support_requests' && i.row.source === 'auto_escalation')).toBeUndefined();
    // ...the existing CS ticket is flagged instead.
    const upd = sb.updates.find((u: any) => u.table === 'support_requests');
    expect(upd).toBeTruthy();
    expect(upd.row.metadata.escalation.origin).toBe('whatsapp_cs');
    expect(upd.row.metadata.escalated).toBe(true);
    expect(upd.row.metadata.last_handoff_at).toBeTruthy();
  });

  it('on trigger WITHOUT a ticket (pre-bind / widget / chat): writes the standalone auto_escalation surface', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const pauseBot = vi.fn();
    const sendEmail = vi.fn().mockResolvedValue({ success: true });
    const sb = makeSupabase({
      config: { escalation: { enabled: true, recipients: [{ name: 'Rep', email: 'rep@brand.co' }] } },
    });
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: null, waId: '972501234567', userMessage: 'המוצר הגיע שבור, אני רוצה החזר כספי' },
      { supabase: sb as any, sendEmail: sendEmail as any, pauseBot: pauseBot as any, now: () => 0 },
    );
    expect(r.escalated).toBe(true);
    const audit = sb.inserts.find((i: any) => i.table === 'support_requests');
    expect(audit.row.source).toBe('auto_escalation');
    expect(audit.row.metadata.escalation.origin).toBe('whatsapp_cs');
    // `customer_name` is NOT NULL in prod; the mock rejects null with 23502, so this also proves
    // the insert actually landed (didn't silently no-op).
    expect(typeof audit.row.customer_name).toBe('string');
    expect(audit.row.customer_name.length).toBeGreaterThan(0);
  });

  it('dedups a second alert inside the window (keys off the ticket last_handoff_at)', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const sb = makeSupabase({ config: { escalation: { enabled: true } }, ticket: { metadata: { last_handoff_at: new Date(0).toISOString() } } });
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
