import OpenAI from 'openai';
import type { TokenUsage } from '@/lib/chatbot/archetypes/types';

export const COPILOT_MODEL = 'gpt-6-luna';
export const COPILOT_FALLBACK_MODEL = 'gpt-5.6-terra';
const MAX_OUTPUT_TOKENS = 1200;
const PRIMARY_TIMEOUT_MS = 20_000;
const IDLE_TIMEOUT_MS = 15_000;
const FALLBACK_TIMEOUT_MS = 20_000;

export interface ModelClient {
  responses: { create(params: any, options?: { signal?: AbortSignal }): Promise<any> };
}

export interface StreamTimeouts {
  primaryTimeoutMs?: number;
  idleTimeoutMs?: number;
  fallbackTimeoutMs?: number;
}

/** Thrown when the turn cannot produce an answer; carries the usage billed so far so cost can still be recorded. */
export class CopilotModelError extends Error {
  usage: TokenUsage[];
  constructor(message: string, usage: TokenUsage[]) {
    super(message);
    this.name = 'CopilotModelError';
    this.usage = usage;
  }
}

let defaultClient: ModelClient | null = null;
function client(): ModelClient {
  // maxRetries 0: the route has a 60s budget, so retries and the SDK's 10-minute default must not stack.
  if (!defaultClient) defaultClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }) as unknown as ModelClient;
  return defaultClient;
}

function toUsage(model: string, u: any): TokenUsage | null {
  if (!u) return null;
  return { model, inputTokens: u.input_tokens ?? 0, cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
}

function reasonOf(signal: AbortSignal): Error {
  const r = signal.reason;
  return r instanceof Error ? r : new Error(String(r ?? 'aborted'));
}

/** Rejects as soon as the signal aborts, even if the underlying promise never settles. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(reasonOf(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(reasonOf(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function streamCopilotModel(
  p: { instructions: string; input: Array<{ role: 'user' | 'assistant'; content: string }>; previousResponseId: string | null; onDelta: (t: string) => void },
  c: ModelClient = client(),
  opts: StreamTimeouts = {},
): Promise<{ text: string; responseId: string | null; usage: TokenUsage[]; incomplete: boolean }> {
  const primaryTimeoutMs = opts.primaryTimeoutMs ?? PRIMARY_TIMEOUT_MS;
  const idleTimeoutMs = opts.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const fallbackTimeoutMs = opts.fallbackTimeoutMs ?? FALLBACK_TIMEOUT_MS;

  const usage: TokenUsage[] = [];
  let text = '';
  let responseId: string | null = null;
  let incomplete = false;
  const captureUsage = (model: string, raw: any) => {
    const u = toUsage(model, raw);
    if (u) usage.push(u);
  };

  // Primary: bounded overall by primaryTimeoutMs and by idleTimeoutMs between stream events.
  const idleAc = new AbortController();
  const primarySignal = AbortSignal.any([AbortSignal.timeout(primaryTimeoutMs), idleAc.signal]);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const bumpIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => idleAc.abort(new Error('primary idle timeout')), idleTimeoutMs);
  };

  const runPrimary = async () => {
    bumpIdle();
    try {
      const stream: any = await untilAborted(
        c.responses.create({
          model: COPILOT_MODEL, instructions: p.instructions, input: p.input,
          ...(p.previousResponseId ? { previous_response_id: p.previousResponseId } : {}),
          max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: 'low' }, stream: true,
        }, { signal: primarySignal }),
        primarySignal,
      );
      const it = stream[Symbol.asyncIterator]();
      for (;;) {
        const r: IteratorResult<any> = await untilAborted(it.next(), primarySignal);
        if (r.done) break;
        bumpIdle();
        const ev = r.value;
        if (ev?.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
          text += ev.delta;
          p.onDelta(ev.delta);
        } else if (ev?.type === 'response.completed' || ev?.type === 'response.incomplete') {
          responseId = ev.response?.id ?? responseId;
          if (ev.type === 'response.incomplete') incomplete = true;
          captureUsage(COPILOT_MODEL, ev.response?.usage);
          break;
        } else if (ev?.type === 'response.failed') {
          captureUsage(COPILOT_MODEL, ev.response?.usage);
          throw new Error(ev.response?.error?.message ?? 'response.failed');
        } else if (ev?.type === 'error') {
          throw new Error(ev.message ?? 'stream error');
        }
      }
    } finally {
      clearTimeout(idle);
    }
  };

  try {
    await runPrimary();
    if (text) return { text, responseId, usage, incomplete };
  } catch (e) {
    if (text) throw new CopilotModelError(msgOf(e), usage);
    console.error('[copilot/model]', 'primary failed, falling back', msgOf(e));
  }

  // Fallback: one non-streaming call, no chain, own timeout. Its usage is kept even when it fails.
  const fbSignal = AbortSignal.timeout(fallbackTimeoutMs);
  let fb: any;
  try {
    fb = await untilAborted(
      c.responses.create({
        model: COPILOT_FALLBACK_MODEL, instructions: p.instructions, input: p.input,
        max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: 'low' },
      }, { signal: fbSignal }),
      fbSignal,
    );
  } catch (e) {
    throw new CopilotModelError(`fallback failed: ${msgOf(e)}`, usage);
  }
  captureUsage(COPILOT_FALLBACK_MODEL, fb?.usage);
  const fbText: string = fb?.output_text ?? '';
  if (!fbText) throw new CopilotModelError('empty response from both models', usage);
  p.onDelta(fbText);
  return { text: fbText, responseId: fb?.id ?? null, usage, incomplete: fb?.status === 'incomplete' };
}
