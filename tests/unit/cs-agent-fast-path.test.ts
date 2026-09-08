/**
 * The fast path, exercised end-to-end through runCsTurn.
 *
 * Every other CS test runs with the gate OFF, so none of them can see this work or see it break —
 * they pass identically whether the seed fires or not. These turn it on.
 *
 * The property under test is narrow and worth stating plainly: ONE model call instead of two, with
 * the order already looked up and handed to it. The model still writes the reply.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let BOUND_CONFIG: any = {};
let store: Record<string, any> = {};

vi.mock('@/lib/cs/cs-session', () => ({
  WARM_WINDOW_MS: 45 * 60 * 1000,
  isWarm: () => false,
  loadCsSessionByChannel: async (_c: string, id: string) => store[id] || null,
  createCsSession: async (waId: string) => (store[waId] = { wa_id: waId, phase: 'onboarding', active_account_id: null, active_ticket_id: null, active_chat_session_id: null, customer_name: null, context: {}, version: 0 }),
  saveCsSession: async (prev: any, patch: any) => { store[prev.wa_id] = { ...prev, ...patch }; return true; },
}));

// The real buildCsToolset runs (it is what decides lookup_order is even offered), so the handlers
// it filters have to be real entries here.
const lookupOrder = vi.fn();
vi.mock('@/lib/cs/tools', () => ({
  CS_TOOL_DEFS: [],
  getCsTools: () => [
    { def: { type: 'function', function: { name: 'lookup_order', description: '', parameters: {} } }, handler: (...a: any[]) => lookupOrder(...a) },
    { def: { type: 'function', function: { name: 'escalate_to_human', description: '', parameters: {} } }, handler: async () => ({ ok: true, data: {}, escalated: true }) },
  ],
}));

const buildCsSystemPrompt = vi.fn().mockResolvedValue('SYS');
vi.mock('@/lib/cs/cs-context', () => ({
  stripSuggestions: (t: string) => (t || '').trim(),
  parseSuggestions: () => [],
  buildContextDigest: async () => ({ knownName: 'דנה', boundBrand: 'ARGANIA', warm: true, openThreads: [], recentTurns: [], policy: null, hasContactRoute: true }),
  buildCsSystemPrompt: (...a: any[]) => buildCsSystemPrompt(...a),
}));

vi.mock('@/lib/handoff/bot-pause', () => ({ isBotPaused: async () => false, pauseBot: vi.fn(), resumeBot: vi.fn() }));
vi.mock('@/engines/escalation/detect', () => ({ detectHandoff: () => ({ triggered: false, triggers: [], severity: 'low', reason: '' }) }));
vi.mock('@/engines/escalation/dispatch', () => ({ runCsHandoffCheck: vi.fn().mockResolvedValue({ escalated: true }) }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const c: any = {};
      c.select = () => c; c.eq = () => c; c.in = () => c; c.order = () => c; c.limit = () => c;
      c.single = async () => ({ data: { config: BOUND_CONFIG } });
      c.maybeSingle = async () => ({ data: null });
      c.insert = async () => ({ data: null });
      c.update = () => ({ eq: async () => ({ data: null }) });
      c.then = (r: any) => r({ data: [] });
      return c;
    },
  },
}));

const ORDERS = { display_name: 'ARGANIA', archetype: 'brand', integrations: { quickshop: { api_key: 'k' } } };
const bound = () => ({ wa_id: '972501112222', phase: 'serving', active_account_id: 'acc-1', active_ticket_id: 't1', active_chat_session_id: 'cs-1', customer_name: 'דנה', context: {}, version: 2 });
const job = (textBody: string) => ({ waId: '972501112222', msg: { id: 'w1' }, textBody, contactId: 'c1' } as any);

describe('cs-agent order-status fast path', () => {
  beforeEach(() => {
    store = { '972501112222': bound() };
    vi.clearAllMocks();
    lookupOrder.mockResolvedValue({ ok: true, data: { kind: 'found', status: 'shipped' } });
    buildCsSystemPrompt.mockResolvedValue('SYS');
  });

  it('gate ON: looks the order up BEFORE the model, and answers in one model call', async () => {
    BOUND_CONFIG = { ...ORDERS, whatsapp_cs: { fast_path: true } };
    const callModel = vi.fn().mockResolvedValue({ toolCalls: [], text: 'ההזמנה שלך נשלחה 📦' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');

    const res = await runCsTurn(job('איפה ההזמנה שלי 12345'), { callModel });

    // The lookup ran, with the number the shopper typed.
    expect(lookupOrder).toHaveBeenCalledTimes(1);
    expect(lookupOrder.mock.calls[0][0]).toEqual({ orderNumber: '12345' });
    // ONE model call, not two — this is the 1,686ms.
    expect(callModel).toHaveBeenCalledTimes(1);
    // And that call already carried the answer, so the model is phrasing, not routing.
    const sent = callModel.mock.calls[0][0].messages;
    const toolMsg = sent.find((m: any) => m.role === 'tool');
    expect(toolMsg).toBeTruthy();
    expect(JSON.parse(toolMsg.content)).toMatchObject({ kind: 'found' });
    // The model still writes every word of the reply.
    expect(res.reply).toEqual({ kind: 'text', body: 'ההזמנה שלך נשלחה 📦' });
    // RAG is dropped for this turn.
    expect(buildCsSystemPrompt.mock.calls[0][0].skipRag).toBe(true);
  });

  it('gate OFF: nothing is prefetched and the model routes as before', async () => {
    BOUND_CONFIG = { ...ORDERS }; // no fast_path key at all — the production default
    const callModel = vi.fn()
      .mockResolvedValueOnce({ toolCalls: [{ id: 'c1', name: 'lookup_order', args: { orderNumber: '12345' } }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'ההזמנה שלך נשלחה 📦' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');

    await runCsTurn(job('איפה ההזמנה שלי 12345'), { callModel });

    // Two calls: the router, then the phrasing. Unchanged behaviour where the gate is off.
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(buildCsSystemPrompt.mock.calls[0][0].skipRag).toBe(false);
    // The lookup still happened — via the model, which is the point of the control.
    expect(lookupOrder).toHaveBeenCalledTimes(1);
  });

  it('gate ON + a complaint: no prefetch, the brain owns it', async () => {
    BOUND_CONFIG = { ...ORDERS, whatsapp_cs: { fast_path: true } };
    const callModel = vi.fn().mockResolvedValue({ toolCalls: [], text: 'אני כל כך מצטערת' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');

    await runCsTurn(job('ההזמנה 12345 הגיעה פגומה'), { callModel });

    expect(lookupOrder).not.toHaveBeenCalled();
    // Companion presence assertion: the turn really ran, so "not called" means "stood down",
    // not "nothing happened".
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(buildCsSystemPrompt.mock.calls[0][0].skipRag).toBe(false);
  });

  it('gate ON but the brand has no orders provider: no tool to seed, no crash', async () => {
    BOUND_CONFIG = { display_name: 'LA BEAUTE', archetype: 'brand', whatsapp_cs: { fast_path: true } };
    const callModel = vi.fn().mockResolvedValue({ toolCalls: [], text: 'אין לי גישה לפרטי ההזמנה' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');

    const res = await runCsTurn(job('איפה ההזמנה שלי 12345'), { callModel });

    expect(lookupOrder).not.toHaveBeenCalled();
    expect(res.reply).toEqual({ kind: 'text', body: 'אין לי גישה לפרטי ההזמנה' });
  });

  it('gate ON but no number given: RAG is still skipped, nothing is looked up', async () => {
    BOUND_CONFIG = { ...ORDERS, whatsapp_cs: { fast_path: true } };
    const callModel = vi.fn().mockResolvedValue({ toolCalls: [], text: 'מה מספר ההזמנה?' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');

    await runCsTurn(job('איפה ההזמנה שלי?'), { callModel });

    expect(lookupOrder).not.toHaveBeenCalled();
    expect(buildCsSystemPrompt.mock.calls[0][0].skipRag).toBe(true);
  });
});
