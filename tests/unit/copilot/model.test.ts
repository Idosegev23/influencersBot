// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { streamCopilotModel, CopilotModelError, COPILOT_MODEL, COPILOT_FALLBACK_MODEL, COPILOT_TIMEOUTS } from '@/lib/copilot/model';

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
    expect(r).toEqual({ text: 'Hello', responseId: 'resp_1', incomplete: false, fellBack: false, usage: [{ model: COPILOT_MODEL, inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 }] });
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
  it('sends fallbackInput to the fallback (it cannot chain) and reports fellBack', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback answer', usage });
    const history = [{ role: 'user' as const, content: 'Q1' }, { role: 'assistant' as const, content: 'A1' }, { role: 'user' as const, content: 'q' }];
    const r = await streamCopilotModel({ instructions: 'i', input: [{ role: 'user', content: 'q' }], fallbackInput: history, previousResponseId: 'prev', onDelta: () => {} }, { responses: { create } });
    expect(create.mock.calls[0][0].input).toEqual([{ role: 'user', content: 'q' }]);
    expect(create.mock.calls[1][0].input).toEqual(history);
    expect(r.fellBack).toBe(true);
  });
  it('uses input for the fallback when no fallbackInput is given', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback answer', usage });
    await streamCopilotModel({ instructions: 'i', input: [{ role: 'user', content: 'q' }], previousResponseId: null, onDelta: () => {} }, { responses: { create } });
    expect(create.mock.calls[1][0].input).toEqual([{ role: 'user', content: 'q' }]);
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
    expect(r).toEqual({ text: 'Part', responseId: 'resp_inc', incomplete: true, fellBack: false, usage: [{ model: COPILOT_MODEL, inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 }] });
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A stream that yields `events` with `gapMs` between them (each item: an event, or a delta string). */
function timedStream(items: Array<string | any>, gapMs: number) {
  return { async *[Symbol.asyncIterator]() {
    for (const it of items) { await sleep(gapMs); yield typeof it === 'string' ? { type: 'response.output_text.delta', delta: it } : it; }
  } };
}

describe('streamCopilotModel budget (time to first token, idle, overall)', () => {
  it('defaults: 15s to first token, 15s idle, 35s primary overall, 20s fallback', () => {
    expect(COPILOT_TIMEOUTS).toEqual({ firstTokenMs: 15_000, idleMs: 15_000, primaryMs: 35_000, fallbackMs: 20_000 });
  });

  it('aborts and falls back when no text arrives within the first-token cap, even with keep-alive events', async () => {
    const keepAlive = Array.from({ length: 30 }, () => ({ type: 'response.in_progress' }));
    const create = vi.fn()
      .mockResolvedValueOnce(timedStream(keepAlive, 10))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback', usage: fbUsage });
    const deltas: string[] = [];
    const t0 = Date.now();
    const r = await streamCopilotModel(req({ onDelta: (d) => deltas.push(d) }), { responses: { create } }, { firstTokenTimeoutMs: 60, idleTimeoutMs: 1000, primaryTimeoutMs: 5000 });
    expect(Date.now() - t0).toBeLessThan(250);
    expect(deltas).toEqual(['Fallback']);
    expect(r.fellBack).toBe(true);
  });

  it('a slow but steady answer longer than the first-token cap is not cut', async () => {
    const parts = Array.from({ length: 10 }, (_, i) => `p${i} `);
    const create = vi.fn().mockResolvedValueOnce(timedStream([...parts, { type: 'response.completed', response: { id: 'r1', usage } }], 20));
    const r = await streamCopilotModel(req(), { responses: { create } }, { firstTokenTimeoutMs: 50, idleTimeoutMs: 100, primaryTimeoutMs: 5000 });
    expect(r.text).toBe(parts.join(''));
    expect(r.fellBack).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('the overall primary cap still ends a stream that never finishes; no fallback once text was shown', async () => {
    const endless = { async *[Symbol.asyncIterator]() { for (;;) { await sleep(10); yield { type: 'response.output_text.delta', delta: 'x' }; } } };
    const create = vi.fn().mockResolvedValueOnce(endless);
    const t0 = Date.now();
    await expect(streamCopilotModel(req(), { responses: { create } }, { firstTokenTimeoutMs: 50, idleTimeoutMs: 50, primaryTimeoutMs: 120 })).rejects.toBeInstanceOf(CopilotModelError);
    expect(Date.now() - t0).toBeLessThan(400);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('the idle guard still applies between events after the first token', async () => {
    const stall = { [Symbol.asyncIterator]() { let n = 0; return { next: () => (n++ === 0 ? Promise.resolve({ done: false, value: { type: 'response.output_text.delta', delta: 'Hi' } }) : new Promise<never>(() => {})) }; } };
    const create = vi.fn().mockResolvedValueOnce(stall);
    await expect(streamCopilotModel(req(), { responses: { create } }, { firstTokenTimeoutMs: 1000, idleTimeoutMs: 40, primaryTimeoutMs: 5000 })).rejects.toThrow(/idle/);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
