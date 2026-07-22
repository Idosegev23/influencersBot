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
