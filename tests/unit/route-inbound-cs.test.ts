import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sends are channel-scoped now; unit tests must not perform real channel resolution.
vi.mock('@/lib/whatsapp-cloud/channels', () => ({
  getBestieChannel: vi.fn(async () => ({
    id: 'ch-test', accountId: 'acc-test', wabaId: 'waba-test',
    phoneNumberId: 'PNID_TEST', displayPhoneNumber: '+972 54-390-2030',
    verifiedName: 'Bestie', token: 'TOK_TEST', status: 'active', paymentReady: true,
  })),
  resolveChannelByAccount: vi.fn(async () => null),
  resolveChannelByPhoneNumberId: vi.fn(async () => null),
  invalidateChannelCache: vi.fn(async () => {}),
}));


const sendReaction = vi.fn();
const sendTyping = vi.fn();
const enqueue = vi.fn();
const publish = vi.fn();

vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendReaction: (...a: any[]) => sendReaction(...a),
  sendTyping: (...a: any[]) => sendTyping(...a),
}));
vi.mock('@/lib/cs/wa-cs-queue', () => ({ enqueueCsMessage: (...a: any[]) => enqueue(...a) }));
vi.mock('@/lib/cs/wa-cs-publish', () => ({ publishCsDrain: (...a: any[]) => publish(...a) }));

describe('routeInboundToCustomerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendReaction.mockResolvedValue(true);
    sendTyping.mockResolvedValue(true);
    enqueue.mockResolvedValue({ enqueued: true, queueLen: 1 });
    publish.mockResolvedValue(undefined);
  });

  it('claims the message: reaction + typing + enqueue + publish', async () => {
    const { routeInboundToCustomerService } = await import('@/lib/cs/route-inbound-cs');
    const r = await routeInboundToCustomerService({ waChannelId: 'ch-1', channel: { id: 'ch-1', phoneNumberId: 'PNID', token: 'T' } as any, waId: '972500000000', contactId: 'c1', msg: { id: 'm1' }, textBody: 'שלום' });
    expect(sendReaction).toHaveBeenCalledWith(expect.objectContaining({ to: '972500000000', messageId: 'm1', emoji: '👀' }));
    expect(sendTyping).toHaveBeenCalledWith('m1', expect.objectContaining({ id: 'ch-1' }));
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ waChannelId: 'ch-1', waId: '972500000000', contactId: 'c1', msg: { id: 'm1' }, textBody: 'שלום' }));
    expect(publish).toHaveBeenCalledWith('ch-1', '972500000000');
    expect(r).toEqual({ claimed: true });
  });

  it('still claimed when publish fails (next inbound drains it)', async () => {
    publish.mockRejectedValue(new Error('qstash down'));
    const { routeInboundToCustomerService } = await import('@/lib/cs/route-inbound-cs');
    const r = await routeInboundToCustomerService({ waChannelId: 'ch-1', channel: { id: 'ch-1', phoneNumberId: 'PNID', token: 'T' } as any, waId: 'x', contactId: null, msg: { id: 'm2' }, textBody: 'hi' });
    expect(r).toEqual({ claimed: true });
  });

  it('not claimed when Redis enqueue throws', async () => {
    enqueue.mockRejectedValue(new Error('redis down'));
    const { routeInboundToCustomerService } = await import('@/lib/cs/route-inbound-cs');
    const r = await routeInboundToCustomerService({ waChannelId: 'ch-1', channel: { id: 'ch-1', phoneNumberId: 'PNID', token: 'T' } as any, waId: 'x', contactId: null, msg: { id: 'm3' }, textBody: 'hi' });
    expect(r).toEqual({ claimed: false });
    expect(publish).not.toHaveBeenCalled();
  });
});
