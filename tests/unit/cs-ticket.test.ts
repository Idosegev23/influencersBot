import { describe, it, expect, vi, beforeEach } from 'vitest';

// Query-shape-agnostic chainable Supabase fake (mirrors escalation-dispatch.test.ts).
function makeSupabase(opts: { existing?: any[] } = {}) {
  const inserts: any[] = [];
  const api: any = {
    inserts,
    from(table: string) {
      const ctx: any = { table, _op: 'select' };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.order = () => ctx;
      ctx.limit = () => ctx;
      ctx.single = async () => ({ data: inserts[inserts.length - 1]?.row ?? null, error: null });
      ctx.insert = (row: any) => {
        inserts.push({ table, row: { id: 'ticket-new-1', ...row } });
        return {
          select: () => ({ single: async () => ({ data: { id: 'ticket-new-1' }, error: null }) }),
        };
      };
      // awaiting a select query returns the "existing" list
      ctx.then = (resolve: any) => resolve({ data: opts.existing ?? [], error: null });
      return ctx;
    },
  };
  return api;
}

vi.mock('@/lib/whatsapp-cloud/client', () => ({
  toWaId: (p: string) => p.replace(/\D/g, '').replace(/^0/, '972'),
}));

describe('cs-ticket', () => {
  beforeEach(() => vi.resetModules());

  it('attaches to an existing non-terminal whatsapp_cs ticket for the same phone', async () => {
    const sb = makeSupabase({
      existing: [{ id: 't-open', status: 'in_progress', customer_phone: '972501234567' }],
    });
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket');
    const r = await openOrAttachCsTicket({
      accountId: 'acc-1', waId: '972501234567', customerPhone: '0501234567',
      customerName: 'דנה', topic: 'מוצר פגום',
    });
    expect(r.ticketId).toBe('t-open');
    expect(sb.inserts.length).toBe(0); // reused, not inserted
  });

  it('opens a new ticket when no open thread exists (source=whatsapp_cs)', async () => {
    const sb = makeSupabase({ existing: [{ id: 't-closed', status: 'closed', customer_phone: '972501234567' }] });
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket');
    const r = await openOrAttachCsTicket({
      accountId: 'acc-1', waId: '972501234567', customerPhone: '0501234567',
      customerName: null, topic: undefined,
    });
    expect(r.ticketId).toBe('ticket-new-1');
    const row = sb.inserts[0].row;
    expect(row.source).toBe('whatsapp_cs');
    expect(row.metadata.channel).toBe('whatsapp_cs');
    expect(row.status).toBe('new');
    expect(row.customer_name).toBeTruthy(); // NOT NULL fallback
    expect(row.message).toBeTruthy();       // NOT NULL fallback
  });

  it('a widget_cs source rides both the source column and metadata.channel (spec §8)', async () => {
    const sb = makeSupabase({ existing: [] });
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket');
    await openOrAttachCsTicket({
      accountId: 'acc-1', waId: 'v-77', customerPhone: '0501234567',
      customerName: 'דנה', source: 'widget_cs',
    });
    const row = sb.inserts[0].row;
    expect(row.source).toBe('widget_cs');
    expect(row.metadata.channel).toBe('widget_cs');
  });

  // Regression: an anonymous widget shopper has no phone. Writing the visitor id into
  // customer_phone made the inbox offer a WhatsApp send that Meta rejected with (#131009).
  it('stores no phone for an anonymous web shopper, and keeps the channel id for traceability', async () => {
    const sb = makeSupabase({ existing: [] });
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket');
    await openOrAttachCsTicket({
      accountId: 'acc-1', waId: 'aw_wxjdyhrzmt18914r', customerPhone: null,
      customerName: 'סיגלית', source: 'widget_cs',
    });
    const row = sb.inserts[0].row;
    expect(row.customer_phone).toBeNull();
    expect(row.metadata.channel_user_id).toBe('aw_wxjdyhrzmt18914r');
    expect(row.customer_name).toBe('סיגלית');
  });

  it('never stores a visitor id even if one is passed as the phone', async () => {
    const sb = makeSupabase({ existing: [] });
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket');
    await openOrAttachCsTicket({
      accountId: 'acc-1', waId: 'aw_x1', customerPhone: 'aw_x1',
      customerName: null, source: 'widget_cs',
    });
    expect(sb.inserts[0].row.customer_phone).toBeNull();
  });

  // Without a phone to match on, the shopper must still land back on their own thread —
  // otherwise every turn spawns a ticket.
  it('re-attaches a phoneless shopper by channel_user_id', async () => {
    const sb = makeSupabase({
      existing: [{ id: 't-web', status: 'new', customer_phone: null, metadata: { channel_user_id: 'aw_x1' } }],
    });
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket');
    const r = await openOrAttachCsTicket({
      accountId: 'acc-1', waId: 'aw_x1', customerPhone: null,
      customerName: null, source: 'widget_cs',
    });
    expect(r.ticketId).toBe('t-web');
    expect(sb.inserts.length).toBe(0);
  });

  it('does not cross-attach two different anonymous visitors', async () => {
    const sb = makeSupabase({
      existing: [{ id: 't-web', status: 'new', customer_phone: null, metadata: { channel_user_id: 'aw_someone_else' } }],
    });
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket');
    const r = await openOrAttachCsTicket({
      accountId: 'acc-1', waId: 'aw_x1', customerPhone: null,
      customerName: null, source: 'widget_cs',
    });
    expect(r.ticketId).toBe('ticket-new-1');
  });

  it('appendCsTicketHistory inserts one history row', async () => {
    const sb = makeSupabase({});
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { appendCsTicketHistory } = await import('@/lib/cs/cs-ticket');
    await appendCsTicketHistory({
      ticketId: 't1', accountId: 'acc-1', action: 'agent_message',
      actor: 'bestie_inbox', body_text: 'שלום', whatsapp_message_id: 'wamid.1',
    });
    expect(sb.inserts[0].table).toBe('support_ticket_history');
    expect(sb.inserts[0].row.action).toBe('agent_message');
  });
});
