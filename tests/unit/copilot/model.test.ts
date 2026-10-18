// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { streamCopilotModel, COPILOT_MODEL, COPILOT_FALLBACK_MODEL } from '@/lib/copilot/model';

function streamOf(events: any[]) {
  return { async *[Symbol.asyncIterator]() { for (const e of events) yield e; } };
}
const usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10 } };

describe('streamCopilotModel', () => {
  it('streams deltas and returns id and usage', async () => {
    const create = vi.fn(async () => streamOf([
      { type: 'response.output_text.delta', delta: 'Hel' },
      { type: 'response.output_text.delta', delta: 'lo' },
      { type: 'response.completed', response: { id: 'resp_1', usage } },
    ]));
    const deltas: string[] = [];
    const r = await streamCopilotModel({ instructions: 'i', input: [{ role: 'user', content: 'q' }], previousResponseId: 'prev', onDelta: (d) => deltas.push(d) }, { responses: { create } });
    expect(deltas.join('')).toBe('Hello');
    expect(r).toEqual({ text: 'Hello', responseId: 'resp_1', usage: [{ model: COPILOT_MODEL, inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 }] });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: COPILOT_MODEL, previous_response_id: 'prev', stream: true, max_output_tokens: 1200 }));
  });
  it('falls back once without the chain when the primary fails before any text', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback answer', usage });
    const deltas: string[] = [];
    const r = await streamCopilotModel({ instructions: 'i', input: [{ role: 'user', content: 'q' }], previousResponseId: 'prev', onDelta: (d) => deltas.push(d) }, { responses: { create } });
    expect(deltas).toEqual(['Fallback answer']);
    expect(r.responseId).toBe('resp_fb');
    expect(create.mock.calls[1][0]).toMatchObject({ model: COPILOT_FALLBACK_MODEL });
    expect(create.mock.calls[1][0]).not.toHaveProperty('previous_response_id');
    expect(create.mock.calls[1][0]).not.toHaveProperty('stream');
  });
  it('does not fall back after text was already shown', async () => {
    const create = vi.fn(async () => ({ async *[Symbol.asyncIterator]() { yield { type: 'response.output_text.delta', delta: 'Partial' }; throw new Error('cut'); } }));
    await expect(streamCopilotModel({ instructions: 'i', input: [], previousResponseId: null, onDelta: () => {} }, { responses: { create } })).rejects.toThrow('cut');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
