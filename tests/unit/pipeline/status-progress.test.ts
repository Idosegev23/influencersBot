import { describe, it, expect, vi } from 'vitest';

const getById = vi.fn();
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({ getScanJobsRepo: () => ({ getById }) }));

describe('GET /api/pipeline/status/[jobId]', () => {
  it('returns progress fields and a non-stale currentStep', async () => {
    getById.mockResolvedValue({
      id: 'j1',
      status: 'running',
      created_at: '2026-07-08T10:00:00Z',
      finished_at: null,
      error_message: null,
      step_logs: [
        { step: 'create-account', status: 'completed', progress: 100, message: '', timestamp: '2026-07-08T10:00:00Z' },
        { step: 'ig-scan', status: 'completed', progress: 100, message: '', timestamp: '2026-07-08T10:01:00Z' },
        { step: 'transcribe', status: 'running', progress: 30, message: '', timestamp: '2026-07-08T10:02:00Z' },
      ],
      // stale pipeline_state.currentStep should NOT win
      pipeline_state: { counts: { 'ig-scan': { done: 12, total: 12 } }, currentStep: 'create-account' },
    });

    const { GET } = await import('@/app/api/pipeline/status/[jobId]/route');
    const res = await GET(new Request('http://x/api/pipeline/status/j1') as any, { params: Promise.resolve({ jobId: 'j1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status).toBe('running');
    expect(body.steps).toHaveLength(3);
    expect(body.counts).toEqual({ 'ig-scan': { done: 12, total: 12 } });
    expect(body.percent).toBe(22); // round(2/9*100)
    expect(body.completedSteps).toBe(2);
    expect(body.totalSteps).toBe(9);
    expect(body.currentStep).toBe('transcribe'); // from computeScanProgress, NOT stale 'create-account'
    expect(typeof body.elapsedMs).toBe('number');
    expect(typeof body.lastUpdateMs).toBe('number');
  });

  it('404s when job is missing', async () => {
    getById.mockResolvedValue(null);
    const { GET } = await import('@/app/api/pipeline/status/[jobId]/route');
    const res = await GET(new Request('http://x/api/pipeline/status/nope') as any, { params: Promise.resolve({ jobId: 'nope' }) });
    expect(res.status).toBe(404);
  });
});
