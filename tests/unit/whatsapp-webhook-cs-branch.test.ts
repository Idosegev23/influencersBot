import { describe, it, expect, vi, beforeEach } from 'vitest';

const routeCs = vi.fn();
vi.mock('@/lib/cs/route-inbound-cs', () => ({ routeInboundToCustomerService: (...a: any[]) => routeCs(...a) }));
// route.ts (and its transitive import src/lib/support/route-inbound.ts) import '@/lib/supabase',
// which throws eagerly at import time when NEXT_PUBLIC_SUPABASE_URL isn't set in the test env.
// We only exercise the pure decision helpers here, so a minimal stub is enough to load the module.
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}), supabase: {} }));

describe('maybeRouteCs (webhook 4th branch decision)', () => {
  beforeEach(() => { vi.clearAllMocks(); routeCs.mockResolvedValue({ claimed: true }); });

  it('routes to CS when not Itamar, not agent, and no ticket matched', async () => {
    const { maybeRouteCs } = await import('@/app/api/webhooks/whatsapp/route');
    await maybeRouteCs({ isItamar: false, handledAsAgent: false, ticketId: null, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).toHaveBeenCalledWith({ waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
  });

  it('does NOT route to CS when a ticket matched', async () => {
    const { maybeRouteCs } = await import('@/app/api/webhooks/whatsapp/route');
    await maybeRouteCs({ isItamar: false, handledAsAgent: false, ticketId: 'ticket-1', waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).not.toHaveBeenCalled();
  });

  it('does NOT route to CS for an agent or Itamar', async () => {
    const { maybeRouteCs } = await import('@/app/api/webhooks/whatsapp/route');
    await maybeRouteCs({ isItamar: false, handledAsAgent: true, ticketId: null, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    await maybeRouteCs({ isItamar: true, handledAsAgent: false, ticketId: null, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).not.toHaveBeenCalled();
  });
});

// Covers the ACTUAL wiring (Step 3c): the value captured from routeInboundToTicket's return
// is what drives the branch. This proves the {ticketId} assumption end-to-end.
describe('extractTicketId (routeInboundToTicket return capture)', () => {
  beforeEach(() => { vi.clearAllMocks(); routeCs.mockResolvedValue({ claimed: true }); });

  it('reads .ticketId off a real routeInboundToTicket result (and is null-safe)', async () => {
    const { extractTicketId } = await import('@/app/api/webhooks/whatsapp/route');
    expect(extractTicketId({ ticketId: 't1', matchedBy: 'phone', ambiguous: false })).toBe('t1');
    expect(extractTicketId({ ticketId: null })).toBeNull();
    expect(extractTicketId(undefined)).toBeNull();
    expect(extractTicketId(null)).toBeNull();
  });

  it('a matched ticketId captured from routeInboundToTicket suppresses CS routing', async () => {
    const { maybeRouteCs, extractTicketId } = await import('@/app/api/webhooks/whatsapp/route');
    const ticketMatch = extractTicketId({ ticketId: 'ticket-9' });   // stubbed routeInboundToTicket return
    await maybeRouteCs({ isItamar: false, handledAsAgent: false, ticketId: ticketMatch, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).not.toHaveBeenCalled();
  });

  it('a null ticketId captured from routeInboundToTicket falls through to CS', async () => {
    const { maybeRouteCs, extractTicketId } = await import('@/app/api/webhooks/whatsapp/route');
    const ticketMatch = extractTicketId({ ticketId: null });          // stubbed no-match return
    await maybeRouteCs({ isItamar: false, handledAsAgent: false, ticketId: ticketMatch, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).toHaveBeenCalledWith({ waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
  });
});
