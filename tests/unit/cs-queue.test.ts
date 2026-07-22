import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpush = vi.fn();
const lpop = vi.fn();
const llen = vi.fn();
const setnx = vi.fn();
const del = vi.fn();

vi.mock('@/lib/redis', () => ({
  redisRPush: (...a: any[]) => rpush(...a),
  redisLPopCount: (...a: any[]) => lpop(...a),
  redisLLen: (...a: any[]) => llen(...a),
  redisSetNx: (...a: any[]) => setnx(...a),
  redisDel: (...a: any[]) => del(...a),
}));

describe('CS queue + locks', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('enqueues onto cs:wa:<waId>:q behind a per-wamid SETNX dedup', async () => {
    setnx.mockResolvedValue(true);
    rpush.mockResolvedValue(1);
    const { enqueueCsMessage } = await import('@/lib/cs/wa-cs-queue');
    const r = await enqueueCsMessage({ waId: '972500000000', msg: { id: 'wamid.A' }, textBody: 'hi' });
    expect(setnx).toHaveBeenCalledWith('cs:wa:wamid.A:queued', '1', 86_400);
    expect(rpush).toHaveBeenCalledWith('cs:wa:972500000000:q', [expect.any(String)]);
    expect(r).toEqual({ enqueued: true, queueLen: 1 });
  });

  it('a duplicate wamid does not push again', async () => {
    setnx.mockResolvedValue(false);
    llen.mockResolvedValue(3);
    const { enqueueCsMessage } = await import('@/lib/cs/wa-cs-queue');
    const r = await enqueueCsMessage({ waId: '972500000000', msg: { id: 'wamid.A' }, textBody: 'hi' });
    expect(rpush).not.toHaveBeenCalled();
    expect(r).toEqual({ enqueued: false, queueLen: 3 });
  });

  it('dequeues FIFO (LPOP count=1) and parses JSON', async () => {
    lpop.mockResolvedValue([JSON.stringify({ waId: 'x', msg: { id: 'm' }, textBody: 't' })]);
    const { dequeueCsMessage } = await import('@/lib/cs/wa-cs-queue');
    const j = await dequeueCsMessage('x');
    expect(lpop).toHaveBeenCalledWith('cs:wa:x:q', 1);
    expect(j?.textBody).toBe('t');
  });

  it('acquireCsLock SETNX on cs:wa:<waId>:lock with TTL 300', async () => {
    setnx.mockResolvedValue(true);
    const { acquireCsLock, releaseCsLock } = await import('@/lib/cs/wa-cs-locks');
    expect(await acquireCsLock('x')).toBe(true);
    expect(setnx).toHaveBeenCalledWith('cs:wa:x:lock', '1', 300);
    await releaseCsLock('x');
    expect(del).toHaveBeenCalledWith('cs:wa:x:lock');
  });
});
