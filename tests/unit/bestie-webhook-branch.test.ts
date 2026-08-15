import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above ordinary declarations, so anything they
// close over has to be created by vi.hoisted().
const h = vi.hoisted(() => ({
  enqueue: vi.fn(async () => ({ enqueued: true, queueLen: 1 })),
  publish: vi.fn(async () => {}),
  session: { row: null as any },
}));
const { enqueue, publish } = h;

vi.mock('@/lib/bestie/wa-lead-queue', () => ({ enqueueLeadMessage: h.enqueue }));
vi.mock('@/lib/bestie/wa-lead-publish', () => ({ publishLeadDrain: h.publish }));
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendReaction: vi.fn(async () => ({ success: true })),
  sendTyping: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.session.row }) }) }),
    }),
  }),
}));

import { maybeRouteBestieLead } from '@/lib/bestie/route-inbound-lead';

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


const knownLead = { wa_id: '972501234567', lead_id: 'L1', bot_paused: false };

const base = {
  isItamar: false,
  handledAsAgent: false,
  ticketId: null as string | null,
  waId: '972501234567',
  contactId: 'c1',
  msg: { id: 'm1', type: 'text' },
  textBody: 'כן, ספרו לי',
};

beforeEach(() => { enqueue.mockClear(); publish.mockClear(); h.session.row = null; });

describe('the fifth branch', () => {
  it('claims an inbound from a known lead', async () => {
    h.session.row = knownLead;
    expect((await maybeRouteBestieLead(base)).claimed).toBe(true);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('does not claim a stranger — that is customer service', async () => {
    h.session.row = null;
    expect((await maybeRouteBestieLead(base)).claimed).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  // The next three protect flows already running in production.
  it('never claims Itamar', async () => {
    h.session.row = knownLead;
    expect((await maybeRouteBestieLead({ ...base, isItamar: true })).claimed).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('never claims a registered agent', async () => {
    h.session.row = knownLead;
    expect((await maybeRouteBestieLead({ ...base, handledAsAgent: true })).claimed).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('never claims a message that matched an open support ticket', async () => {
    h.session.row = knownLead;
    expect((await maybeRouteBestieLead({ ...base, ticketId: 'T1' })).claimed).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('claims but stays silent once handed off to a salesperson', async () => {
    h.session.row = { ...knownLead, bot_paused: true };
    const result = await maybeRouteBestieLead(base);
    // Claimed so customer service does not adopt the thread, but not queued —
    // a human owns this conversation now.
    expect(result.claimed).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not claim when the queue is unreachable, so the message can still be triaged', async () => {
    h.session.row = knownLead;
    enqueue.mockRejectedValueOnce(new Error('redis down') as never);
    expect((await maybeRouteBestieLead(base)).claimed).toBe(false);
  });
});
