import { describe, it, expect, vi, beforeEach } from 'vitest';

let store: Record<string, any> = {};
vi.mock('@/lib/cs/cs-session', () => ({
  WARM_WINDOW_MS: 45 * 60 * 1000,
  isWarm: () => false,
  loadCsSession: async (waId: string) => store[waId] || null,
  createCsSession: async (waId: string, contactId: string | null) => { const r = { wa_id: waId, contact_id: contactId, phase: 'onboarding', active_account_id: null, active_ticket_id: null, active_chat_session_id: null, customer_name: null, context: {}, last_activity_at: new Date().toISOString(), version: 0 }; store[waId] = r; return r; },
  saveCsSession: async (prev: any, patch: any) => { store[prev.wa_id] = { ...prev, ...patch, version: prev.version + 1 }; return true; },
}));

// Tool set: a controllable in-memory map of handlers.
const handlers: Record<string, any> = {};
vi.mock('@/lib/cs/tools', () => ({
  CS_TOOL_DEFS: [{ type: 'function', function: { name: 'resolve_brand', description: '', parameters: {} } }],
  getCsTools: () => Object.entries(handlers).map(([name, handler]) => ({ def: { type: 'function', function: { name, description: '', parameters: {} } }, handler })),
}));

vi.mock('@/lib/cs/cs-context', () => ({
  stripSuggestions: (t: string) => (t || '').replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim(),
  buildContextDigest: async () => ({ knownName: null, boundBrand: null, warm: false, openThreads: [] }),
  buildCsSystemPrompt: async () => 'SYS',
}));

const isBotPaused = vi.fn().mockResolvedValue(false);
vi.mock('@/lib/handoff/bot-pause', () => ({ isBotPaused: (...a: any[]) => isBotPaused(...a), pauseBot: vi.fn(), resumeBot: vi.fn() }));
const detectHandoff = vi.fn().mockReturnValue({ triggered: false, triggers: [], severity: 'low', reason: '' });
vi.mock('@/engines/escalation/detect', () => ({ detectHandoff: (...a: any[]) => detectHandoff(...a) }));
const runCsHandoffCheck = vi.fn().mockResolvedValue({ escalated: true });
vi.mock('@/engines/escalation/dispatch', () => ({ runCsHandoffCheck: (...a: any[]) => runCsHandoffCheck(...a) }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => { const c: any = {}; c.select = () => c; c.eq = () => c; c.in = () => c; c.order = () => c; c.limit = () => c; c.single = async () => ({ data: null }); c.maybeSingle = async () => ({ data: null }); c.insert = async () => ({ data: null }); c.update = () => ({ eq: async () => ({ data: null }) }); c.then = (r: any) => r({ data: [] }); return c; } },
}));

const job = (textBody: string) => ({ waId: '972501112222', msg: { id: 'w1' }, textBody, contactId: 'c1' } as any);
const bound = () => ({ wa_id: '972501112222', contact_id: 'c1', phase: 'serving', active_account_id: 'acc-1', active_ticket_id: 't1', active_chat_session_id: 'cs-1', customer_name: 'דנה', context: {}, last_activity_at: new Date().toISOString(), version: 2 });
const callModel = vi.fn();

describe('runCsTurn (brain-led loop)', () => {
  beforeEach(() => { store = {}; for (const k in handlers) delete handlers[k]; vi.clearAllMocks(); isBotPaused.mockResolvedValue(false); detectHandoff.mockReturnValue({ triggered: false, triggers: [], severity: 'low', reason: '' }); runCsHandoffCheck.mockResolvedValue({ escalated: true }); });

  it('paused thread → {kind:none}, model NOT called', async () => {
    isBotPaused.mockResolvedValue(true);
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('היי'), { callModel });
    expect(res.reply.kind).toBe('none');
    expect(callModel).not.toHaveBeenCalled();
  });

  it('detectHandoff backstop fires → runCsHandoffCheck + handoff ack, model NOT called', async () => {
    detectHandoff.mockReturnValue({ triggered: true, triggers: ['refund_return'], severity: 'medium', reason: 'refund' });
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('אני רוצה החזר כספי'), { callModel });
    expect(runCsHandoffCheck).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1', chatSessionId: 'cs-1', force: true }));
    expect(res.reply.kind).toBe('text');
    expect(callModel).not.toHaveBeenCalled();
  });

  it('plain answer: model returns text (no tools) → stripped text reply', async () => {
    callModel.mockResolvedValue({ toolCalls: [], text: 'שלום דנה 🙂\n<<SUGGESTIONS>>a<</SUGGESTIONS>>' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('היי'), { callModel });
    expect(res.reply.kind).toBe('text');
    if (res.reply.kind === 'text') expect(res.reply.body).toBe('שלום דנה 🙂');
  });

  it('tool call → dispatches the handler, then produces final text', async () => {
    handlers['resolve_brand'] = vi.fn().mockResolvedValue({ ok: true, data: { kind: 'single', candidates: [{ accountId: 'acc-1', name: 'Argania' }] } });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'resolve_brand', args: { query: 'ארגניה' } }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'מצאתי את Argania — לאשר?' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('ארגניה'), { callModel });
    expect(handlers['resolve_brand']).toHaveBeenCalled();
    if (res.reply.kind === 'text') expect(res.reply.body).toContain('Argania');
  });

  it('bind side-effect → sets active_account_id + phase=serving on the session', async () => {
    handlers['bind_brand'] = vi.fn().mockResolvedValue({ ok: true, bind: { accountId: 'acc-1', ticketId: 't1' }, data: { brand: 'Argania' } });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'bind_brand', args: { accountId: 'acc-1' } }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'מעולה!' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    await runCsTurn(job('כן'), { callModel });
    expect(store['972501112222'].active_account_id).toBe('acc-1');
    expect(store['972501112222'].phase).toBe('serving');
  });

  it('interactive tool short-circuits → reply IS the interactive payload', async () => {
    handlers['show_buttons'] = vi.fn().mockResolvedValue({ ok: true, interactive: { kind: 'buttons', body: 'מדובר ב-Argania?', buttons: [{ id: 'yes', title: 'כן' }] } });
    callModel.mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'show_buttons', args: {} }], text: null });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('ארגניה'), { callModel });
    expect(res.reply.kind).toBe('buttons');
  });

  it('escalate tool short-circuits → reply {kind:none}', async () => {
    handlers['escalate_to_human'] = vi.fn().mockResolvedValue({ ok: true, escalated: true });
    callModel.mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'escalate_to_human', args: { reason: 'x' } }], text: null });
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('אני רוצה נציג'), { callModel });
    expect(res.reply.kind).toBe('none');
  });
});
