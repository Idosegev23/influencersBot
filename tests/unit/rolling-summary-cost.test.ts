import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The rolling summary is a Gemini call on the CHAT path — it fires at message 3 and every 6
 * after, so roughly once per conversation across ~3,500 conversations a month. Its usage came
 * back from the SDK and was dropped, and Gemini had no row in the price table, so it priced at
 * $0 twice over. This is the same hole that left every WhatsApp-CS turn unpriced.
 */
const recordTurnCost = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/costs/recorder', () => ({ recordTurnCost: (...a: any[]) => recordTurnCost(...a) }));

const chatWithGemini = vi.fn();
vi.mock('@/lib/gemini-chat', () => ({
  chatWithGemini: (...a: any[]) => chatWithGemini(...a),
  AI_MODELS: { CHAT_RESPONSES: 'gemini-3.5-flash' },
}));

let sessionRow: any = { rolling_summary: '', account_id: 'acc-7' };
const updated: any[] = [];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const c: any = {};
      c.select = () => c; c.eq = () => c;
      c.single = async () => ({ data: sessionRow, error: null });
      c.update = (row: any) => { updated.push(row); return { eq: async () => ({ error: null }) }; };
      return c;
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  updated.length = 0;
  sessionRow = { rolling_summary: '', account_id: 'acc-7' };
  chatWithGemini.mockResolvedValue({
    text: 'הלקוחה שאלה על סרומים לעור יבש.',
    usage: { promptTokens: 1400, completionTokens: 90, totalTokens: 1490 },
  });
});

describe('updateRollingSummary — cost accounting', () => {
  it('records the Gemini call against the session\'s account', async () => {
    const { updateRollingSummary } = await import('@/lib/chatbot/conversation-memory');
    await updateRollingSummary('sess-1', [{ role: 'user', content: 'היי' }]);

    expect(updated[0]?.rolling_summary).toBeTruthy();   // it still did its actual job
    expect(recordTurnCost).toHaveBeenCalledTimes(1);
    const arg = recordTurnCost.mock.calls[0][0];
    expect(arg.accountId).toBe('acc-7');
    expect(arg.sessionId).toBe('sess-1');
    expect(arg.usage.inputTokens).toBe(1400);
    expect(arg.usage.outputTokens).toBe(90);
    expect(arg.usage.model).toMatch(/gemini/);
  });

  it('prices to a real number, not $0', async () => {
    const { updateRollingSummary } = await import('@/lib/chatbot/conversation-memory');
    const { estimateCostUsd } = await import('@/lib/costs/pricing');
    await updateRollingSummary('sess-1', [{ role: 'user', content: 'היי' }]);
    expect(estimateCostUsd(recordTurnCost.mock.calls[0][0].usage)).toBeGreaterThan(0);
  });

  it('does not record when the model reported no usage', async () => {
    chatWithGemini.mockResolvedValue({ text: 'סיכום' });
    const { updateRollingSummary } = await import('@/lib/chatbot/conversation-memory');
    await updateRollingSummary('sess-1', [{ role: 'user', content: 'היי' }]);
    expect(recordTurnCost).not.toHaveBeenCalled();
    expect(updated[0]?.rolling_summary).toBeTruthy();   // paired: the summary still happened
  });

  it('never lets accounting break the summary', async () => {
    recordTurnCost.mockImplementationOnce(() => { throw new Error('cost layer down'); });
    const { updateRollingSummary } = await import('@/lib/chatbot/conversation-memory');
    await expect(updateRollingSummary('sess-1', [{ role: 'user', content: 'היי' }])).resolves.toBeUndefined();
    expect(updated[0]?.rolling_summary).toBeTruthy();
  });
});
