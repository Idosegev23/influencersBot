import { describe, it, expect, vi, beforeEach } from 'vitest';

const publishJSON = vi.fn().mockResolvedValue({ messageId: 'm1' });
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(() => ({ publishJSON })),
  Receiver: vi.fn(() => ({ verify: vi.fn().mockResolvedValue(true) })),
}));

describe('publishAgentJob', () => {
  beforeEach(() => {
    publishJSON.mockClear();
    process.env.QSTASH_TOKEN = 't';
    process.env.WA_WORKER_BASE_URL = 'https://example.com';
  });
  it('publishes to /api/crm/wa-worker with the job + dedup id from msg.id', async () => {
    const { publishAgentJob } = await import('@/lib/crm/wa-queue');
    await publishAgentJob({ waId: '972500', agentId: 'ag1', msg: { id: 'wamid.1' }, textBody: 'hi' });
    expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/api/crm/wa-worker',
      body: { waId: '972500', agentId: 'ag1', msg: { id: 'wamid.1' }, textBody: 'hi' },
      deduplicationId: 'wamid.1',
    }));
  });
  it('passes a delay when re-enqueuing on lock contention', async () => {
    const { publishAgentJob } = await import('@/lib/crm/wa-queue');
    await publishAgentJob({ waId: '1', agentId: 'ag1', msg: { id: 'wamid.2' }, textBody: null }, { delaySeconds: 3 });
    expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({ delay: 3 }));
  });
});
