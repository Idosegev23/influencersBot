import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    const r = await routeInboundToCustomerService({ waId: '972500000000', contactId: 'c1', msg: { id: 'm1' }, textBody: 'שלום' });
    expect(sendReaction).toHaveBeenCalledWith({ to: '972500000000', messageId: 'm1', emoji: '👀' });
    expect(sendTyping).toHaveBeenCalledWith('m1');
    expect(enqueue).toHaveBeenCalledWith({ waId: '972500000000', contactId: 'c1', msg: { id: 'm1' }, textBody: 'שלום' });
    expect(publish).toHaveBeenCalledWith('972500000000');
    expect(r).toEqual({ claimed: true });
  });

  it('still claimed when publish fails (next inbound drains it)', async () => {
    publish.mockRejectedValue(new Error('qstash down'));
    const { routeInboundToCustomerService } = await import('@/lib/cs/route-inbound-cs');
    const r = await routeInboundToCustomerService({ waId: 'x', contactId: null, msg: { id: 'm2' }, textBody: 'hi' });
    expect(r).toEqual({ claimed: true });
  });

  it('not claimed when Redis enqueue throws', async () => {
    enqueue.mockRejectedValue(new Error('redis down'));
    const { routeInboundToCustomerService } = await import('@/lib/cs/route-inbound-cs');
    const r = await routeInboundToCustomerService({ waId: 'x', contactId: null, msg: { id: 'm3' }, textBody: 'hi' });
    expect(r).toEqual({ claimed: false });
    expect(publish).not.toHaveBeenCalled();
  });
});
