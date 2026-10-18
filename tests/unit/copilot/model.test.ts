// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { streamCopilotModel, CopilotModelError, COPILOT_MODEL, COPILOT_FALLBACK_MODEL } from '@/lib/copilot/model';

function streamOf(events: any[]) {
  return { async *[Symbol.asyncIterator]() { for (const e of events) yield e; } };
}
const usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10 } };

describe('streamCopilotModel', () => {
  it('streams deltas and returns id and usage', async () => {
    const create = vi.fn(async (_p: any, _o?: any) => streamOf([
      { type: 'response.output_text.delta', delta: 'Hel' },
      { type: 'response.output_text.delta', delta: 'lo' },
      { type: 'response.completed', response: { id: 'resp_1', usage } },
    ]));
    const deltas: string[] = [];
    const r = await streamCopilotModel({ instructions: 'i', input: [{ role: 'user', content: 'q' }], previousResponseId: 'prev', onDelta: (d) => deltas.push(d) }, { responses: { create } });
    expect(deltas.join('')).toBe('Hello');
    expect(r).toEqual({ text: 'Hello', responseId: 'resp_1', incomplete: false, usage: [{ model: COPILOT_MODEL, inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 }] });
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ model: COPILOT_MODEL, previous_response_id: 'prev', stream: true, max_output_tokens: 1200 }));
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

const fbUsage = { input_tokens: 50, output_tokens: 8, input_tokens_details: { cached_tokens: 0 } };
const req = (over: Partial<Parameters<typeof streamCopilotModel>[0]> = {}) => ({ instructions: 'i', input: [{ role: 'user' as const, content: 'q' }], previousResponseId: null, onDelta: () => {}, ...over });
const hangingStream = () => ({ [Symbol.asyncIterator]() { return { next: () => new Promise<never>(() => {}) }; } });

describe('streamCopilotModel timeouts, terminal events and usage', () => {
  it('falls back when the primary stream goes idle', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(hangingStream())
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback', usage: fbUsage });
    const deltas: string[] = [];
    const r = await streamCopilotModel(req({ onDelta: (d) => deltas.push(d) }), { responses: { create } }, { primaryTimeoutMs: 5000, idleTimeoutMs: 30 });
    expect(deltas).toEqual(['Fallback']);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(r.incomplete).toBe(false);
  });
  it('returns partial text with incomplete true on response.incomplete', async () => {
    const create = vi.fn(async () => streamOf([
      { type: 'response.output_text.delta', delta: 'Part' },
      { type: 'response.incomplete', response: { id: 'resp_inc', usage } },
    ]));
    const r = await streamCopilotModel(req(), { responses: { create } });
    expect(r).toEqual({ text: 'Part', responseId: 'resp_inc', incomplete: true, usage: [{ model: COPILOT_MODEL, inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 }] });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('falls back when response.failed arrives before any text', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(streamOf([{ type: 'response.failed', response: { id: 'resp_x', error: { message: 'bad' } } }]))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback answer', usage: fbUsage });
    const deltas: string[] = [];
    const r = await streamCopilotModel(req({ onDelta: (d) => deltas.push(d) }), { responses: { create } });
    expect(deltas).toEqual(['Fallback answer']);
    expect(r.responseId).toBe('resp_fb');
  });
  it('rejects with CopilotModelError carrying usage when response.failed arrives after text', async () => {
    const create = vi.fn(async () => streamOf([
      { type: 'response.output_text.delta', delta: 'Par' },
      { type: 'response.failed', response: { id: 'resp_f', usage, error: { message: 'bad' } } },
    ]));
    const err = await streamCopilotModel(req(), { responses: { create } }).catch((e) => e);
    expect(err).toBeInstanceOf(CopilotModelError);
    expect(err.usage).toEqual([{ model: COPILOT_MODEL, inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 }]);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('falls back when the primary completes with empty text', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(streamOf([{ type: 'response.completed', response: { id: 'resp_e', usage } }]))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback', usage: fbUsage });
    const deltas: string[] = [];
    await streamCopilotModel(req({ onDelta: (d) => deltas.push(d) }), { responses: { create } });
    expect(deltas).toEqual(['Fallback']);
  });
  it('throws CopilotModelError when both models return empty text', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(streamOf([{ type: 'response.completed', response: { id: 'resp_e', usage } }]))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: '', usage: fbUsage });
    const err = await streamCopilotModel(req(), { responses: { create } }).catch((e) => e);
    expect(err).toBeInstanceOf(CopilotModelError);
    expect(err.usage).toHaveLength(2);
  });
  it('keeps usage from both calls when falling back after a billed incomplete with no text', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(streamOf([{ type: 'response.incomplete', response: { id: 'resp_i', usage } }]))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback', usage: fbUsage });
    const r = await streamCopilotModel(req(), { responses: { create } });
    expect(r.text).toBe('Fallback');
    expect(r.usage.map((u) => u.model)).toEqual([COPILOT_MODEL, COPILOT_FALLBACK_MODEL]);
  });
});
