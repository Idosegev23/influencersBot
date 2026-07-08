import { describe, it, expect, vi } from 'vitest';

const redisSetNx = vi.fn();
const redisDel = vi.fn().mockResolvedValue(1);
vi.mock('@/lib/redis', () => ({ redisSetNx, redisDel }));

describe('agent lock', () => {
  it('acquires with the per-agent key + ttl and releases it', async () => {
    redisSetNx.mockResolvedValueOnce(true);
    const { acquireAgentLock, releaseAgentLock } = await import('@/lib/crm/wa-locks');
    expect(await acquireAgentLock('agent-1')).toBe(true);
    expect(redisSetNx).toHaveBeenCalledWith('wa:agent:agent-1:lock', '1', 300);
    await releaseAgentLock('agent-1');
    expect(redisDel).toHaveBeenCalledWith('wa:agent:agent-1:lock');
  });
  it('returns false when the lock is held', async () => {
    redisSetNx.mockResolvedValueOnce(false);
    const { acquireAgentLock } = await import('@/lib/crm/wa-locks');
    expect(await acquireAgentLock('agent-2')).toBe(false);
  });
});
