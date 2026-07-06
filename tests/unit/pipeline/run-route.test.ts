import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/qstash', () => ({ verifyQStashSignature: vi.fn().mockResolvedValue(true), publishStep: vi.fn() }));
vi.mock('@/lib/pipeline/locks', () => ({ acquireStepLock: vi.fn().mockResolvedValue(true) }));
const addStepLog = vi.fn(); const markSucceeded = vi.fn();
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({ getScanJobsRepo: () => ({ addStepLog, markSucceeded, markFailed: vi.fn(), getById: async () => ({ id: 'j1', account_id: 'a1', username: 'u' }) }) }));
vi.mock('@/lib/pipeline/state', () => ({ loadState: async () => ({ currentStep: 'finalize', counts: {}, cursors: {}, options: {} }), saveState: vi.fn() }));
vi.mock('@/lib/pipeline/steps', () => ({ STEP_HANDLERS: { finalize: async () => ({ status: 'advance' }) } }));

describe('POST /api/pipeline/run', () => {
  it('marks job succeeded when the last step advances', async () => {
    const { POST } = await import('@/app/api/pipeline/run/route');
    const req = new Request('http://x/api/pipeline/run', { method: 'POST', body: JSON.stringify({ jobId: 'j1', step: 'finalize', batch: 0 }) });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(markSucceeded).toHaveBeenCalledWith('j1', expect.anything());
  });
});
