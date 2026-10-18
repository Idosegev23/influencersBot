import OpenAI from 'openai';
import type { TokenUsage } from '@/lib/chatbot/archetypes/types';

export const COPILOT_MODEL = 'gpt-6-luna';
export const COPILOT_FALLBACK_MODEL = 'gpt-5.6-terra';
const MAX_OUTPUT_TOKENS = 1200;
/**
 * Turn budget (the route allows ~50s): the primary must show text within 15s and
 * never go 15s between stream events, and is cut at 35s overall. The fallback
 * (20s) runs only when the primary produced no text, so a slow but steady answer
 * is never cut at the first-token mark.
 */
export const COPILOT_TIMEOUTS = { firstTokenMs: 15_000, idleMs: 15_000, primaryMs: 35_000, fallbackMs: 20_000 } as const;

export interface ModelClient {
  responses: { create(params: any, options?: { signal?: AbortSignal }): Promise<any> };
}

export interface StreamTimeouts {
  /** Abort the primary if no text delta arrives within this time. */
  firstTokenTimeoutMs?: number;
  /** Overall cap on the primary call. */
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
  p: {
    instructions: string;
    input: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousResponseId: string | null;
    onDelta: (t: string) => void;
    /** Self-contained input for the fallback, which never chains (e.g. history + the new message when `input` relies on previousResponseId). */
    fallbackInput?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
  c: ModelClient = client(),
  opts: StreamTimeouts = {},
): Promise<{ text: string; responseId: string | null; usage: TokenUsage[]; incomplete: boolean; fellBack: boolean }> {
  const firstTokenTimeoutMs = opts.firstTokenTimeoutMs ?? COPILOT_TIMEOUTS.firstTokenMs;
  const primaryTimeoutMs = opts.primaryTimeoutMs ?? COPILOT_TIMEOUTS.primaryMs;
  const idleTimeoutMs = opts.idleTimeoutMs ?? COPILOT_TIMEOUTS.idleMs;
  const fallbackTimeoutMs = opts.fallbackTimeoutMs ?? COPILOT_TIMEOUTS.fallbackMs;

  const usage: TokenUsage[] = [];
  let text = '';
  let responseId: string | null = null;
  let incomplete = false;
  const captureUsage = (model: string, raw: any) => {
    const u = toUsage(model, raw);
    if (u) usage.push(u);
  };

  // Primary: bounded by time to first text, by idleTimeoutMs between stream events, and overall.
  const idleAc = new AbortController();
  const firstTokenAc = new AbortController();
  const primarySignal = AbortSignal.any([AbortSignal.timeout(primaryTimeoutMs), idleAc.signal, firstTokenAc.signal]);
  let idle: ReturnType<typeof setTimeout> | undefined;
  let firstToken: ReturnType<typeof setTimeout> | undefined;
  const bumpIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => idleAc.abort(new Error('primary idle timeout')), idleTimeoutMs);
  };

  const runPrimary = async () => {
    bumpIdle();
    firstToken = setTimeout(() => firstTokenAc.abort(new Error('primary first-token timeout')), firstTokenTimeoutMs);
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
          if (ev.delta) clearTimeout(firstToken);
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
      clearTimeout(firstToken);
    }
  };

  try {
    await runPrimary();
    if (text) return { text, responseId, usage, incomplete, fellBack: false };
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
        model: COPILOT_FALLBACK_MODEL, instructions: p.instructions, input: p.fallbackInput ?? p.input,
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
  return { text: fbText, responseId: fb?.id ?? null, usage, incomplete: fb?.status === 'incomplete', fellBack: true };
}
