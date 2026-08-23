import { describe, it, expect, vi, beforeEach } from 'vitest';

let store: Record<string, any> = {};
const sessionLoadCalls: Array<[string, string]> = [];
vi.mock('@/lib/cs/cs-session', () => ({
  WARM_WINDOW_MS: 45 * 60 * 1000,
  isWarm: () => false,
  loadCsSession: async (waId: string) => store[waId] || null,
  loadCsSessionByChannel: async (channel: string, channelUserId: string) => { sessionLoadCalls.push([channel, channelUserId]); return store[channelUserId] || null; },
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
  parseSuggestions: (t: string) => { const m = /<<SUGGESTIONS>>([\s\S]*?)<<\/SUGGESTIONS>>/.exec(t || ''); return m ? m[1].split('|').map((s: string) => s.trim()).filter(Boolean).slice(0, 4) : []; },
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

  // --- product cards (WhatsApp parity with the widget) ---

  const cards = [{ productId: 'p-1', name: 'מרכך קיק', price: 45.9, originalPrice: null, isOnSale: false, productUrl: 'https://x/product/a', imageUrl: 'https://cdn/a.webp' }];

  it('show_products cards ride out on the turn result, alongside the prose', async () => {
    handlers['show_products'] = vi.fn().mockResolvedValue({ ok: true, cards, data: { sent: [{ name: 'מרכך קיק' }] } });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'show_products', args: { refs: ['p1'] } }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'לשיער יבש אני ממליצה על המרכך הזה 👇' });
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('מה מתאים לשיער יבש?'), { callModel });
    expect(res.reply.kind).toBe('text');
    expect(res.cards).toEqual(cards);
    // The shown products are recorded on the assistant message so a later pass can attribute them.
    expect(inserted['chat_messages']).toContainEqual(expect.objectContaining({ role: 'assistant', metadata: { product_ids: ['p-1'] } }));
  });

  it('a turn with no cards carries none — and writes no product metadata', async () => {
    callModel.mockResolvedValue({ toolCalls: [], text: 'ההזמנה שלך בדרך 📦' });
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('איפה ההזמנה שלי'), { callModel });
    expect(res.cards).toBeUndefined();
    const assistant = (inserted['chat_messages'] || []).find((m: any) => m.role === 'assistant');
    expect(assistant.metadata).toBeUndefined();
  });

  // Following an escalation ack with product cards would read as selling to someone who just
  // reported a problem, so a hand-off discards whatever the brain queued earlier in the turn.
  it('hand-off wins over cards — an escalated turn sends no products', async () => {
    handlers['show_products'] = vi.fn().mockResolvedValue({ ok: true, cards, data: {} });
    handlers['escalate_to_human'] = vi.fn().mockResolvedValue({ ok: true, escalated: true, data: { handed_off: true } });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'show_products', args: { refs: ['p1'] } }], text: null })
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc2', name: 'escalate_to_human', args: { reason: 'מוצר פגום' } }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'מצטערת מאוד, מעבירה לנציג/ה 🙏' });
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('הגיע שבור'), { callModel });
    expect(res.reply.kind).toBe('text');
    expect(res.cards).toBeUndefined();
  });

  it('collects structured payloads from tool results (spec §6) — order card rides the turn result', async () => {
    handlers['lookup_order'] = vi.fn().mockResolvedValue({ ok: true, data: { kind: 'found', orderNumber: '1042', status: 'fulfilled', trackingUrls: ['https://t/1'] } });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'lookup_order', args: { orderNumber: '1042' } }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'ההזמנה נשלחה!' });
    store['972501112222'] = bound();
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('איפה 1042'), { callModel });
    expect(res.payloads).toEqual([{ kind: 'order_status_card', order: expect.objectContaining({ orderNumber: '1042', status: 'fulfilled', trackingUrl: 'https://t/1' }) }]);
  });

  // --- CS-engine M1 (spec §1, §8): the channel-agnostic entry ---

  it('runCsTurnCore accepts a channel identity and loads the session by (channel, channel_user_id)', async () => {
    sessionLoadCalls.length = 0;
    callModel.mockResolvedValueOnce({ toolCalls: [], text: 'שלום!' });
    const { runCsTurnCore } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurnCore(
      { identity: { channel: 'whatsapp', waId: '972501112222', trust: 'channel_verified' }, text: 'היי' },
      { callModel },
    );
    expect(res.reply).toEqual({ kind: 'text', body: 'שלום!' });
    expect(sessionLoadCalls).toContainEqual(['whatsapp', '972501112222']);
  });

  it('runCsTurn(job) delegates to the core with a whatsapp identity (worker contract unchanged)', async () => {
    sessionLoadCalls.length = 0;
    callModel.mockResolvedValueOnce({ toolCalls: [], text: 'שלום!' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('היי'), { callModel });
    expect(res.reply.kind).toBe('text');
    expect(sessionLoadCalls).toContainEqual(['whatsapp', '972501112222']);
  });

  it('parses <<SUGGESTIONS>> into CsTurnResult.suggestions AND strips them from the body (spec §5)', async () => {
    callModel.mockResolvedValueOnce({ toolCalls: [], text: 'בשמחה!<<SUGGESTIONS>>איפה ההזמנה?|פתיחת פנייה<</SUGGESTIONS>>' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurn(job('היי'), { callModel });
    expect(res.reply).toEqual({ kind: 'text', body: 'בשמחה!' });
    expect(res.suggestions).toEqual(['איפה ההזמנה?', 'פתיחת פנייה']);
  });

  // --- CS-engine M2 (spec §5, §7): web-channel readiness ---

  const widgetInput = (over: any = {}) => ({
    identity: { channel: 'widget', visitorId: 'v-77', trust: 'unverified' },
    text: 'איפה ההזמנה שלי?',
    boundAccountId: 'acc-1',
    ...over,
  } as any);

  it('boundAccountId auto-binds a fresh web session — first turn is already brand-scoped (spec §5)', async () => {
    callModel.mockResolvedValueOnce({ toolCalls: [], text: 'היי!' });
    const { runCsTurnCore } = await import('@/lib/cs/cs-agent');
    await runCsTurnCore(widgetInput(), { callModel });
    expect(store['v-77'].active_account_id).toBe('acc-1');
    expect(store['v-77'].active_chat_session_id).toBeTruthy();
  });

  it('claimedPhone upgrades the identity to phone_claimed, persists on the session, and survives the NEXT turn (spec §7)', async () => {
    const seenIdentities: any[] = [];
    handlers['lookup_orders_by_phone'] = vi.fn().mockImplementation(async (_a: any, ctx: any) => { seenIdentities.push(ctx.identity); return { ok: true, data: { orders: [] } }; });
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 't1', name: 'lookup_orders_by_phone', args: {} }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'בדקתי!' });
    const { runCsTurnCore } = await import('@/lib/cs/cs-agent');
    await runCsTurnCore(widgetInput({ claimedPhone: '0501234567' }), { callModel });
    expect(seenIdentities[0]).toMatchObject({ channel: 'widget', phone: '0501234567', trust: 'phone_claimed' });
    expect(store['v-77'].context.claimedPhone).toBe('0501234567');

    // Second turn WITHOUT claimedPhone — the stored phone still upgrades the identity.
    callModel
      .mockResolvedValueOnce({ toolCalls: [{ id: 't2', name: 'lookup_orders_by_phone', args: {} }], text: null })
      .mockResolvedValueOnce({ toolCalls: [], text: 'שוב!' });
    await runCsTurnCore(widgetInput(), { callModel });
    expect(seenIdentities[1]).toMatchObject({ channel: 'widget', phone: '0501234567', trust: 'phone_claimed' });
  });

  // --- The Studio Pasha hand-off gap (2026-08-23) ---------------------------
  // The code backstop returns BEFORE the tool loop, so escalate_to_human's contact gate never
  // ran on the most common escalation of all ("אני רוצה נציג") and the dispatch was called with
  // no contact fields at all. Result: a ticket stamped "no way to reach this customer" while the
  // shopper's phone sat on the very session that filed it.

  const boundWidget = (context: any = {}) => ({
    wa_id: 'v-77', contact_id: null, phase: 'serving', active_account_id: 'acc-1',
    active_ticket_id: null, active_chat_session_id: 'cs-9', customer_name: 'דנה',
    context, last_activity_at: new Date().toISOString(), version: 2,
  });

  it('backstop hand-off carries the contact route the session already knows', async () => {
    store['v-77'] = boundWidget({ claimedPhone: '0507106050' });
    detectHandoff.mockReturnValue({ triggered: true, triggers: ['human_demand'], severity: 'high', reason: 'human' });
    const { runCsTurnCore } = await import('@/lib/cs/cs-agent');
    await runCsTurnCore(widgetInput({ text: 'אני מבקשת בפעם הרביעית לדבר עם נציג אנושי' }), { callModel });
    expect(runCsHandoffCheck).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: '0507106050', force: true }));
  });

  it('backstop hand-off harvests a phone typed in the escalating message itself', async () => {
    store['v-77'] = boundWidget();
    detectHandoff.mockReturnValue({ triggered: true, triggers: ['human_demand'], severity: 'high', reason: 'human' });
    const { runCsTurnCore } = await import('@/lib/cs/cs-agent');
    await runCsTurnCore(widgetInput({ text: 'דנה כחלון 0507106050 - אני רוצה נציג' }), { callModel });
    expect(runCsHandoffCheck).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: '0507106050' }));
    expect(store['v-77'].context.claimedPhone).toBe('0507106050');
  });

  it('backstop gate: no contact route on a web channel → asks once instead of filing an unanswerable ticket', async () => {
    store['v-77'] = boundWidget();
    detectHandoff.mockReturnValue({ triggered: true, triggers: ['human_demand'], severity: 'high', reason: 'רוצה נציג' });
    const { runCsTurnCore } = await import('@/lib/cs/cs-agent');
    const res = await runCsTurnCore(widgetInput({ text: 'אני רוצה לדבר עם נציג' }), { callModel });
    expect(runCsHandoffCheck).not.toHaveBeenCalled();
    expect(callModel).not.toHaveBeenCalled();
    if (res.reply.kind === 'text') expect(res.reply.body).toMatch(/טלפון|מייל/);
    expect(store['v-77'].context.contactAsked).toBe(true);
    expect(store['v-77'].context.pendingHandoff).toMatchObject({ reason: 'אני רוצה לדבר עם נציג' });
  });

  it('...and the hand-off fires by itself the moment the number arrives — the shopper is never dropped', async () => {
    store['v-77'] = boundWidget({ contactAsked: true, pendingHandoff: { reason: 'רוצה נציג' } });
    detectHandoff.mockReturnValue({ triggered: false, triggers: [], severity: 'low', reason: '' });
    const { runCsTurnCore } = await import('@/lib/cs/cs-agent');
    await runCsTurnCore(widgetInput({ text: '0507106050' }), { callModel });
    expect(runCsHandoffCheck).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: '0507106050', userMessage: 'רוצה נציג', force: true }));
    expect(store['v-77'].context.pendingHandoff).toBeFalsy();
  });

  it('the gate blocks exactly once — a shopper who gives nothing is still handed off', async () => {
    store['v-77'] = boundWidget({ contactAsked: true });
    detectHandoff.mockReturnValue({ triggered: true, triggers: ['human_demand'], severity: 'high', reason: 'רוצה נציג' });
    const { runCsTurnCore } = await import('@/lib/cs/cs-agent');
    await runCsTurnCore(widgetInput({ text: 'אני רוצה נציג עכשיו' }), { callModel });
    expect(runCsHandoffCheck).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: null }));
  });

  it('WhatsApp is never gated — the number IS the channel', async () => {
    store['972501112222'] = bound();
    detectHandoff.mockReturnValue({ triggered: true, triggers: ['human_demand'], severity: 'high', reason: 'human' });
    const { runCsTurn } = await import('@/lib/cs/cs-agent');
    await runCsTurn(job('אני רוצה נציג'), { callModel });
    expect(runCsHandoffCheck).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: '972501112222' }));
  });
});
