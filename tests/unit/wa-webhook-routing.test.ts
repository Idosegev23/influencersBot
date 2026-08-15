import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveByPnid = vi.fn();
vi.mock('@/lib/whatsapp-cloud/channels', () => ({
  resolveChannelByPhoneNumberId: (...a: any[]) => resolveByPnid(...a),
}));

import { classifyInbound } from '@/app/api/webhooks/whatsapp/routing';

const BESTIE   = { id: 'ch-bestie',   accountId: 'acc-bestie',   phoneNumberId: 'PNID_B', status: 'active' };
const CUSTOMER = { id: 'ch-customer', accountId: 'acc-customer', phoneNumberId: 'PNID_C', status: 'active' };

beforeEach(() => resolveByPnid.mockReset());

describe('inbound is classified by NUMBER, not by sender', () => {
  it('Bestie’s number takes the existing multi-tenant path', async () => {
    resolveByPnid.mockResolvedValue(BESTIE);
    const r = await classifyInbound('PNID_B', 'acc-bestie');
    expect(r.kind).toBe('bestie');
    expect(r.channel?.id).toBe('ch-bestie');
  });

  it('a customer number takes the single-tenant path with the account pre-bound', async () => {
    resolveByPnid.mockResolvedValue(CUSTOMER);
    const r = await classifyInbound('PNID_C', 'acc-bestie');
    expect(r.kind).toBe('customer');
    expect(r.boundAccountId).toBe('acc-customer');
  });

  it('an unknown number is dropped, not thrown — Meta retries forever on non-200', async () => {
    resolveByPnid.mockResolvedValue(null);
    const r = await classifyInbound('PNID_UNKNOWN', 'acc-bestie');
    expect(r.kind).toBe('unknown');
    expect(r.channel).toBeNull();
  });

  it('with BESTIE_ACCOUNT_ID unset, a known number is never mistaken for Bestie', async () => {
    resolveByPnid.mockResolvedValue(CUSTOMER);
    const r = await classifyInbound('PNID_C', undefined);
    expect(r.kind).toBe('customer');
  });
});
