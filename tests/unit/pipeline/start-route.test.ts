import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));
const create = vi.fn(async () => ({ id: 'job-9' }));
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({ getScanJobsRepo: () => ({ create }) }));
vi.mock('@/lib/pipeline/state', () => ({ saveState: vi.fn() }));
const publishStep = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({ publishStep }));

describe('POST /api/pipeline/start', () => {
  it('creates job and publishes create-account', async () => {
    const { POST } = await import('@/app/api/pipeline/start/route');
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ username: 'u', accountId: 'a1' }) });
    const res = await POST(req as any);
    const json = await res.json();
    expect(json.jobId).toBe('job-9');
    expect(publishStep).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-9', step: 'create-account' }));
  });
});
