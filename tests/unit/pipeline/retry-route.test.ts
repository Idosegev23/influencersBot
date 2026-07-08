import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));
const publishStep = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({ publishStep }));
// The route resets the job off 'failed' before re-publishing — mock the update chain.
const jobUpdate = vi.fn(() => ({ eq: async () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ update: jobUpdate }) }) }));

describe('POST /api/pipeline/retry', () => {
  beforeEach(() => { publishStep.mockClear(); jobUpdate.mockClear(); });

  it('resets the job to running and re-publishes the given step', async () => {
    const { POST } = await import('@/app/api/pipeline/retry/route');
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ jobId: 'job-7', step: 'site-crawl' }) });
    const res = await POST(req as any);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(jobUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'running', finished_at: null }));
    expect(publishStep).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-7', step: 'site-crawl', batch: 0 }));
  });

  it('rejects an unknown step without publishing', async () => {
    const { POST } = await import('@/app/api/pipeline/retry/route');
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ jobId: 'job-7', step: 'not-a-step' }) });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect(publishStep).not.toHaveBeenCalled();
  });
});
