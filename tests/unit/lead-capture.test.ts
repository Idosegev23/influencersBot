import { describe, it, expect, vi } from 'vitest';
import {
  runLeadCaptureCheck,
  flushStaleLeads,
  leadDiggingInstruction,
  resolveLeadRecipients,
  mergeLeadType,
  LEAD_SOURCES,
  LEAD_SOURCE_BY_CHANNEL,
  extractContactDetails,
} from '@/engines/escalation/lead-capture';
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
      ctx.in = () => ctx;
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

// LDRS's real shape: two lanes plus a legacy `to` that catches an unresolved lane.
const routedConfig = {
  username: 'ldrs_group',
  display_name: 'LDRS',
  lead_capture: {
    enabled: true,
    routes: {
      brand: { to: ['itamar@x.com', 'roei@x.com', 'kfir@x.com'] },
      talent: { to: ['sharon@x.com'] },
    },
    to: ['yoav@x.com', 'cto@x.com'],
    cc: ['yoav@x.com', 'cto@x.com'],
  },
};

const baseInput = {
  accountId: 'acc',
  sessionId: 'sess',
  userMessage: 'היי, אנחנו מותג קוסמטיקה ומחפשים קמפיין משפיענים',
  contact: { name: 'Dana Cohen', username: 'dana_brand' },
};

const verdict = (
  readiness: LeadVerdict['readiness'],
  fields: any = {},
  leadType: LeadVerdict['lead_type'] = null,
): LeadVerdict => ({
  is_lead: readiness !== 'not_lead',
  readiness,
  lead_type: leadType,
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
    expect(call.subject).toContain('ליד חדש מהודעות האינסטגרם');
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
    expect(subject).toContain('ליד חדש מהודעות האינסטגרם');
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

// ── Lane routing: the reason this engine has two inboxes at all ──

describe('resolveLeadRecipients', () => {
  const cfg = routedConfig.lead_capture;

  it('routes a brand lead to the sales list, cc unchanged', () => {
    expect(resolveLeadRecipients(cfg, 'brand')).toEqual({
      to: ['itamar@x.com', 'roei@x.com', 'kfir@x.com'],
      cc: ['yoav@x.com', 'cto@x.com'],
    });
  });

  it('routes a talent lead to the talent list only', () => {
    expect(resolveLeadRecipients(cfg, 'talent')).toEqual({
      to: ['sharon@x.com'],
      cc: ['yoav@x.com', 'cto@x.com'],
    });
  });

  it('routes a both-lane lead to the union of the two lists', () => {
    expect(resolveLeadRecipients(cfg, 'both').to).toEqual([
      'itamar@x.com',
      'roei@x.com',
      'kfir@x.com',
      'sharon@x.com',
    ]);
  });

  it('falls back to the legacy `to` when the lane is still unknown', () => {
    const r = resolveLeadRecipients(cfg, null);
    expect(r.to).toEqual(['yoav@x.com', 'cto@x.com']);
    // ...and nobody is both addressed and copied
    expect(r.cc).toEqual([]);
  });

  it('falls back to the union when a lane is configured empty and there is no legacy `to`', () => {
    const sparse = { enabled: true, routes: { brand: { to: ['a@x.com'] }, talent: { to: [] } }, cc: ['z@x.com'] };
    expect(resolveLeadRecipients(sparse, 'talent').to).toEqual(['a@x.com']);
  });

  it('returns no recipients when nothing is configured (caller raises an admin alert)', () => {
    expect(resolveLeadRecipients({ enabled: true }, 'brand').to).toEqual([]);
  });

  it('de-duplicates addresses case-insensitively across lanes', () => {
    const overlap = {
      enabled: true,
      routes: { brand: { to: ['Roei@x.com'] }, talent: { to: ['roei@X.com', 'sharon@x.com'] } },
      cc: [],
    };
    expect(resolveLeadRecipients(overlap, 'both').to).toEqual(['Roei@x.com', 'sharon@x.com']);
  });
});

describe('mergeLeadType', () => {
  it('adopts the first lane it learns', () => {
    expect(mergeLeadType(null, 'brand')).toBe('brand');
  });

  it('keeps the known lane when a later turn cannot tell', () => {
    expect(mergeLeadType('talent', null)).toBe('talent');
  });

  it('widens to both when two turns disagree — a lead never leaves an inbox that was watching it', () => {
    expect(mergeLeadType('brand', 'talent')).toBe('both');
    expect(mergeLeadType('talent', 'brand')).toBe('both');
  });

  it('stays both once widened', () => {
    expect(mergeLeadType('both', 'brand')).toBe('both');
  });
});

describe('runLeadCaptureCheck lane routing end to end', () => {
  it('a creator looking for work reaches the talent list, not the sales list', async () => {
    const supabase = makeSupabase({ config: routedConfig });
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: sendEmail as any,
      classify: async () =>
        verdict(
          'ready',
          { niche: 'אופנה', platforms: 'אינסטגרם, טיקטוק', audience: '80K', contact_phone: '050-1' },
          'talent',
        ),
    });
    expect(out.leadType).toBe('talent');
    const call: any = sendEmail.mock.calls[0][0];
    expect(call.to).toEqual(['sharon@x.com']);
    expect(call.subject).toContain('משפיען / מועמד');
    expect(call.html).toContain('גודל קהל');
    expect(call.html).toContain('80K');
    // the talent lane must never surface a budget question's answer slot
    expect(call.html).not.toContain('תקציב');
  });

  it('a brand buying a campaign reaches the sales list', async () => {
    const supabase = makeSupabase({ config: routedConfig });
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: sendEmail as any,
      classify: async () =>
        verdict('ready', { service: 'קמפיין משפיענים', brand: 'GlowCo', contact_phone: '050-1' }, 'brand'),
    });
    expect(out.leadType).toBe('brand');
    const call: any = sendEmail.mock.calls[0][0];
    expect(call.to).toEqual(['itamar@x.com', 'roei@x.com', 'kfir@x.com']);
    expect(call.cc).toEqual(['yoav@x.com', 'cto@x.com']);
  });

  it('an agency pitching its own creators lands on both lists', async () => {
    const supabase = makeSupabase({
      config: routedConfig,
      existingLeadRow: {
        id: 'r1',
        session_id: 'sess',
        metadata: { lead: { state: 'gathering', lead_type: 'brand', fields: { brand: 'AgencyCo' } } },
      },
    });
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    const out = await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: sendEmail as any,
      classify: async () => verdict('ready', { audience: '3 יוצרים', contact_phone: '050-1' }, 'talent'),
    });
    expect(out.leadType).toBe('both');
    const call: any = sendEmail.mock.calls[0][0];
    expect(call.to).toEqual(['itamar@x.com', 'roei@x.com', 'kfir@x.com', 'sharon@x.com']);
  });

  it('an unresolved lane still gets delivered — to the fallback list', async () => {
    const supabase = makeSupabase({ config: routedConfig });
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: sendEmail as any,
      classify: async () => verdict('ready', { contact_phone: '050-1' }, null),
    });
    const call: any = sendEmail.mock.calls[0][0];
    expect(call.to).toEqual(['yoav@x.com', 'cto@x.com']);
    expect(call.subject).toContain('ליד חדש');
  });
});

// ── Surfaces: the same lead must be worked identically wherever it walks in ──

describe('lead capture across surfaces', () => {
  it('maps every channel to its own support_requests source', () => {
    expect(LEAD_SOURCE_BY_CHANNEL).toEqual({ dm: 'ig_lead', chat: 'web_lead', widget: 'widget_lead' });
    expect(LEAD_SOURCES).toEqual(['ig_lead', 'web_lead', 'widget_lead']);
  });

  it('a widget lead files a widget_lead row and says so in the brief', async () => {
    const supabase = makeSupabase({ config: routedConfig });
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    await runLeadCaptureCheck(
      { accountId: 'acc', sessionId: 'sess', userMessage: 'מחפשים קמפיין', channel: 'widget' },
      {
        supabase: supabase as any,
        sendEmail: sendEmail as any,
        classify: async () => verdict('ready', { service: 'קמפיין', contact_email: 'a@b.com' }, 'brand'),
      },
    );
    expect(supabase.inserts[0].row.source).toBe('widget_lead');
    expect(supabase.inserts[0].row.metadata.lead.channel).toBe('widget');
    expect(supabase.inserts[0].row.customer_name).toBe('ליד מהאתר');
    const call: any = sendEmail.mock.calls[0][0];
    expect(call.subject).toContain('מהווידג׳ט באתר');
  });

  it('a chat-page lead files a web_lead row', async () => {
    const supabase = makeSupabase({ config: routedConfig });
    const sendEmail = vi.fn(async (_opts: any) => ({ success: true }));
    await runLeadCaptureCheck(
      { accountId: 'acc', sessionId: 'sess', userMessage: 'שלום', channel: 'chat' },
      {
        supabase: supabase as any,
        sendEmail: sendEmail as any,
        classify: async () => verdict('gathering', { service: 'סושיאל' }, 'brand'),
      },
    );
    expect(supabase.inserts[0].row.source).toBe('web_lead');
  });

  it('defaults to the DM channel when none is given (pre-existing callers)', async () => {
    const supabase = makeSupabase({ config: routedConfig });
    await runLeadCaptureCheck(baseInput, {
      supabase: supabase as any,
      sendEmail: vi.fn() as any,
      classify: async () => verdict('gathering', { service: 'סושיאל' }, 'brand'),
    });
    expect(supabase.inserts[0].row.source).toBe('ig_lead');
  });
});

describe('leadDiggingInstruction lanes', () => {
  it('carries both ladders and forbids asking a candidate about budget', () => {
    const s = leadDiggingInstruction('LDRS');
    expect(s).toContain('מותג, חברה או סוכנות');
    expect(s).toContain('יוצר/ת תוכן');
    expect(s).toContain('מה סדר גודל התקציב');       // lane (א)
    expect(s).toContain('מה גודל הקהל/מספר העוקבים'); // lane (ב)
    expect(s).toContain('אל תשאל/י על תקציב לעולם');
  });
});

/**
 * Contact details are not a judgement call — they are literally in the text.
 *
 * Both real inbound IG leads on ldrs_group reached sales with no way to phone
 * the person back, because the router-lane classifier simply did not return them:
 *   • אביחי מזרחי, 2026-08-16 — typed "0507723585"; brief `contact_phone: null`.
 *   • פז טוויק,   2026-08-20 — typed "פז טוויק - 0526894662 | מייל- paztwik@gmail.com";
 *     brief `contact_phone: null`, `contact_email: null`.
 * `support_requests.customer_phone` was null on both. So a deterministic pass
 * runs over the raw message and the classifier can only ADD to it, never lose it.
 */
describe('extractContactDetails', () => {
  it('pulls the two real messages that were dropped in production', () => {
    expect(extractContactDetails('0507723585')).toEqual({ phone: '0507723585' });
    expect(extractContactDetails('פז טוויק - 0526894662\nמייל- paztwik@gmail.com')).toEqual({
      phone: '0526894662',
      email: 'paztwik@gmail.com',
    });
  });

  it('handles the ways Israelis actually type a number', () => {
    expect(extractContactDetails('054-766-7775').phone).toBe('054-766-7775');
    expect(extractContactDetails('הטלפון שלי 052 883 1122').phone).toBe('052 883 1122');
    expect(extractContactDetails('+972547667775').phone).toBe('+972547667775');
    expect(extractContactDetails('אפשר לחזור אליי ל‑0523550870 תודה').phone).toBe('0523550870');
  });

  it('does not invent a phone out of other numbers in the conversation', () => {
    // Presence first, so this test cannot pass vacuously.
    expect(extractContactDetails('תקציב 250000 שח, הטלפון 0541234567').phone).toBe('0541234567');
    // …and these carry no contact detail at all:
    expect(extractContactDetails('מהלך הוליסטי רחב תקציב 250 אלף שח').phone).toBeUndefined();
    expect(extractContactDetails('יש לי 9,000 עוקבים').phone).toBeUndefined();
    expect(extractContactDetails('כרגע 2,000+').phone).toBeUndefined();
    expect(extractContactDetails('סרטונים שהגיעו לכמעט 100000 צפיות').phone).toBeUndefined();
    expect(extractContactDetails('נדבר ב-2026').phone).toBeUndefined();
    expect(extractContactDetails('').phone).toBeUndefined();
  });

  it('finds an email anywhere in the sentence but ignores handles and urls', () => {
    expect(extractContactDetails('אפשר במייל noahshilo@gmail.com').email).toBe('noahshilo@gmail.com');
    expect(extractContactDetails('קו"ח ל jobs@ldrsgroup.com בבקשה').email).toBe('jobs@ldrsgroup.com');
    expect(extractContactDetails('האינסטגרם שלי @noki_coffe').email).toBeUndefined();
    expect(extractContactDetails('תראו באתר https://ldrsgroup.com').email).toBeUndefined();
  });
});

describe('contact details survive a classifier that misses them', () => {
  it("אביחי's post-brief phone number flags an updated brief instead of being dropped", async () => {
    const supabase = makeSupabase({
      config: routedConfig,
      existingLeadRow: {
        id: 'r1',
        session_id: 'sess',
        metadata: { lead: { state: 'sent', lead_type: 'talent', fields: { contact_name: 'אביחי' } } },
      },
    });
    const sendEmail = vi.fn();
    const out = await runLeadCaptureCheck(
      { ...baseInput, userMessage: '0507723585' },
      {
        supabase: supabase as any,
        sendEmail: sendEmail as any,
        // the production classifier returned nothing for this bare-number turn
        classify: async () => verdict('gathering', {}, 'talent'),
      },
    );

    expect(out.isLead).toBe(true);
    expect(out.skipped).not.toBe('already_sent'); // it used to stop right here
    const upd = supabase.updates.find((u) => u.table === 'support_requests');
    expect(upd.patch.metadata.lead.fields.contact_phone).toBe('0507723585');
    expect(upd.patch.metadata.lead.fields.contact_name).toBe('אביחי'); // preserved
    expect(upd.patch.metadata.lead.fields_changed_after_brief).toBe(true);
    expect(upd.patch.customer_phone).toBe('0507723585'); // the row column too
  });

  it("פז's name + phone + email land in the gathering row the flush will send", async () => {
    const supabase = makeSupabase({ config: routedConfig });
    const out = await runLeadCaptureCheck(
      { ...baseInput, userMessage: 'פז טוויק - 0526894662\nמייל- paztwik@gmail.com' },
      {
        supabase: supabase as any,
        sendEmail: vi.fn() as any,
        classify: async () => verdict('gathering', { contact_name: 'פי סושיאל' }, 'talent'),
      },
    );

    expect(out.isLead).toBe(true);
    const ins = supabase.inserts.find((i) => i.table === 'support_requests');
    expect(ins.row.metadata.lead.fields.contact_phone).toBe('0526894662');
    expect(ins.row.metadata.lead.fields.contact_email).toBe('paztwik@gmail.com');
    expect(ins.row.customer_phone).toBe('0526894662');
  });

  it('the classifier still wins when it extracted something the regex cannot see', async () => {
    const supabase = makeSupabase({ config: routedConfig });
    await runLeadCaptureCheck(
      { ...baseInput, userMessage: 'אפשר לחזור אליי? השארתי את המספר קודם' },
      {
        supabase: supabase as any,
        sendEmail: vi.fn() as any,
        classify: async () => verdict('gathering', { contact_phone: '050-1112222' }, 'brand'),
      },
    );
    const ins = supabase.inserts.find((i) => i.table === 'support_requests');
    expect(ins.row.metadata.lead.fields.contact_phone).toBe('050-1112222');
  });

  it('a turn with no contact detail leaves a known one alone', async () => {
    const supabase = makeSupabase({
      config: routedConfig,
      existingLeadRow: {
        id: 'r1',
        session_id: 'sess',
        metadata: { lead: { state: 'sent', lead_type: 'brand', fields: { contact_phone: '050-9998887' } } },
      },
    });
    const out = await runLeadCaptureCheck(
      { ...baseInput, userMessage: 'תודה רבה!' },
      {
        supabase: supabase as any,
        sendEmail: vi.fn() as any,
        classify: async () => verdict('gathering', {}, 'brand'),
      },
    );
    expect(out.skipped).toBe('already_sent');
    expect(supabase.updates).toHaveLength(0);
  });
});

/**
 * On 2026-04-21 the bot took נעה שילה through a full qualification, collected her
 * name, phone and email, and then said: "מעולה, קבענו כיוון למחר ב-09:00 בזום 🤍
 * אנחנו ניישר את זה מול הצוות ונחזור אלייך עם אישור מסודר ולינק לזום."
 *
 * There is no calendar integration anywhere in this product. Nothing was booked,
 * no link was ever sent, and five days later she wrote "אז אני מבינה שזה לא רציני
 * / אמיתי". It offered "30 דקות עם הצוות" in four other threads too.
 *
 * The bot may still move a lead toward a meeting — it must not assert that one
 * exists.
 */
describe('leadDiggingInstruction — meetings it cannot book', () => {
  const instruction = leadDiggingInstruction('LDRS GROUP');

  it('forbids confirming a slot, a link or an invite', () => {
    expect(instruction).toContain('אל תאשר');
    expect(instruction).toMatch(/זום|לינק/);
    expect(instruction).toContain('יומן');
  });

  it('still lets it collect availability and hand over', () => {
    expect(instruction).toMatch(/זמינות|מתי נוח/);
    expect(instruction).toContain('נציג');
  });

  it('names the brand and stays a single bracketed internal note', () => {
    expect(instruction.startsWith('[')).toBe(true);
    expect(instruction.endsWith(']')).toBe(true);
    expect(instruction).toContain('LDRS GROUP');
    expect(instruction.split('[').length - 1).toBe(1);
  });
});
