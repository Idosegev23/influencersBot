import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendText = vi.fn();
const sendButtons = vi.fn();
const sendList = vi.fn();
const sendReaction = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendText: (...a: any[]) => sendText(...a),
  sendInteractiveButtons: (...a: any[]) => sendButtons(...a),
  sendInteractiveList: (...a: any[]) => sendList(...a),
  sendReaction: (...a: any[]) => sendReaction(...a),
  toWaId: (s: string) => s,
}));

const runCsTurn = vi.fn();
vi.mock('@/lib/cs/cs-agent', () => ({ runCsTurn: (...a: any[]) => runCsTurn(...a) }));

// Redis: done-guard fresh by default.
vi.mock('@/lib/redis', () => ({
  redisSetNx: vi.fn().mockResolvedValue(true),
  redisGet: vi.fn().mockResolvedValue(null),
  redisExists: vi.fn().mockResolvedValue(false),
}));

const job = { waId: '972500000000', msg: { id: 'wamid-1' }, textBody: 'שלום', contactId: 'c1' } as any;

describe('processOneCsInbound dispatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('kind:text → sendText, returns wa_message_id, stamps ✅', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'text', body: 'שלום דנה' }, phase: 'serving' });
    sendText.mockResolvedValue({ success: true, wa_message_id: 'out-1' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const id = await processOneCsInbound(job);
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ to: '972500000000', body: 'שלום דנה' }));
    expect(id).toBe('out-1');
    // a confirmed send flips the 👀 to ✅
    expect(sendReaction).toHaveBeenCalledWith(expect.objectContaining({ to: '972500000000', messageId: 'wamid-1', emoji: '✅' }));
  });

  it('kind:buttons → sendInteractiveButtons', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'buttons', body: 'מדובר ב-Argania?', buttons: [{ id: 'confirm_yes', title: 'כן' }] }, phase: 'onboarding' });
    sendButtons.mockResolvedValue({ success: true, wa_message_id: 'out-2' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    await processOneCsInbound(job);
    expect(sendButtons).toHaveBeenCalledWith(expect.objectContaining({ to: '972500000000', body: 'מדובר ב-Argania?' }));
  });

  it('kind:list → sendInteractiveList', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'list', body: 'לאיזה מותג?', buttonLabel: 'בחירה', sections: [{ rows: [{ id: 'brand_a', title: 'A' }] }] }, phase: 'onboarding' });
    sendList.mockResolvedValue({ success: true, wa_message_id: 'out-3' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    await processOneCsInbound(job);
    expect(sendList).toHaveBeenCalled();
  });

  it('kind:none → sends nothing, returns null', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'none' }, phase: 'serving' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const id = await processOneCsInbound(job);
    expect(sendText).not.toHaveBeenCalled();
    expect(id).toBeNull();
  });

  it('retries a failed send up to 3 times', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'text', body: 'x' }, phase: 'serving' });
    sendText.mockResolvedValueOnce({ success: false, error: { code: 429, type: 'rate', message: 'slow' } })
            .mockResolvedValueOnce({ success: false, error: { code: 503, type: 'unavail', message: 'busy' } })
            .mockResolvedValueOnce({ success: true, wa_message_id: 'out-final' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const id = await processOneCsInbound(job);
    expect(sendText).toHaveBeenCalledTimes(3);
    expect(id).toBe('out-final');
    expect(sendReaction).toHaveBeenCalledWith(expect.objectContaining({ emoji: '✅' }));
  });

  it('all 3 sends fail → returns null and stamps ⚠️ (no done-guard write)', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'text', body: 'x' }, phase: 'serving' });
    sendText.mockResolvedValue({ success: false, error: { code: 500, type: 'x', message: 'down' } });
    const { redisSetNx } = await import('@/lib/redis');
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const id = await processOneCsInbound(job);
    expect(sendText).toHaveBeenCalledTimes(3);
    expect(id).toBeNull();
    expect(sendReaction).toHaveBeenCalledWith(expect.objectContaining({ emoji: '⚠️' }));
    // done-guard is written ONLY after a confirmed send — never on a total failure (so it re-processes).
    expect(redisSetNx).not.toHaveBeenCalledWith('cs:wa:wamid-1:done', expect.anything(), expect.anything());
  });
});
