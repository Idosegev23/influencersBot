import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory Redis fake covering just the list + setnx ops the queue uses.
const lists = new Map<string, string[]>();
const kv = new Map<string, string>();

vi.mock('@/lib/redis', () => ({
  redisRPush: async (key: string, items: string[]) => {
    const arr = lists.get(key) || [];
    arr.push(...items);
    lists.set(key, arr);
    return arr.length;
  },
  redisLPopCount: async (key: string, count: number) => {
    const arr = lists.get(key) || [];
    const out = arr.splice(0, count);
    lists.set(key, arr);
    return out;
  },
  redisLLen: async (key: string) => (lists.get(key) || []).length,
  redisSetNx: async (key: string, value: string) => {
    if (kv.has(key)) return false;
    kv.set(key, value);
    return true;
  },
}));

import { enqueueAgentMessage, dequeueAgentMessage, agentQueueLength } from '@/lib/crm/wa-agent-queue';

const mk = (id: string, text: string) => ({ waId: '972500000000', agentId: 'agent-1', msg: { id, type: 'text' }, textBody: text });

beforeEach(() => { lists.clear(); kv.clear(); });

describe('per-agent FIFO queue', () => {
  it('preserves arrival order (FIFO) — brief before its later pricing', async () => {
    await enqueueAgentMessage(mk('m1', 'brief: fashion brand for Anna'));
    await enqueueAgentMessage(mk('m2', 'price Anna 200k'));
    await enqueueAgentMessage(mk('m3', 'send Anna the quote'));

    expect(await agentQueueLength('agent-1')).toBe(3);
    expect((await dequeueAgentMessage('agent-1'))?.msg.id).toBe('m1');
    expect((await dequeueAgentMessage('agent-1'))?.msg.id).toBe('m2');
    expect((await dequeueAgentMessage('agent-1'))?.msg.id).toBe('m3');
    expect(await dequeueAgentMessage('agent-1')).toBeNull();
  });

  it('dedups a redelivered wamid (same message enqueued twice → once)', async () => {
    const first = await enqueueAgentMessage(mk('dup', 'hello'));
    const second = await enqueueAgentMessage(mk('dup', 'hello'));
    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
    expect(await agentQueueLength('agent-1')).toBe(1);
  });

  it('isolates queues per agent', async () => {
    await enqueueAgentMessage({ ...mk('a', 'x'), agentId: 'agent-A' });
    await enqueueAgentMessage({ ...mk('b', 'y'), agentId: 'agent-B' });
    expect(await agentQueueLength('agent-A')).toBe(1);
    expect(await agentQueueLength('agent-B')).toBe(1);
    expect((await dequeueAgentMessage('agent-A'))?.msg.id).toBe('a');
    expect(await agentQueueLength('agent-A')).toBe(0);
    expect(await agentQueueLength('agent-B')).toBe(1);
  });

  it('a 15-message burst drains in exact send order', async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `burst-${i}`);
    for (const id of ids) await enqueueAgentMessage(mk(id, id));
    const drained: string[] = [];
    let job;
    while ((job = await dequeueAgentMessage('agent-1'))) drained.push(job.msg.id);
    expect(drained).toEqual(ids);
  });
});
