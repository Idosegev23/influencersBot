import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: Record<string, string[]> = {};
const setnx: Record<string, boolean> = {};

vi.mock('@/lib/redis', () => ({
  redisRPush: vi.fn(async (key: string, items: string[]) => {
    store[key] = [...(store[key] ?? []), ...items];
    return store[key].length;
  }),
  redisLPopCount: vi.fn(async (key: string, count: number) => (store[key] ?? []).splice(0, count)),
  redisLLen: vi.fn(async (key: string) => (store[key] ?? []).length),
  redisSetNx: vi.fn(async (key: string) => (setnx[key] ? false : (setnx[key] = true))),
  redisDel: vi.fn(async () => 1),
  redisGet: vi.fn(async () => null),
}));

import {
  enqueueLeadMessage,
  dequeueLeadMessage,
  leadQueueLength,
} from '@/lib/bestie/wa-lead-queue';
import { acquireLeadLock, releaseLeadLock } from '@/lib/bestie/wa-lead-locks';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(setnx)) delete setnx[k];
});

describe('lead queue', () => {
  it('queues a message and hands it back in arrival order', async () => {
    await enqueueLeadMessage({ waId: '972501234567', msg: { id: 'm1' }, textBody: 'שלום' });
    await enqueueLeadMessage({ waId: '972501234567', msg: { id: 'm2' }, textBody: 'עוד' });
    expect((await dequeueLeadMessage('972501234567'))!.textBody).toBe('שלום');
    expect((await dequeueLeadMessage('972501234567'))!.textBody).toBe('עוד');
    expect(await dequeueLeadMessage('972501234567')).toBeNull();
  });

  it('makes a redelivered webhook a no-op', async () => {
    // Meta retries; the same message must not produce two replies.
    const job = { waId: '972501234567', msg: { id: 'same' }, textBody: 'היי' };
    expect((await enqueueLeadMessage(job)).enqueued).toBe(true);
    expect((await enqueueLeadMessage(job)).enqueued).toBe(false);
    expect(await leadQueueLength('972501234567')).toBe(1);
  });

  it('keeps two leads in separate queues', async () => {
    await enqueueLeadMessage({ waId: '972500000001', msg: { id: 'a' }, textBody: 'A' });
    await enqueueLeadMessage({ waId: '972500000002', msg: { id: 'b' }, textBody: 'B' });
    expect((await dequeueLeadMessage('972500000001'))!.textBody).toBe('A');
    expect(await dequeueLeadMessage('972500000001')).toBeNull();
    expect((await dequeueLeadMessage('972500000002'))!.textBody).toBe('B');
  });

  it('uses its own redis namespace, not the customer-service one', async () => {
    // A shared key would let a CS drain pop a lead's message and vice versa.
    await enqueueLeadMessage({ waId: '972501234567', msg: { id: 'm1' }, textBody: 'x' });
    expect(Object.keys(store).some(k => k.startsWith('bestie:wa:'))).toBe(true);
    expect(Object.keys(store).some(k => k.startsWith('cs:wa:'))).toBe(false);
  });
});

describe('lead lock', () => {
  it('admits one holder and refuses a sibling until released', async () => {
    expect(await acquireLeadLock('972501234567')).toBe(true);
    expect(await acquireLeadLock('972501234567')).toBe(false);
    await releaseLeadLock('972501234567');
  });

  it('locks each lead independently', async () => {
    expect(await acquireLeadLock('972500000001')).toBe(true);
    expect(await acquireLeadLock('972500000002')).toBe(true);
  });
});
