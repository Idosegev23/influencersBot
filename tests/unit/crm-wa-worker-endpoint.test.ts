import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyQStashSignature = vi.fn();
const runAgentJob = vi.fn().mockResolvedValue({ status: 'ok', outcome: 'done' });
vi.mock('@/lib/pipeline/qstash', () => ({ verifyQStashSignature }));
vi.mock('@/lib/crm/wa-worker', () => ({ runAgentJob }));

function req(body: any) {
  return new Request('https://x/api/crm/wa-worker', { method: 'POST', body: JSON.stringify(body) }) as any;
}

describe('POST /api/crm/wa-worker', () => {
  beforeEach(() => { verifyQStashSignature.mockReset(); runAgentJob.mockClear(); });
  it('401 on bad signature, without processing', async () => {
    verifyQStashSignature.mockResolvedValue(false);
    const { POST } = await import('@/app/api/crm/wa-worker/route');
    const res = await POST(req({ agentId: 'ag1' }));
    expect(res.status).toBe(401);
    expect(runAgentJob).not.toHaveBeenCalled();
  });
  it('runs the job on a valid signature', async () => {
    verifyQStashSignature.mockResolvedValue(true);
    const { POST } = await import('@/app/api/crm/wa-worker/route');
    const res = await POST(req({ waId: '1', agentId: 'ag1', msg: { id: 'w1' }, textBody: 'hi' }));
    expect(res.status).toBe(200);
    expect(runAgentJob).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'ag1' }));
  });
});
