/**
 * The prelude reads must actually OVERLAP.
 *
 * Measured against production 2026-09-08, the nine serial Supabase round trips before the first
 * model call cost 2,829ms of a 7,671ms order-status turn — more than the model call they precede.
 * They are now fired together (cs-agent.ts §1.5).
 *
 * Every other test in the suite mocks the DB as instant, so it passes whether the reads are serial
 * or parallel — it cannot see this regress. This one measures CONCURRENCY directly: each mocked
 * query holds a slot for 20ms and records the high-water mark. Serial ⇒ the mark is 1. That makes
 * the assertion impossible to satisfy vacuously: if the Promise.all is unpicked back into `await`s,
 * the number drops to 1 and this goes red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const QUERY_MS = 20;
let inFlight = 0;
let maxInFlight = 0;
let queries = 0;
const track = async <T>(value: T): Promise<T> => {
  queries++;
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise((r) => setTimeout(r, QUERY_MS));
  inFlight--;
  return value;
};

let store: Record<string, any> = {};
vi.mock('@/lib/cs/cs-session', () => ({
  WARM_WINDOW_MS: 45 * 60 * 1000,
  isWarm: () => false,
  loadCsSessionByChannel: async (_c: string, id: string) => store[id] || null,
  createCsSession: async (waId: string) => (store[waId] = { wa_id: waId, phase: 'onboarding', active_account_id: null, active_ticket_id: null, active_chat_session_id: null, customer_name: null, context: {}, version: 0 }),
  saveCsSession: async (prev: any, patch: any) => { store[prev.wa_id] = { ...prev, ...patch }; return true; },
}));

vi.mock('@/lib/cs/tools', () => ({ CS_TOOL_DEFS: [], getCsTools: () => [] }));

// The digest and the prompt are the two heaviest legs of the prelude, so they take a slot too.
vi.mock('@/lib/cs/cs-context', () => ({
  stripSuggestions: (t: string) => (t || '').trim(),
  parseSuggestions: () => [],
  buildContextDigest: async () => track({ knownName: 'דנה', boundBrand: 'ARGANIA', warm: true, openThreads: [], recentTurns: [], policy: null, hasContactRoute: true }),
  buildCsSystemPrompt: async () => track('SYS'),
}));

vi.mock('@/lib/handoff/bot-pause', () => ({ isBotPaused: async () => track(false), pauseBot: vi.fn(), resumeBot: vi.fn() }));
vi.mock('@/engines/escalation/detect', () => ({ detectHandoff: () => ({ triggered: false, triggers: [], severity: 'low', reason: '' }) }));
vi.mock('@/engines/escalation/dispatch', () => ({ runCsHandoffCheck: vi.fn().mockResolvedValue({ escalated: true }) }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const c: any = {};
      c.select = () => c; c.eq = () => c; c.in = () => c; c.order = () => c; c.limit = () => c;
      c.single = () => track({ data: { config: {} } });
      c.maybeSingle = () => track({ data: null });
      c.insert = async () => ({ data: null });
      c.update = () => ({ eq: async () => ({ data: null }) });
      // Awaiting the chain directly (the list reads) goes through here.
      c.then = (resolve: any, reject: any) => track({ data: [] }).then(resolve, reject);
      return c;
    },
  },
}));

const bound = () => ({ wa_id: '972501112222', phase: 'serving', active_account_id: 'acc-1', active_ticket_id: 't1', active_chat_session_id: 'cs-1', customer_name: 'דנה', context: {}, version: 2 });
const job = (textBody: string) => ({ waId: '972501112222', msg: { id: 'w1' }, textBody, contactId: 'c1' } as any);

describe('cs-agent prelude concurrency', () => {
  beforeEach(() => { store = {}; inFlight = 0; maxInFlight = 0; queries = 0; vi.clearAllMocks(); });

  it('fires the prelude reads together, and still produces the turn', async () => {
    store['972501112222'] = bound();
    const callModel = vi.fn().mockResolvedValue({ toolCalls: [], text: 'שלום דנה' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');

    const t0 = Date.now();
    const res = await runCsTurn(job('איפה ההזמנה שלי 12345'), { callModel });
    const elapsed = Date.now() - t0;

    // PRESENCE — the turn really ran this path, so the numbers below describe real work.
    expect(res.reply).toEqual({ kind: 'text', body: 'שלום דנה' });
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(queries).toBeGreaterThanOrEqual(5);

    // THE CLAIM — reads overlap. Serial would pin this at 1.
    expect(maxInFlight).toBeGreaterThanOrEqual(4);

    // And the overlap shows up as wall-clock: serial would be at least queries × QUERY_MS.
    expect(elapsed).toBeLessThan(queries * QUERY_MS);
  });

  it('a paused thread still returns before the model, with the reads discarded', async () => {
    store['972501112222'] = bound();
    const paused = await import('@/lib/handoff/bot-pause');
    vi.spyOn(paused, 'isBotPaused').mockImplementation(async () => track(true) as any);
    const callModel = vi.fn();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');

    const res = await runCsTurn(job('היי'), { callModel });

    expect(res.reply.kind).toBe('none');
    expect(callModel).not.toHaveBeenCalled();
  });
});
