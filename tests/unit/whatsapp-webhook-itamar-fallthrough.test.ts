/**
 * Regression: being on the handoff allow-list must not permanently disable the
 * shopper path for that number.
 *
 * Live 2026-09-08 — ITAMAR_WHATSAPP_NUMBER held Ido's own phone, so every one of
 * his messages hit `if (args.isItamar) return` in all four downstream branches and
 * got NOTHING back. 12 messages over 3+ weeks, silent. The allow-list means "this
 * person may answer a handoff", not "this person can never be a customer" — so the
 * branches must key off whether processItamarReply ACTUALLY consumed the message,
 * not off who sent it.
 *
 * These drive the real POST handler (not just maybeRouteCs) because the defect was
 * in processWebhook's wiring: it discarded processItamarReply's boolean return and
 * re-derived the guard from isItamarSender(waId).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  processItamarReply: vi.fn(async (..._a: any[]) => false),
  isItamarSender: vi.fn((..._a: any[]) => true),
  routeCs: vi.fn(async (..._a: any[]) => ({ claimed: true })),
  routeLead: vi.fn(async (..._a: any[]) => ({ claimed: false })),
  routeTicket: vi.fn(async (..._a: any[]) => ({ ticketId: null as string | null, matchedBy: null })),
}));

vi.mock('@/lib/handoff/process-itamar-reply', () => ({
  isItamarSender: h.isItamarSender,
  processItamarReply: h.processItamarReply,
}));
vi.mock('@/lib/cs/route-inbound-cs', () => ({ routeInboundToCustomerService: h.routeCs }));
vi.mock('@/lib/bestie/route-inbound-lead', () => ({ maybeRouteBestieLead: h.routeLead }));
vi.mock('@/lib/support/route-inbound', () => ({ routeInboundToTicket: h.routeTicket }));

vi.mock('@/lib/whatsapp-cloud/signature', () => ({
  verifyWhatsAppSignature: () => ({ valid: true, reason: null }),
}));

const BESTIE_CHANNEL = {
  id: 'ch-bestie', accountId: 'acc-bestie', wabaId: 'waba-1', phoneNumberId: 'PNID_B',
  displayPhoneNumber: '+972 54-390-2030', verifiedName: 'Bestie', token: 'TOK',
  status: 'active', paymentReady: true,
};
vi.mock('@/lib/whatsapp-cloud/channels', () => ({
  resolveChannelByPhoneNumberId: vi.fn(async () => BESTIE_CHANNEL),
  resolveWaChannelById: vi.fn(async () => BESTIE_CHANNEL),
  getBestieChannel: vi.fn(async () => BESTIE_CHANNEL),
  resolveChannelByAccount: vi.fn(async () => null),
  invalidateChannelCache: vi.fn(async () => {}),
}));
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  toWaId: (p: string) => String(p || '').replace(/\D/g, ''),
  sendReaction: vi.fn(async () => ({ success: true })),
  sendTyping: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/crm/wa-queue', () => ({ publishDrain: vi.fn(async () => {}) }));
vi.mock('@/lib/crm/wa-agent-queue', () => ({ enqueueAgentMessage: vi.fn(async () => {}) }));

// Minimal chainable Supabase stub. One builder serves every shape the inbound path
// uses: `await q.select('id')` (array), `await q.select('id').single()` (row), and
// `await q.select().eq().maybeSingle()`. `users` resolves to null so the agent branch
// stays false and the message keeps flowing to the branch decisions under test.
function stubClient() {
  const rowFor = (table: string) =>
    table === 'whatsapp_conversations' ? { id: 'conv-1', unread_count: 0 } : { id: `${table}-row` };

  const make = (table: string): any => {
    const row = table === 'users' ? null : rowFor(table);
    const builder: any = {
      // Thenable: satisfies a directly-awaited query (…select('id') with no .single()).
      then: (resolve: any) => resolve({ data: row ? [row] : [], error: null }),
      single: async () => ({ data: row, error: null }),
      maybeSingle: async () => ({ data: row, error: null }),
    };
    for (const m of ['select', 'eq', 'in', 'gte', 'not', 'is', 'order', 'limit', 'update', 'upsert', 'insert']) {
      builder[m] = () => builder;
    }
    return builder;
  };
  return { from: (table: string) => make(table) };
}
vi.mock('@/lib/supabase', () => ({ createClient: () => stubClient(), supabase: stubClient() }));

function inboundPayload(text: string) {
  return {
    entry: [{
      id: 'waba-1',
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'PNID_B' },
          contacts: [{ wa_id: '972547667775', profile: { name: 'Triroars' } }],
          messages: [{
            from: '972547667775', id: 'wamid.TEST1', type: 'text',
            timestamp: '1757340000', text: { body: text },
          }],
        },
      }],
    }],
  };
}

async function postInbound(text: string) {
  const { POST } = await import('@/app/api/webhooks/whatsapp/route');
  const req = new Request('https://x.test/api/webhooks/whatsapp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=stub' },
    body: JSON.stringify(inboundPayload(text)),
  });
  return POST(req as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.isItamarSender.mockReturnValue(true);
  h.processItamarReply.mockResolvedValue(false);
  h.routeCs.mockResolvedValue({ claimed: true });
  h.routeLead.mockResolvedValue({ claimed: false });
  h.routeTicket.mockResolvedValue({ ticketId: null, matchedBy: null });
});

describe('allow-listed sender whose message is NOT a handoff reply', () => {
  it('still reaches the customer-service branch', async () => {
    await postInbound('אני רוצה לבדוק מה קורה עם ההזמנה שלי');

    expect(h.processItamarReply).toHaveBeenCalledTimes(1);
    expect(h.routeCs).toHaveBeenCalledWith(
      expect.objectContaining({ waId: '972547667775', textBody: 'אני רוצה לבדוק מה קורה עם ההזמנה שלי' }),
    );
  });

  it('still reaches the Bestie lead branch', async () => {
    await postInbound('כן, ספרו לי');
    expect(h.routeLead).toHaveBeenCalledWith(expect.objectContaining({ waId: '972547667775' }));
    // The lead branch decides for itself; it must not be pre-empted by the allow-list.
    expect(h.routeLead.mock.calls[0][0]).toMatchObject({ handledAsHandoffReply: false });
  });

  it('still reaches support-ticket routing', async () => {
    await postInbound('היי');
    expect(h.routeTicket).toHaveBeenCalledWith(expect.objectContaining({ waId: '972547667775' }));
  });
});

describe('allow-listed sender whose message IS consumed as a handoff reply', () => {
  it('is NOT handed to customer service, the lead funnel, or ticket routing', async () => {
    h.processItamarReply.mockResolvedValue(true);   // matched a pending handoff

    await postInbound('[#4G7V] היי יהודית, אשמח לעזור');

    expect(h.processItamarReply).toHaveBeenCalledTimes(1);
    expect(h.routeCs).not.toHaveBeenCalled();
    expect(h.routeTicket).not.toHaveBeenCalled();
    expect(h.routeLead.mock.calls[0][0]).toMatchObject({ handledAsHandoffReply: true });
  });

  it('stays silent when processItamarReply throws — we cannot tell if it matched', async () => {
    h.processItamarReply.mockRejectedValue(new Error('db blip'));

    await postInbound('[#4G7V] היי יהודית');

    expect(h.routeCs).not.toHaveBeenCalled();
    expect(h.routeTicket).not.toHaveBeenCalled();
  });
});

describe('an ordinary shopper is unaffected', () => {
  it('routes to customer service and never consults the handoff matcher', async () => {
    h.isItamarSender.mockReturnValue(false);

    await postInbound('מה מתאים לשיער יבש?');

    expect(h.processItamarReply).not.toHaveBeenCalled();
    expect(h.routeCs).toHaveBeenCalledWith(expect.objectContaining({ waId: '972547667775' }));
  });
});
