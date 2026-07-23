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

// Spy on whatsapp_contacts updates specifically, so the learnedName side-effect test can assert
// the contact record was patched with the learned name (the generic chain below handles every
// other table the same way it always did).
const contactsUpdate = vi.fn().mockReturnValue({ eq: async () => ({ data: null }) });
// Capture inserts per table so the paused-inbound recording test can assert the shopper's message
// was written to chat_messages + the ticket history (see recordPausedInbound in cs-agent.ts).
const inserted: Record<string, any[]> = {};
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => { const c: any = {}; c.select = () => c; c.eq = () => c; c.in = () => c; c.order = () => c; c.limit = () => c; c.single = async () => ({ data: null }); c.maybeSingle = async () => ({ data: null }); c.insert = async (row: any) => { (inserted[table] ||= []).push(row); return { data: null }; }; c.update = table === 'whatsapp_contacts' ? contactsUpdate : () => ({ eq: async () => ({ data: null }) }); c.then = (r: any) => r({ data: [] }); return c; } },
}));

const job = (textBody: string) => ({ waId: '972501112222', msg: { id: 'w1' }, textBody, contactId: 'c1' } as any);
const bound = () => ({ wa_id: '972501112222', contact_id: 'c1', phase: 'serving', active_account_id: 'acc-1', active_ticket_id: 't1', active_chat_session_id: 'cs-1', customer_name: 'דנה', context: {}, last_activity_at: new Date().toISOString(), version: 2 });
const callModel = vi.fn();

describe('runCsTurn (brain-led loop)', () => {
  beforeEach(() => { store = {}; for (const k in handlers) delete handlers[k]; for (const k in inserted) delete inserted[k]; vi.clearAllMocks(); isBotPaused.mockResolvedValue(false); detectHandoff.mockReturnValue({ triggered: false, triggers: [], severity: 'low', reason: '' }); runCsHandoffCheck.mockResolvedValue({ escalated: true }); });

  it('paused thread → {kind:none}, model NOT called, but the inbound IS recorded for the human', async () => {
    isBotPaused.mockResolvedValue(true);
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('היי'), { callModel });
    expect(res.reply.kind).toBe('none');
    expect(callModel).not.toHaveBeenCalled();
    // route-inbound no longer files whatsapp_cs/auto_escalation tickets, so the paused thread must
    // record the shopper's message itself: to the transcript + the bound ticket's history.
    expect(inserted['chat_messages']).toContainEqual(expect.objectContaining({ session_id: 'cs-1', role: 'user', content: 'היי' }));
    expect(inserted['support_ticket_history']).toContainEqual(expect.objectContaining({ ticket_id: 't1', action: 'customer_reply', actor: 'customer' }));
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

  it('fails CLOSED: detectHandoff triggered but runCsHandoffCheck REJECTS → still returns the handoff ack, model NOT called', async () => {
    detectHandoff.mockReturnValue({ triggered: true, triggers: ['legal'], severity: 'critical', reason: 'legal' });
    runCsHandoffCheck.mockRejectedValue(new Error('notify/pause dispatch failed'));
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('אני אתבע אתכם'), { callModel });
    expect(runCsHandoffCheck).toHaveBeenCalled();
    expect(res.reply.kind).toBe('text');
    if (res.reply.kind === 'text') expect(res.reply.body).toContain('נציג');
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

  // Pure-conversational contract: no CS tool emits an interactive payload anymore, so the loop
  // always keeps iterating on tool calls until the model produces plain text — even after a
  // resolve_brand call, the reply is text (the brain's own prose confirm), never {kind:'buttons'}.
  it('no tool short-circuits into an interactive reply — resolve_brand → the model\'s own prose confirmation is the reply', async () => {
    handlers['resolve_brand'] = vi.fn().mockResolvedValue({ ok: true, data: { kind: 'single', candidates: [{ accountId: 'acc-1', name: 'Argania', domain: 'argania-oil.co.il' }] } });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'resolve_brand', args: { query: 'ארגניה' } }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'מדובר ב-Argania (argania-oil.co.il)?' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('ארגניה'), { callModel });
    expect(res.reply.kind).toBe('text');
    if (res.reply.kind === 'text') expect(res.reply.body).toBe('מדובר ב-Argania (argania-oil.co.il)?');
  });

  // Live-observed 2026-07-22: a shopper reported a damaged product, the brain escalated correctly —
  // but the tool path returned {kind:'none'} so the customer got SILENCE. A hand-off must still ack
  // THIS turn: the loop no longer short-circuits, so the model composes an empathetic closing.
  it('escalate tool → does NOT go silent; the model composes an empathetic hand-off ack (text reply)', async () => {
    handlers['escalate_to_human'] = vi.fn().mockResolvedValue({ ok: true, escalated: true, data: { handed_off: true } });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'escalate_to_human', args: { reason: 'מוצר פגום' } }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'אוי עידו, אני ממש מצטערת שזה קרה 😔 העברתי את זה לנציג/ה שיטפלו בהקדם.' });
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('הקרם הגיע פתוח ונזל'), { callModel });
    expect(handlers['escalate_to_human']).toHaveBeenCalled();
    expect(res.reply.kind).toBe('text');
    if (res.reply.kind === 'text') expect(res.reply.body).toContain('נציג');
  });

  it('escalate then empty model text → falls back to the empathetic hand-off ack, NEVER the rephrase fallback', async () => {
    handlers['escalate_to_human'] = vi.fn().mockResolvedValue({ ok: true, escalated: true, data: { handed_off: true } });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'escalate_to_human', args: {} }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: '' });
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('נזק במשלוח'), { callModel });
    expect(res.reply.kind).toBe('text');
    if (res.reply.kind === 'text') {
      expect(res.reply.body).toContain('נציג');
      expect(res.reply.body).not.toContain('לנסח שוב');
    }
  });

  it('MAX_ITERS safety net: model NEVER stops calling tools → loop terminates after exactly 5 iters with the rephrase fallback', async () => {
    handlers['some_tool'] = vi.fn().mockResolvedValue({ ok: true, data: { info: 'ok' } });
    callModel.mockResolvedValue({ toolCalls: [{ id: 'tc', name: 'some_tool', args: {} }], text: null });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('משהו'), { callModel });
    expect(callModel).toHaveBeenCalledTimes(5);
    expect(res.reply.kind).toBe('text');
    if (res.reply.kind === 'text') expect(res.reply.body).toBe('סליחה, אפשר לנסח שוב? 🙏');
  });

  it('recentTurns memory: plain-text turn persists {user, assistant} to session.context.recentTurns', async () => {
    callModel.mockResolvedValue({ toolCalls: [], text: 'שלום! איך אפשר לעזור?' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    await runCsTurn(job('היי, קוראים לי דנה'), { callModel });
    expect(store['972501112222'].context.recentTurns).toEqual([
      { role: 'user', text: 'היי, קוראים לי דנה' },
      { role: 'assistant', text: 'שלום! איך אפשר לעזור?' },
    ]);
  });

  it('recentTurns memory: caps at the last 8 entries (4 exchanges), dropping the oldest first', async () => {
    const priorTurns = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: `msg${i}` }));
    store['972501112222'] = {
      wa_id: '972501112222', contact_id: 'c1', phase: 'onboarding',
      active_account_id: null, active_ticket_id: null, active_chat_session_id: null,
      customer_name: null, context: { recentTurns: priorTurns }, last_activity_at: new Date().toISOString(), version: 3,
    };
    callModel.mockResolvedValue({ toolCalls: [], text: 'תשובה חדשה' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    await runCsTurn(job('הודעה חדשה'), { callModel });
    const turns = store['972501112222'].context.recentTurns;
    expect(turns).toHaveLength(8);
    expect(turns[0]).toEqual({ role: 'user', text: 'msg2' }); // oldest 2 (msg0, msg1) dropped
    expect(turns[6]).toEqual({ role: 'user', text: 'הודעה חדשה' });
    expect(turns[7]).toEqual({ role: 'assistant', text: 'תשובה חדשה' });
  });

  it('learnedName side-effect → session.customer_name + whatsapp_contacts.profile_name updated', async () => {
    handlers['learn_name'] = vi.fn().mockResolvedValue({ ok: true, learnedName: 'דנה' });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'learn_name', args: {} }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'נעים להכיר, דנה!' });
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    await runCsTurn(job('קוראים לי דנה'), { callModel });
    expect(store['972501112222'].customer_name).toBe('דנה');
    expect(contactsUpdate).toHaveBeenCalledWith({ profile_name: 'דנה' });
  });

  // Multimodal image inbound: the brain must SEE the photo — the user message becomes a content-part
  // array (text + image_url data URL), and the caption is the text stand-in for persistence/escalation.
  it('image inbound → model gets multimodal content (text + image_url); text turns stay plain strings', async () => {
    callModel.mockResolvedValue({ toolCalls: [], text: 'אני רואה שהקרם הגיע פתוח — מצטערת מאוד 😔' });
    const imgJob = { waId: '972501112222', msg: { id: 'w1', type: 'image', image: { id: 'm1', caption: 'הקרם הגיע פתוח' } }, textBody: null, contactId: 'c1',
      image: { dataUrl: 'data:image/jpeg;base64,AAAA', url: 'https://store/x.jpg', caption: 'הקרם הגיע פתוח', mime: 'image/jpeg' } } as any;
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(imgJob, { callModel });
    const sent = (callModel.mock.calls[0][0] as any).messages;
    const last = sent[sent.length - 1];
    expect(Array.isArray(last.content)).toBe(true);
    expect(last.content[0]).toEqual({ type: 'text', text: '[תמונה] הקרם הגיע פתוח' });
    expect(last.content[1].type).toBe('image_url');
    expect(last.content[1].image_url.url).toContain('base64');
    expect(res.reply.kind).toBe('text');

    callModel.mockClear();
    await runCsTurn(job('היי'), { callModel });
    const sent2 = (callModel.mock.calls[0][0] as any).messages;
    expect(typeof sent2[sent2.length - 1].content).toBe('string');
  });
});
