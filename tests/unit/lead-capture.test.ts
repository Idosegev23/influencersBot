import { describe, it, expect, vi } from 'vitest';
import { runLeadCaptureCheck, flushStaleLeads, leadDiggingInstruction } from '@/engines/escalation/lead-capture';
import type { LeadVerdict } from '@/engines/escalation/lead-capture';
import { buildLeadBriefEmail } from '@/engines/escalation/lead-email-template';
import { buildRawEmail } from '@/lib/email';

// Chainable fake mirroring escalation-dispatch.test.ts, extended for the
// lead-capture query shapes (.maybeSingle(), .insert().select().single(), .update().eq()).
function makeSupabase(opts: {
  config?: any;
  existingLeadRow?: any | null;
  leadRows?: any[]; // for flushStaleLeads
  priorMessages?: { role: string; content: string }[];
}) {
  const inserts: any[] = [];
  const updates: any[] = [];
  const api = {
    inserts,
    updates,
    from(table: string) {
      const ctx: any = { table };
      let inserted: any = null;
      let updatePatch: any = null;
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.gte = () => ctx;
      ctx.order = () => ctx;
      ctx.limit = () => ctx;
      ctx.single = async () => {
        if (table === 'accounts') return { data: { config: opts.config ?? {} }, error: null };
        if (inserted) return { data: { id: 'new-row-id', session_id: inserted.session_id, metadata: inserted.metadata }, error: null };
        return { data: null, error: null };
      };
      ctx.maybeSingle = async () => {
        if (table === 'support_requests') return { data: opts.existingLeadRow ?? null, error: null };
        return { data: null, error: null };
      };
      ctx.insert = (row: any) => { inserted = row; inserts.push({ table, row }); return ctx; };
      ctx.update = (patch: any) => { updatePatch = patch; return ctx; };
      ctx.then = (resolve: any) => {
        if (updatePatch) { updates.push({ table, patch: updatePatch }); return resolve({ data: null, error: null }); }
        if (table === 'chat_messages') return resolve({ data: opts.priorMessages ?? [], error: null });
        if (table === 'support_requests') return resolve({ data: opts.leadRows ?? [], error: null });
        return resolve({ data: [], error: null });
      };
      return ctx;
    },
  };
  return api;
}

const enabledConfig = {
  username: 'ldrs_group',
  display_name: 'LDRS',
  lead_capture: { enabled: true, to: ['pnina@x.com', 'gili@x.com'], cc: ['yoav@x.com', 'cto@x.com'] },
};

const baseInput = {
  accountId: 'acc',
  sessionId: 'sess',
  userMessage: 'היי, אנחנו מותג קוסמטיקה ומחפשים קמפיין משפיענים',
  contact: { name: 'Dana Cohen', username: 'dana_brand' },
};

const verdict = (readiness: LeadVerdict['readiness'], fields: any = {}): LeadVerdict => ({
  is_lead: readiness !== 'not_lead',
  readiness,
  fields,
});

describe('runLeadCaptureCheck', () => {
  it('skips when lead_capture is not enabled for the account', async () => {
    const classify = vi.fn();
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: makeSupabase({ config: { username: 'x' } }) as any,
      sendEmail: vi.fn() as any,
      classify,
    });
    expect(out.skipped).toBe('disabled');
    expect(classify).not.toHaveBeenCalled();
  });

  it('post-brief turn with NEW details → fields merged + flagged for updated brief, no immediate email', async () => {
    const supabase = makeSupabase({
      config: enabledConfig,
      existingLeadRow: {
        id: 'r1',
        session_id: 'sess',
        metadata: { lead: { state: 'sent', fields: { service: 'קמפיין משפיענים', contact_phone: '050-1' } } },
      },
    });
    const sendEmail = vi.fn();
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: sendEmail as any,
      classify: async () => verdict('gathering', { budget: '15,000 ₪', brand: 'ילדים בע״מ' }),
    });
    expect(out.isLead).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled(); // no per-message spam
    const upd = supabase.updates.find((u) => u.table === 'support_requests');
    expect(upd.patch.metadata.lead.fields.budget).toBe('15,000 ₪');
    expect(upd.patch.metadata.lead.fields.service).toBe('קמפיין משפיענים'); // preserved
    expect(upd.patch.metadata.lead.fields_changed_after_brief).toBe(true);
    expect(upd.patch.metadata.lead.state).toBe('sent'); // stays sent
  });

  it('post-brief turn with nothing new → no write, no email', async () => {
    const supabase = makeSupabase({
      config: enabledConfig,
      existingLeadRow: {
        id: 'r1',
        session_id: 'sess',
        metadata: { lead: { state: 'sent', fields: { service: 'קמפיין משפיענים' } } },
      },
    });
    const sendEmail = vi.fn();
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: sendEmail as any,
      classify: async () => verdict('gathering', {}),
    });
    expect(out.skipped).toBe('already_sent');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(supabase.updates).toHaveLength(0);
  });

  it('writes nothing for a non-lead (fan) message', async () => {
    const supabase = makeSupabase({ config: enabledConfig });
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: vi.fn() as any,
      classify: async () => verdict('not_lead'),
    });
    expect(out.isLead).toBe(false);
    expect(supabase.inserts).toHaveLength(0);
  });

  it('does not write or email when the classifier is unavailable', async () => {
    const supabase = makeSupabase({ config: enabledConfig });
    const sendEmail = vi.fn();
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: sendEmail as any,
      classify: async () => null,
    });
    expect(out.skipped).toBe('classifier_unavailable');
    expect(supabase.inserts).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('gathering lead → state row created, no email yet', async () => {
    const supabase = makeSupabase({ config: enabledConfig });
    const sendEmail = vi.fn();
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: sendEmail as any,
      classify: async () => verdict('gathering', { service: 'קמפיין משפיענים', summary: 'מותג קוסמטיקה מתעניין' }),
    });
    expect(out.isLead).toBe(true);
    expect(out.briefSent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(supabase.inserts).toHaveLength(1);
    const row = supabase.inserts[0].row;
    expect(row.source).toBe('ig_lead');
    expect(row.status).toBe('in_progress');
    expect(row.metadata.lead.state).toBe('gathering');
    expect(row.metadata.lead.fields.service).toBe('קמפיין משפיענים');
    expect(row.metadata.lead.ig.username).toBe('dana_brand');
    expect(row.customer_name).toContain('Dana Cohen');
  });

  it('ready lead → brief email to config.to with cc, row flipped to sent', async () => {
    const supabase = makeSupabase({ config: enabledConfig });
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: sendEmail as any,
      classify: async () =>
        verdict('ready', {
          service: 'קמפיין משפיענים',
          brand: 'GlowCo',
          contact_phone: '050-1234567',
          summary: 'מותג קוסמטיקה רוצה קמפיין',
        }),
    });
    expect(out.briefSent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call: any = sendEmail.mock.calls[0][0];
    expect(call.to).toEqual(['pnina@x.com', 'gili@x.com']);
    expect(call.cc).toEqual(['yoav@x.com', 'cto@x.com']);
    expect(call.subject).toContain('ליד חדש מאינסטגרם');
    expect(call.html).toContain('GlowCo');
    expect(call.html).toContain('dana_brand');
    // the state row was flipped to sent + surfaced as a new item in the inbox
    const sentUpdate = supabase.updates.find((u) => u.patch?.metadata?.lead?.state === 'sent');
    expect(sentUpdate).toBeTruthy();
    expect(sentUpdate.patch.status).toBe('new');
    expect(sentUpdate.patch.metadata.lead.brief_type).toBe('full');
    expect(sentUpdate.patch.metadata.lead.email.success).toBe(true); // delivery recorded
  });

  it('merges newly extracted fields over prior ones without erasing them', async () => {
    const supabase = makeSupabase({
      config: enabledConfig,
      existingLeadRow: {
        id: 'r1',
        session_id: 'sess',
        metadata: { lead: { state: 'gathering', fields: { service: 'קמפיין משפיענים' }, ig: { username: 'dana_brand' } } },
      },
    });
    await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: vi.fn() as any,
      classify: async () => verdict('gathering', { budget: '50 אלף', service: null }),
    });
    const upd = supabase.updates.find((u) => u.table === 'support_requests');
    expect(upd.patch.metadata.lead.fields.service).toBe('קמפיין משפיענים'); // preserved
    expect(upd.patch.metadata.lead.fields.budget).toBe('50 אלף'); // added
  });
});

describe('flushStaleLeads', () => {
  const staleIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h idle
  const freshIso = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5m idle

  it('sends a partial brief for a stale gathering lead and skips fresh ones', async () => {
    const supabase = makeSupabase({
      config: enabledConfig,
      leadRows: [
        { id: 'stale', account_id: 'acc', session_id: 's1', metadata: { lead: { state: 'gathering', last_activity_at: staleIso, fields: { service: 'ניהול סושיאל' }, ig: { username: 'quiet_lead' } } } },
        { id: 'fresh', account_id: 'acc', session_id: 's2', metadata: { lead: { state: 'gathering', last_activity_at: freshIso, fields: {} } } },
        { id: 'done', account_id: 'acc', session_id: 's3', metadata: { lead: { state: 'sent', last_activity_at: staleIso } } },
      ],
    });
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const out = await flushStaleLeads({ supabase: supabase as any, sendEmail: sendEmail as any, classify: async () => null });
    expect(out.flushed).toBe(1);
    expect(out.scanned).toBe(2); // gathering rows only
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call: any = sendEmail.mock.calls[0][0];
    expect(call.subject).toContain('בריף חלקי');
    expect(call.to).toEqual(['pnina@x.com', 'gili@x.com']);
  });

  it('sent lead with post-brief changes → ONE updated-brief email, flag cleared', async () => {
    const supabase = makeSupabase({
      config: enabledConfig,
      leadRows: [
        {
          id: 'upd',
          account_id: 'acc',
          session_id: 's1',
          metadata: {
            lead: {
              state: 'sent',
              fields_changed_after_brief: true,
              last_activity_at: staleIso,
              fields: { service: 'קמפיין משפיענים', budget: '15,000 ₪' },
              ig: { username: 'triroars' },
            },
          },
        },
        { id: 'quiet-sent', account_id: 'acc', session_id: 's2', metadata: { lead: { state: 'sent', fields_changed_after_brief: false, last_activity_at: staleIso } } },
      ],
    });
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const out = await flushStaleLeads({ supabase: supabase as any, sendEmail: sendEmail as any, classify: async () => null });
    expect(out.flushed).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call: any = sendEmail.mock.calls[0][0];
    expect(call.subject).toContain('עדכון ליד');
    expect(call.html).toContain('15,000 ₪');
    const upd = supabase.updates.find((u) => u.patch?.metadata?.lead);
    expect(upd.patch.metadata.lead.fields_changed_after_brief).toBe(false); // one update per quiet period
  });

  it('does nothing when the account has lead_capture disabled', async () => {
    const supabase = makeSupabase({
      config: { username: 'x' },
      leadRows: [{ id: 'stale', account_id: 'acc', session_id: 's1', metadata: { lead: { state: 'gathering', last_activity_at: staleIso, fields: {} } } }],
    });
    const sendEmail = vi.fn();
    const out = await flushStaleLeads({ supabase: supabase as any, sendEmail: sendEmail as any, classify: async () => null });
    expect(out.flushed).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('buildLeadBriefEmail', () => {
  it('renders full brief with fields, profile link and transcript', () => {
    const { subject, html } = buildLeadBriefEmail({
      brandName: 'LDRS',
      contactLabel: 'Dana Cohen @dana_brand',
      igUsername: 'dana_brand',
      fields: { service: 'קמפיין משפיענים', budget: '50K', contact_phone: '050-1234567', summary: 'מותג רוצה קמפיין' },
      briefType: 'full',
      lastMessages: [{ role: 'user', content: 'כמה עולה קמפיין?' }],
      sessionId: 'sess-1',
    });
    expect(subject).toContain('ליד חדש מאינסטגרם');
    expect(html).toContain('instagram.com/dana_brand');
    expect(html).toContain('קמפיין משפיענים');
    expect(html).toContain('050-1234567');
    expect(html).toContain('כמה עולה קמפיין?');
  });

  it('escapes HTML in user-controlled content', () => {
    const { html } = buildLeadBriefEmail({
      brandName: 'LDRS',
      contactLabel: '<script>alert(1)</script>',
      fields: { summary: '<img src=x>' },
      briefType: 'partial',
      lastMessages: [],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
  });
});

describe('leadDiggingInstruction', () => {
  it('is a single bracketed internal note naming the brand', () => {
    const s = leadDiggingInstruction('LDRS');
    expect(s.startsWith('[')).toBe(true);
    expect(s.endsWith(']')).toBe(true);
    expect(s).toContain('LDRS');
    expect(s).toContain('שאלה מבררת אחת');
    // chips: every qualifying question must ship quick-reply suggestions
    expect(s).toContain('<<SUGGESTIONS>>');
  });
});

describe('sendEmail cc support', () => {
  it('buildRawEmail emits a Cc header only when cc is provided', () => {
    const decode = (raw: string) =>
      Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const withCc = decode(
      buildRawEmail({ to: ['a@x.com'], cc: ['b@x.com', 'c@x.com'], subject: 'hi', html: '<p>hi</p>' }),
    );
    expect(withCc).toContain('To: a@x.com');
    expect(withCc).toContain('Cc: b@x.com, c@x.com');
    const noCc = decode(buildRawEmail({ to: 'a@x.com', subject: 'hi', html: '<p>hi</p>' }));
    expect(noCc).not.toContain('Cc:');
  });
});
