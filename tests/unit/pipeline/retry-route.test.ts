import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));
const publishStep = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({ publishStep }));

describe('POST /api/pipeline/retry', () => {
  beforeEach(() => publishStep.mockClear());

  it('re-publishes the given failed step and returns ok', async () => {
    const { POST } = await import('@/app/api/pipeline/retry/route');
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ jobId: 'job-7', step: 'site-crawl' }) });
    const res = await POST(req as any);
    const json = await res.json();
    expect(json.ok).toBe(true);
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
