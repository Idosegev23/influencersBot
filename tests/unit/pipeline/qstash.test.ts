import { describe, it, expect, vi } from 'vitest';
const publishJSON = vi.fn().mockResolvedValue({ messageId: 'm1' });
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(() => ({ publishJSON })),
  Receiver: vi.fn(() => ({ verify: vi.fn().mockResolvedValue(true) })),
}));

describe('publishStep', () => {
  it('publishes to /api/pipeline/run with jobId+step+batch', async () => {
    process.env.QSTASH_TOKEN = 't';
    process.env.PIPELINE_BASE_URL = 'https://example.com';
    const { publishStep } = await import('@/lib/pipeline/qstash');
    await publishStep({ jobId: 'j1', step: 'ig-scan', batch: 0 });
    expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/api/pipeline/run',
      body: { jobId: 'j1', step: 'ig-scan', batch: 0 },
    }));
  });
});
