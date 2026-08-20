import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Supabase fake. `seen` drives the dedup read, `tickets` the two match lookups
 * (keyed by which filter the code used), `account` the brand lookup.
 */
function makeSupabase(opts: {
  seen?: any;
  byCode?: any[];
  bySender?: any[];
  account?: any;
} = {}) {
  const inserts: any[] = [];
  const api: any = {
    inserts,
    from(table: string) {
      const ctx: any = { table, _mode: null as string | null };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.order = () => ctx;
      ctx.limit = () => ctx;
      ctx.ilike = (col: string) => { ctx._mode = col; return ctx; };
      ctx.maybeSingle = async () => {
        if (table === 'inbound_email_routing') return { data: opts.seen ?? null, error: null };
        if (table === 'accounts') return { data: opts.account ?? null, error: null };
        return { data: null, error: null };
      };
      ctx.insert = async (row: any) => { inserts.push({ table, row }); return { data: null, error: null }; };
      ctx.then = (resolve: any) => {
        if (table === 'support_requests') {
          const rows = ctx._mode === 'id' ? (opts.byCode ?? []) : (opts.bySender ?? []);
          return resolve({ data: rows, error: null });
        }
        return resolve({ data: [], error: null });
      };
      return ctx;
    },
  };
  return api;
}

const sent: any[] = [];
const alerts: any[] = [];

async function load(sb: any) {
  sent.length = 0; alerts.length = 0;
  vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
  vi.doMock('@/lib/email', () => ({
    sendEmail: vi.fn(async (o: any) => { sent.push(o); return { success: true, messageId: 'm1' }; }),
    sendAdminAlert: vi.fn(async (o: any) => { alerts.push(o); }),
  }));
  vi.doMock('@/lib/support/reply-address', () => ({
    resolveBrandReplyTo: vi.fn(async (_sb: any, acct: any) => acct?.config?.support_email ?? null),
  }));
  return (await import('@/lib/support/inbound-email')).routeInboundCustomerEmail;
}

const BRAND = { id: 'acc-1', config: { display_name: 'LA BEAUTE', support_email: 'csr@labeaute.com' } };

const mail = (over: any = {}) => ({
  providerMessageId: 'gmail-1',
  from: 'customer@gmail.com',
  subject: 'Re: קיבלנו את הפנייה שלך',
  body: 'תודה, אבל עדיין לא קיבלתי החזר.\n\n> מספר פנייה: 88E0F355',
  ...over,
});

describe('routeInboundCustomerEmail', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GMAIL_SEND_FROM = 'bestie@ldrsgroup.com';
    delete process.env.CRM_INBOX_EMAIL;
  });

  it('matches on the ticket code quoted back and forwards to the brand', async () => {
    const sb = makeSupabase({ byCode: [{ id: '88e0f355-fbc6-4587-8c44-7af36e35b32f', account_id: 'acc-1' }], account: BRAND });
    const route = await load(sb);
    const r = await route(mail());
    expect(r.outcome).toBe('forwarded');
    expect(r.matchedBy).toBe('ticket_code');
    expect(sent[0].to).toBe('csr@labeaute.com');
    // The brand hits reply and reaches the customer, not Bestie's mailbox.
    expect(sent[0].replyTo).toBe('customer@gmail.com');
    expect(sb.inserts[0].row.outcome).toBe('forwarded');
  });

  it('falls back to the sender address when no code is quoted', async () => {
    const sb = makeSupabase({ byCode: [], bySender: [{ id: 't-9', account_id: 'acc-1' }], account: BRAND });
    const route = await load(sb);
    const r = await route(mail({ body: 'עדיין מחכה לתשובה' }));
    expect(r.outcome).toBe('forwarded');
    expect(r.matchedBy).toBe('sender_email');
  });

  // An ambiguous prefix must not send one customer's message to another customer's business.
  it('ignores an ambiguous ticket code rather than guessing', async () => {
    const sb = makeSupabase({
      byCode: [{ id: '88e0f355-a', account_id: 'acc-1' }, { id: '88e0f355-b', account_id: 'acc-2' }],
      bySender: [],
    });
    const route = await load(sb);
    const r = await route(mail());
    expect(r.outcome).toBe('unmatched');
  });

  it('alerts the CTO — not the shared mailbox — when nothing matches', async () => {
    const sb = makeSupabase({ byCode: [], bySender: [] });
    const route = await load(sb);
    const r = await route(mail({ body: 'משהו' }));
    expect(r.outcome).toBe('unmatched');
    expect(alerts[0].adminEmails).toEqual(['cto@ldrsgroup.com']);
    expect(sent.length).toBe(0);
    expect(sb.inserts[0].row.outcome).toBe('unmatched');
  });

  // THE loop that flooded the inbox: the poller reads the mailbox Bestie SENDS from, so every
  // outbound email — including the unmatched-alert itself — came back as an inbound "reply",
  // failed to match, and produced another alert. 349 alerts in two hours.
  it('never treats our own outbound mail as a customer reply', async () => {
    process.env.GMAIL_SEND_FROM = 'bestie@ldrsgroup.com';
    const sb = makeSupabase({ byCode: [], bySender: [] });
    const route = await load(sb);
    const r = await route(mail({ from: 'bestie@ldrsgroup.com', subject: 'קיבלנו את הפנייה שלך' }));
    expect(r.outcome).toBe('not_a_customer_reply');
    expect(alerts.length).toBe(0); // no alert → no message to read back → no loop
    expect(sent.length).toBe(0);
  });

  it('is case- and whitespace-insensitive about our own address', async () => {
    process.env.GMAIL_SEND_FROM = 'bestie@ldrsgroup.com';
    const sb = makeSupabase({ byCode: [], bySender: [] });
    const route = await load(sb);
    const r = await route(mail({ from: '  Bestie@LDRSgroup.com ' }));
    expect(r.outcome).toBe('not_a_customer_reply');
  });

  // One alert per message is how a classification mistake becomes a flood. Batch callers collect.
  it('defers alerts to the caller\'s batch instead of emailing per message', async () => {
    const sb = makeSupabase({ byCode: [], bySender: [] });
    const route = await load(sb);
    const batch: any[] = [];
    await route(mail({ providerMessageId: 'g1', from: 'a@x.com' }), { deferAlerts: batch });
    await route(mail({ providerMessageId: 'g2', from: 'b@x.com' }), { deferAlerts: batch });
    expect(alerts.length).toBe(0);
    expect(batch.length).toBe(2);

    const { reportUnroutableEmails } = await import('@/lib/support/inbound-email');
    await reportUnroutableEmails(batch);
    expect(alerts.length).toBe(1); // ONE digest, not one per message
    expect(alerts[0].subject).toContain('2');
  });

  it('says nothing when a run had nothing to report', async () => {
    await load(makeSupabase());
    const { reportUnroutableEmails } = await import('@/lib/support/inbound-email');
    await reportUnroutableEmails([]);
    expect(alerts.length).toBe(0);
  });

  it('alerts the CTO when the brand has no address to forward to', async () => {
    const sb = makeSupabase({
      byCode: [{ id: 't-1', account_id: 'acc-1' }],
      account: { id: 'acc-1', config: { display_name: 'LA BEAUTE' } },
    });
    const route = await load(sb);
    const r = await route(mail());
    expect(r.outcome).toBe('no_brand_address');
    expect(alerts[0].adminEmails).toEqual(['cto@ldrsgroup.com']);
    expect(alerts[0].details).toContain('LA BEAUTE');
    expect(sent.length).toBe(0);
  });

  // The poller re-reads a 2-day window every 10 minutes — without this the brand gets ~288 copies.
  it('is idempotent: an already-handled message is skipped', async () => {
    const sb = makeSupabase({ seen: { id: 'row-1' }, byCode: [{ id: 't-1', account_id: 'acc-1' }], account: BRAND });
    const route = await load(sb);
    const r = await route(mail());
    expect(r.outcome).toBe('duplicate');
    expect(sent.length).toBe(0);
    expect(sb.inserts.length).toBe(0);
  });

  it('never forwards a bounce or an auto-reply', async () => {
    for (const over of [
      { from: 'mailer-daemon@googlemail.com' },
      { from: 'no-reply@shopify.com' },
      { subject: 'Automatic reply: out of office' },
    ]) {
      vi.resetModules();
      const sb = makeSupabase({ byCode: [{ id: 't-1', account_id: 'acc-1' }], account: BRAND });
      const route = await load(sb);
      const r = await route(mail(over));
      expect(r.outcome).toBe('not_a_customer_reply');
      expect(sent.length).toBe(0);
    }
  });

  it('records the failure instead of silently dropping when the forward fails', async () => {
    const sb = makeSupabase({ byCode: [{ id: 't-1', account_id: 'acc-1' }], account: BRAND });
    sent.length = 0; alerts.length = 0;
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    vi.doMock('@/lib/email', () => ({
      sendEmail: vi.fn(async () => ({ success: false, error: 'quota' })),
      sendAdminAlert: vi.fn(async (o: any) => { alerts.push(o); }),
    }));
    vi.doMock('@/lib/support/reply-address', () => ({ resolveBrandReplyTo: vi.fn(async () => 'csr@labeaute.com') }));
    const { routeInboundCustomerEmail } = await import('@/lib/support/inbound-email');
    const r = await routeInboundCustomerEmail(mail());
    expect(r.outcome).toBe('error');
    expect(sb.inserts[0].row.outcome).toBe('error');
    expect(sb.inserts[0].row.note).toBe('quota');
  });
});
