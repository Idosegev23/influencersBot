import { describe, it, expect } from 'vitest';
import { whatsappIdentity, identityKey, identityPhone } from '@/lib/cs/identity';
import { csQueueKey, csLockKey, csDedupKey, csDrainDedupId } from '@/lib/cs/wa-cs-keys';

describe('whatsapp identity carries the business number', () => {
  it('identityKey exposes waChannelId alongside the medium', () => {
    const id = whatsappIdentity('972500000000', 'ch-1');
    expect(identityKey(id)).toEqual({ channel: 'whatsapp', channelUserId: '972500000000', waChannelId: 'ch-1' });
  });

  it('identityPhone is unchanged — still the wa_id', () => {
    expect(identityPhone(whatsappIdentity('972500000000', 'ch-1'))).toBe('972500000000');
  });

  it('non-whatsapp media report a null waChannelId', () => {
    const id = { channel: 'widget', visitorId: 'aw_1', trust: 'unverified' } as const;
    expect(identityKey(id).waChannelId).toBeNull();
  });
});

describe('redis + qstash keys are channel-scoped', () => {
  it('the same shopper on two numbers gets two queues', () => {
    expect(csQueueKey('ch-1', '972500000000')).toBe('cs:ch-1:wa:972500000000:q');
    expect(csQueueKey('ch-2', '972500000000')).toBe('cs:ch-2:wa:972500000000:q');
    expect(csQueueKey('ch-1', '972500000000')).not.toBe(csQueueKey('ch-2', '972500000000'));
  });

  it('locks are per channel too', () => {
    expect(csLockKey('ch-1', '972500000000')).toBe('cs:ch-1:wa:972500000000:lock');
  });

  it('the wamid dedup guard is channel-scoped', () => {
    expect(csDedupKey('ch-1', 'wamid.ABC')).toBe('cs:ch-1:wa:wamid.ABC:queued');
  });

  it('the QStash dedup id contains no colon — QStash rejects them', () => {
    const id = csDrainDedupId('ch-1', '972500000000', 17_000_000);
    expect(id).toBe('csdrain_ch-1_972500000000_17000000');
    expect(id).not.toContain(':');
  });
});
