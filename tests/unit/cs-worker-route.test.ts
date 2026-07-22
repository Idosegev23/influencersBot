import { describe, it, expect, vi, beforeEach } from 'vitest';

const verify = vi.fn();
const runCsDrain = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({ verifyQStashSignature: (...a: any[]) => verify(...a) }));
vi.mock('@/lib/cs/wa-cs-worker', () => ({ runCsDrain: (...a: any[]) => runCsDrain(...a) }));

// ---- cs-drain-sweep cron deps (only used by the sweep describe below) ----
const sweepState: any = { sessions: [] };
const qlenSweep = vi.fn();
const redisExistsSweep = vi.fn();
const publishSweep = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ gte: async () => ({ data: sweepState.sessions, error: null }) }) }) },
}));
vi.mock('@/lib/cs/wa-cs-queue', () => ({ csQueueLength: (...a: any[]) => qlenSweep(...a) }));
vi.mock('@/lib/cs/wa-cs-publish', () => ({ publishCsDrain: (...a: any[]) => publishSweep(...a) }));
vi.mock('@/lib/redis', () => ({ redisExists: (...a: any[]) => redisExistsSweep(...a) }));

function req(body: any) {
  return { text: async () => JSON.stringify(body), headers: { get: () => 'sig' } } as any;
}

describe('POST /api/cs/wa-worker', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('401s on a bad QStash signature', async () => {
    verify.mockResolvedValue(false);
    const { POST } = await import('@/app/api/cs/wa-worker/route');
    const res = await POST(req({ drain: true, waId: 'x' }));
    expect(res.status).toBe(401);
    expect(runCsDrain).not.toHaveBeenCalled();
  });

  it('runs the drain when signed and body.drain+waId present', async () => {
    verify.mockResolvedValue(true);
    runCsDrain.mockResolvedValue({ status: 'ok', processed: 2 });
    const { POST } = await import('@/app/api/cs/wa-worker/route');
    const res = await POST(req({ drain: true, waId: '972500000000' }));
    expect(res.status).toBe(200);
    expect(runCsDrain).toHaveBeenCalledWith('972500000000');
  });
});

describe('GET /api/cron/cs-drain-sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sweepState.sessions = [{ wa_id: 'wa-1' }];
    qlenSweep.mockResolvedValue(2);
    redisExistsSweep.mockResolvedValue(false);
    publishSweep.mockResolvedValue(undefined);
  });

  it('force-drains an orphaned queue when the lock is free', async () => {
    const { GET } = await import('@/app/api/cron/cs-drain-sweep/route');
    const res = await GET();
    const json = await res.json();
    expect(publishSweep).toHaveBeenCalledWith('wa-1', { force: true });
    expect(json.swept).toEqual([{ waId: 'wa-1', queued: 2 }]);
  });

  it('skips a queue whose lock is held (marks it seen-but-busy, no publish)', async () => {
    redisExistsSweep.mockResolvedValue(true);
    const { GET } = await import('@/app/api/cron/cs-drain-sweep/route');
    const res = await GET();
    const json = await res.json();
    expect(publishSweep).not.toHaveBeenCalled();
    expect(json.swept).toEqual([{ waId: 'wa-1', queued: -2 }]); // negative = seen-but-busy
  });

  it('ignores a session with an empty queue', async () => {
    qlenSweep.mockResolvedValue(0);
    const { GET } = await import('@/app/api/cron/cs-drain-sweep/route');
    const res = await GET();
    const json = await res.json();
    expect(publishSweep).not.toHaveBeenCalled();
    expect(json.swept).toEqual([]);
  });
});
