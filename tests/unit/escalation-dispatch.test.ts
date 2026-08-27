import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runEscalationCheck } from '@/engines/escalation/dispatch';

// Chainable fake: per-table canned responses + captured inserts.
function makeSupabase(opts: {
  config?: any;
  priorMessages?: { role: string; content: string }[];
  recentEscalations?: any[];
  agents?: any[];
}) {
  const inserts: any[] = [];
  const api = {
    inserts,
    from(table: string) {
      const ctx: any = { table };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.gte = () => ctx;
      ctx.order = () => ctx;
      ctx.limit = () => ctx;
      ctx.single = async () => {
        if (table === 'accounts') return { data: { config: opts.config ?? {} }, error: null };
        return { data: null, error: null };
      };
      ctx.insert = async (row: any) => { inserts.push({ table, row }); return { data: null, error: null }; };
      ctx.then = (resolve: any) => {
        if (table === 'chat_messages') return resolve({ data: opts.priorMessages ?? [], error: null });
        if (table === 'support_requests') return resolve({ data: opts.recentEscalations ?? [], error: null });
        if (table === 'support_agents') return resolve({ data: opts.agents ?? [], error: null });
        return resolve({ data: [], error: null });
      };
      return ctx;
    },
  };
  return api;
}

describe('runEscalationCheck', () => {
  beforeEach(() => { process.env.ESCALATION_ENABLED = 'true'; });

  const input = { accountId: 'acc', sessionId: 'sess', userMessage: 'אני אתבע אתכם', source: 'chat' as const };

  it('skips when the feature flag is off', async () => {
    process.env.ESCALATION_ENABLED = 'false';
    const out = await runEscalationCheck(input, { supabase: makeSupabase({}) as any, sendEmail: vi.fn() as any });
    expect(out.escalated).toBe(false);
    expect(out.skipped).toBe('flag_off');
  });

  it('does not escalate a benign message', async () => {
    const sendEmail = vi.fn();
    const out = await runEscalationCheck(
      { ...input, userMessage: 'יש לכם שמן לשיער?' },
      { supabase: makeSupabase({ config: { escalation: { recipients: [{ name: 'Y', email: 'y@x.com' }] } } }) as any, sendEmail: sendEmail as any },
    );
    expect(out.escalated).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends email + writes a record on a legal threat', async () => {
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const sb = makeSupabase({ config: { escalation: { recipients: [{ name: 'Y', email: 'y@x.com' }] }, brandName: 'LA BEAUTÉ' } });
    const out = await runEscalationCheck(input, { supabase: sb as any, sendEmail: sendEmail as any });
    expect(out.escalated).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toEqual(['y@x.com']);
    const rec = sb.inserts.find((i) => i.table === 'support_requests');
    expect(rec).toBeTruthy();
    expect(rec.row.source).toBe('auto_escalation');
    expect(rec.row.metadata.escalation.triggers).toContain('legal');
  });

  it('dedups when a recent auto_escalation exists for the session', async () => {
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const sb = makeSupabase({
      config: { escalation: { recipients: [{ name: 'Y', email: 'y@x.com' }] } },
      recentEscalations: [{ id: 'prev' }],
    });
    const out = await runEscalationCheck(input, { supabase: sb as any, sendEmail: sendEmail as any });
    expect(out.deduped).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('respects per-account disabled flag', async () => {
    const sendEmail = vi.fn();
    const out = await runEscalationCheck(input, {
      supabase: makeSupabase({ config: { escalation: { enabled: false } } }) as any,
      sendEmail: sendEmail as any,
    });
    expect(out.skipped).toBe('disabled');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

/**
 * The DM lane has produced ZERO rows since it shipped (`7c0063b`, 2026-07-18):
 * 693 auto_escalations exist, and every one of them is origin whatsapp_cs / chat /
 * widget. Low DM volume explains it only if the lane actually works — so this
 * drives it with the real LDRS config and the real message that went unanswered
 * on 2026-04-15 ("יש בן אדם לדבר איתו?", after five turns of the bot looping).
 */
describe('the Instagram DM lane', () => {
  beforeEach(() => { process.env.ESCALATION_ENABLED = 'true'; });

  // ldrs_group's real config.escalation
  const ldrsConfig = {
    display_name: 'LDRS GROUP',
    escalation: {
      enabled: true,
      dedupeMinutes: 15,
      recipients: [
        { name: 'Yoav', email: 'yoav@ldrsgroup.com', whatsapp: '' },
        { name: 'CTO', email: 'cto@ldrsgroup.com', whatsapp: '+972547667775' },
      ],
    },
  };

  it('escalates a DM asking for a human, and stamps the origin as dm', async () => {
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const sb = makeSupabase({ config: ldrsConfig });
    const out = await runEscalationCheck(
      { accountId: 'acc', sessionId: 'sess', userMessage: 'יש בן אדם לדבר איתו?', source: 'dm' },
      { supabase: sb as any, sendEmail: sendEmail as any },
    );

    expect(out.escalated).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toEqual(['yoav@ldrsgroup.com', 'cto@ldrsgroup.com']);
    const rec = sb.inserts.find((i) => i.table === 'support_requests');
    expect(rec).toBeTruthy();
    expect(rec.row.source).toBe('auto_escalation');
    expect(rec.row.metadata.escalation.origin).toBe('dm');
    expect(rec.row.metadata.escalation.triggers).toContain('human_demand');
  });

  it('escalates the sustained-anger shape too, not only the explicit ask', async () => {
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const sb = makeSupabase({
      config: ldrsConfig,
      priorMessages: [
        { role: 'user', content: 'יש תשלום שלא עבר לי על חודש דצמבר וכל הזמן מורחים אותי במיילים' },
        { role: 'assistant', content: 'תשלחי לנו את הפרטים' },
      ],
    });
    const out = await runEscalationCheck(
      { accountId: 'acc', sessionId: 'sess', userMessage: 'זה ממש חוצפה', source: 'dm' },
      { supabase: sb as any, sendEmail: sendEmail as any },
    );

    expect(out.escalated).toBe(true);
    expect(sb.inserts.find((i) => i.table === 'support_requests').row.metadata.escalation.origin).toBe('dm');
  });

  it('still ignores an ordinary DM', async () => {
    const sendEmail = vi.fn();
    const sb = makeSupabase({ config: ldrsConfig });
    const out = await runEscalationCheck(
      { accountId: 'acc', sessionId: 'sess', userMessage: 'היי, אשמח לשמוע על השירותים שלכם', source: 'dm' },
      { supabase: sb as any, sendEmail: sendEmail as any },
    );
    expect(out.escalated).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
