import { describe, it, expect, vi, beforeEach } from 'vitest';

const acquire = vi.fn();
const release = vi.fn();
const dequeue = vi.fn();
const qlen = vi.fn();
const publish = vi.fn();
const runCsTurn = vi.fn();
const sendText = vi.fn();
const sendButtons = vi.fn();
const sendReaction = vi.fn();
const redisGet = vi.fn();
const redisSetNx = vi.fn();

vi.mock('@/lib/cs/wa-cs-locks', () => ({ acquireCsLock: (...a: any[]) => acquire(...a), releaseCsLock: (...a: any[]) => release(...a) }));
vi.mock('@/lib/cs/wa-cs-queue', () => ({ dequeueCsMessage: (...a: any[]) => dequeue(...a), csQueueLength: (...a: any[]) => qlen(...a) }));
vi.mock('@/lib/cs/wa-cs-publish', () => ({ publishCsDrain: (...a: any[]) => publish(...a) }));
vi.mock('@/lib/cs/cs-agent', () => ({ runCsTurn: (...a: any[]) => runCsTurn(...a) }));
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendText: (...a: any[]) => sendText(...a),
  sendInteractiveButtons: (...a: any[]) => sendButtons(...a),
  sendInteractiveList: vi.fn(),
  sendReaction: (...a: any[]) => sendReaction(...a),
}));
vi.mock('@/lib/redis', () => ({ redisGet: (...a: any[]) => redisGet(...a), redisSetNx: (...a: any[]) => redisSetNx(...a) }));

describe('runCsDrain / processOneCsInbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acquire.mockResolvedValue(true);
    qlen.mockResolvedValue(0);
    redisGet.mockResolvedValue(null);
    redisSetNx.mockResolvedValue(true);
    sendText.mockResolvedValue({ success: true });
    sendButtons.mockResolvedValue({ success: true });
  });

  it('busy when the lock is held', async () => {
    acquire.mockResolvedValue(false);
    const { runCsDrain } = await import('@/lib/cs/wa-cs-worker');
    expect(await runCsDrain('x')).toEqual({ status: 'busy', processed: 0 });
  });

  it('drains FIFO in order, sends text replies, releases the lock', async () => {
    dequeue
      .mockResolvedValueOnce({ waId: 'x', msg: { id: 'm1' }, textBody: 'hi' })
      .mockResolvedValueOnce({ waId: 'x', msg: { id: 'm2' }, textBody: 'bye' })
      .mockResolvedValueOnce(null);
    runCsTurn.mockResolvedValue({ reply: { kind: 'text', body: 'שלום' }, phase: 'onboarding' });
    const { runCsDrain } = await import('@/lib/cs/wa-cs-worker');
    const r = await runCsDrain('x');
    expect(r).toEqual({ status: 'ok', processed: 2 });
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText.mock.calls[0][0]).toMatchObject({ to: 'x', body: 'שלום' });
    expect(release).toHaveBeenCalledWith('x');
  });

  it('done-guard short-circuits an already-processed wamid', async () => {
    redisGet.mockResolvedValue('1');
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const out = await processOneCsInbound({ waId: 'x', msg: { id: 'm1' }, textBody: 'hi' });
    expect(out).toBeNull();
    expect(runCsTurn).not.toHaveBeenCalled();
  });

  it('dispatches a buttons reply via sendInteractiveButtons', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'buttons', body: 'ממשיכים?', buttons: [{ id: 'y', title: 'כן' }] }, phase: 'serving' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    await processOneCsInbound({ waId: 'x', msg: { id: 'm3' }, textBody: 'q' });
    expect(sendButtons).toHaveBeenCalledWith(expect.objectContaining({ to: 'x', body: 'ממשיכים?' }));
    expect(sendText).not.toHaveBeenCalled();
  });

  it('kind:none sends nothing (paused / already handled)', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'none' }, phase: 'serving' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    await processOneCsInbound({ waId: 'x', msg: { id: 'm4' }, textBody: 'q' });
    expect(sendText).not.toHaveBeenCalled();
    expect(sendButtons).not.toHaveBeenCalled();
  });
});
