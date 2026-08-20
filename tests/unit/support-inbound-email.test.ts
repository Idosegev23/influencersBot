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
  beforeEach(() => vi.resetModules());

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

  it('alerts the CTO when the brand has no address to forward to', async () => {
    const sb = makeSupabase({
      byCode: [{ id: 't-1', account_id: 'acc-1' }],
      account: { id: 'acc-1', config: { display_name: 'LA BEAUTE' } },
    });
    const route = await load(sb);
    const r = await route(mail());
    expect(r.outcome).toBe('no_brand_address');
    expect(alerts[0].adminEmails).toEqual(['cto@ldrsgroup.com']);
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
