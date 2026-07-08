import { describe, it, expect, vi, beforeEach } from 'vitest';

const acquireAgentLock = vi.fn();
const releaseAgentLock = vi.fn().mockResolvedValue(undefined);
const publishAgentJob = vi.fn().mockResolvedValue(undefined);
const handleAgentMessage = vi.fn();
const sendText = vi.fn().mockResolvedValue({ success: true });
const sendReaction = vi.fn().mockResolvedValue(true);

vi.mock('@/lib/crm/wa-locks', () => ({ acquireAgentLock, releaseAgentLock }));
vi.mock('@/lib/crm/wa-queue', () => ({ publishAgentJob }));
vi.mock('@/lib/crm/wa-conversation', () => ({ handleAgentMessage }));
vi.mock('@/lib/whatsapp-cloud/client', () => ({ sendText, sendReaction, downloadMedia: vi.fn(), toWaId: (x: string) => x }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'ag1', role: 'agent', status: 'active', managed_account_ids: [], full_name: 'A' } }) }) }) }) },
}));
vi.mock('@/lib/redis', () => ({ redisGet: vi.fn().mockResolvedValue(null), redisSetNx: vi.fn().mockResolvedValue(true) }));

describe('runAgentJob', () => {
  beforeEach(() => { acquireAgentLock.mockReset(); handleAgentMessage.mockReset(); sendText.mockClear(); sendReaction.mockClear(); publishAgentJob.mockClear(); });

  it('re-enqueues with delay when the lock is held', async () => {
    acquireAgentLock.mockResolvedValue(false);
    const { runAgentJob } = await import('@/lib/crm/wa-worker');
    const r = await runAgentJob({ waId: '1', agentId: 'ag1', msg: { id: 'w1', type: 'text' }, textBody: 'hi' });
    expect(r.status).toBe('requeued');
    expect(publishAgentJob).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }), { delaySeconds: 3 });
    expect(handleAgentMessage).not.toHaveBeenCalled();
  });

  it('processes, sends the reply, ✅ on outcome=done, releases the lock', async () => {
    acquireAgentLock.mockResolvedValue(true);
    handleAgentMessage.mockResolvedValue({ reply: 'הנה הקישור', outcome: 'done' });
    const { runAgentJob } = await import('@/lib/crm/wa-worker');
    const r = await runAgentJob({ waId: '972500', agentId: 'ag1', msg: { id: 'w2', type: 'text' }, textBody: 'תן לי את הקישור' });
    expect(r).toMatchObject({ status: 'ok', outcome: 'done' });
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ body: 'הנה הקישור', contextMessageId: 'w2' }));
    expect(sendReaction).toHaveBeenCalledWith(expect.objectContaining({ emoji: '✅' }));
    expect(releaseAgentLock).toHaveBeenCalledWith('ag1');
  });

  it('gives up locking after max attempts and processes anyway (degraded)', async () => {
    acquireAgentLock.mockResolvedValue(false);
    handleAgentMessage.mockResolvedValue({ reply: 'ok', outcome: 'done' });
    const { runAgentJob } = await import('@/lib/crm/wa-worker');
    const r = await runAgentJob({ waId: '1', agentId: 'ag1', msg: { id: 'w3', type: 'text' }, textBody: 'hi', attempt: 5 });
    expect(r.status).toBe('ok');
    expect(handleAgentMessage).toHaveBeenCalled();
    expect(publishAgentJob).not.toHaveBeenCalled();
  });
});
