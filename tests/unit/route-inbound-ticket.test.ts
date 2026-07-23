import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression lock for the 2026-07-22 live "stuck" bug: the Bestie CS bot opens one
// support_request (source='whatsapp_cs') per conversation. routeInboundToTicket ran BEFORE the
// CS 4th branch and its Strategy-3 phone match claimed that very ticket, so every follow-up the
// shopper sent was appended to the ticket and NEVER reached runCsTurn — the thread looked stuck.
// The fix: Strategy 3 skips whatsapp_cs tickets so the webhook falls through to CS.

const H: any = { outbounds: [], candidates: [], applied: [] };

vi.mock('@/lib/whatsapp-cloud/client', () => ({
  toWaId: (s: string) => String(s).replace(/\D/g, '').replace(/^0/, '972'),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const c: any = { _table: table };
      c.select = () => c;
      c.in = () => c;
      c.not = () => c;
      c.gte = () => c;
      c.order = () => c;
      c.limit = () => c;
      c.eq = () => c;
      c.is = () => c;
      c.update = () => { H.applied.push({ kind: 'update', table }); return c; };
      c.insert = async () => { H.applied.push({ kind: 'insert', table }); return { data: null, error: null }; };
      c.maybeSingle = async () => ({ data: table === 'support_requests' ? { status: 'in_progress' } : null, error: null });
      c.single = async () => ({ data: null, error: null });
      c.then = (resolve: any) => resolve({
        data: table === 'support_ticket_history' ? H.outbounds
          : table === 'support_requests' ? H.candidates
          : [],
        error: null,
      });
      return c;
    },
  },
}));

const input = (over: any = {}) => ({
  waId: '972559749242', textBody: 'יש לי בעיה בהזמנה שלי', waMessageId: 'w1', contactId: 'c1', ...over,
});

describe('routeInboundToTicket — Strategy 3 excludes CS-owned tickets', () => {
  beforeEach(() => { H.outbounds = []; H.candidates = []; H.applied = []; });

  it('does NOT claim a whatsapp_cs ticket → returns null so the webhook falls through to CS', async () => {
    H.candidates = [
      { id: 'cs-1', account_id: 'acc-1', customer_phone: '972559749242', status: 'in_progress', updated_at: '2026-07-22T18:00:00Z', source: 'whatsapp_cs' },
    ];
    const { routeInboundToTicket } = await import('@/lib/support/route-inbound');
    const res = await routeInboundToTicket(input());
    expect(res.ticketId).toBeNull();
    // and it did NOT append a customer_reply row to the CS ticket's history
    expect(H.applied.some((a: any) => a.kind === 'insert')).toBe(false);
  });

  it('does NOT claim an auto_escalation catch-net ticket (bot/handoff-owned) → returns null', async () => {
    // resumeBot never resolves the auto_escalation ticket, so a lingering status='new' row must not
    // absorb later inbound via a bare phone match (would re-create the "stuck" bug post-resume).
    H.candidates = [
      { id: 'esc-1', account_id: 'acc-1', customer_phone: '972559749242', status: 'new', updated_at: '2026-07-22T18:10:00Z', source: 'auto_escalation' },
    ];
    const { routeInboundToTicket } = await import('@/lib/support/route-inbound');
    const res = await routeInboundToTicket(input());
    expect(res.ticketId).toBeNull();
    expect(H.applied.some((a: any) => a.kind === 'insert')).toBe(false);
  });

  it('skips BOTH bot-owned sources but still matches a NON-CS ticket for the same phone', async () => {
    H.candidates = [
      { id: 'cs-1', account_id: 'acc-1', customer_phone: '972559749242', status: 'in_progress', updated_at: '2026-07-22T18:05:00Z', source: 'whatsapp_cs' },
      { id: 'esc-1', account_id: 'acc-1', customer_phone: '972559749242', status: 'new', updated_at: '2026-07-22T18:04:00Z', source: 'auto_escalation' },
      { id: 'sup-2', account_id: 'acc-2', customer_phone: '972559749242', status: 'new', updated_at: '2026-07-22T17:00:00Z', source: 'whatsapp' },
    ];
    const { routeInboundToTicket } = await import('@/lib/support/route-inbound');
    const res = await routeInboundToTicket(input());
    expect(res.ticketId).toBe('sup-2');
    expect(res.matchedBy).toBe('phone');
    expect(H.applied.some((a: any) => a.kind === 'insert')).toBe(true); // reply appended to the real ticket
  });

  // Strategy 2 (recent_outbound): a bot-owned ticket must NOT be claimed via an automated
  // customer_notified status ping — that stole the shopper's next reply from the bot (live 2026-07-23).
  it('Strategy 2 does NOT claim a bot-owned ticket via an automated customer_notified (→ CS handles)', async () => {
    H.outbounds = [{ ticket_id: 'cs-1', account_id: 'acc-1', created_at: '2026-07-23T06:10:00Z', action: 'customer_notified',
      support_requests: { customer_phone: '972559749242', brand: null, customer_name: null, source: 'whatsapp_cs' } }];
    const { routeInboundToTicket } = await import('@/lib/support/route-inbound');
    const res = await routeInboundToTicket(input());
    expect(res.ticketId).toBeNull();
  });

  it('Strategy 2 DOES claim a bot-owned ticket after a human agent_message (genuine takeover)', async () => {
    H.outbounds = [{ ticket_id: 'cs-1', account_id: 'acc-1', created_at: '2026-07-23T06:10:00Z', action: 'agent_message',
      support_requests: { customer_phone: '972559749242', brand: 'Argania', customer_name: 'עידו', source: 'whatsapp_cs' } }];
    const { routeInboundToTicket } = await import('@/lib/support/route-inbound');
    const res = await routeInboundToTicket(input());
    expect(res.ticketId).toBe('cs-1');
    expect(res.matchedBy).toBe('recent_outbound');
  });

  it('Strategy 2 still claims a NON-bot ticket via customer_notified (legacy reply-routing intact)', async () => {
    H.outbounds = [{ ticket_id: 'sup-9', account_id: 'acc-2', created_at: '2026-07-23T06:10:00Z', action: 'customer_notified',
      support_requests: { customer_phone: '972559749242', brand: 'X', customer_name: 'Y', source: 'whatsapp' } }];
    const { routeInboundToTicket } = await import('@/lib/support/route-inbound');
    const res = await routeInboundToTicket(input());
    expect(res.ticketId).toBe('sup-9');
    expect(res.matchedBy).toBe('recent_outbound');
  });
});
