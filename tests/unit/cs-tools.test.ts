import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveBrand = vi.fn();
const listCsEnabledBrands = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/cs/brand-resolver', () => ({
  resolveBrand: (...a: any[]) => resolveBrand(...a),
  listCsEnabledBrands: (...a: any[]) => listCsEnabledBrands(...a),
}));
const lookupOrder = vi.fn();
const lookupOrdersByPhone = vi.fn();
vi.mock('@/lib/orders/lookup', () => ({ lookupOrder: (...a: any[]) => lookupOrder(...a), lookupOrdersByPhone: (...a: any[]) => lookupOrdersByPhone(...a) }));
const openOrAttachCsTicket = vi.fn().mockResolvedValue({ ticketId: 'ticket-1' });
vi.mock('@/lib/cs/cs-ticket', () => ({ openOrAttachCsTicket: (...a: any[]) => openOrAttachCsTicket(...a), appendCsTicketHistory: vi.fn() }));
const pauseBot = vi.fn();
vi.mock('@/lib/handoff/bot-pause', () => ({ pauseBot: (...a: any[]) => pauseBot(...a), isBotPaused: vi.fn(), resumeBot: vi.fn() }));
const runCsHandoffCheck = vi.fn().mockResolvedValue({ escalated: true });
vi.mock('@/engines/escalation/dispatch', () => ({ runCsHandoffCheck: (...a: any[]) => runCsHandoffCheck(...a) }));
vi.mock('@/lib/whatsapp-cloud/client', () => ({ toWaId: (s: string) => s.replace(/\D/g, '').replace(/^0/, '972') }));

const H: any = { account: null, threads: [], accountError: null };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const c: any = { table };
      c.select = () => c; c.eq = () => c; c.in = () => c; c.order = () => c; c.limit = () => c;
      c.single = async () => (table === 'accounts' && H.accountError)
        ? { data: null, error: H.accountError }
        : { data: table === 'accounts' ? H.account : null, error: null };
      c.maybeSingle = async () => ({ data: null, error: null });
      c.then = (r: any) => r({ data: table === 'support_requests' ? H.threads : [], error: null });
      return c;
    },
  },
}));

const ACC = '11111111-2222-4333-8444-555555555555'; // accounts.id is a uuid column — fixtures must look like one
const ctx = (over: any = {}) => ({ waId: '972501112222', accountId: null, chatSessionId: null, ticketId: null, customerName: 'דנה', identity: { channel: 'whatsapp', waId: '972501112222', trust: 'channel_verified' }, ...over } as any);
const tool = async (name: string) => {
  const { getCsTools } = await import('@/lib/cs/tools');
  const t = getCsTools().find((x) => x.def.function.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

describe('CS tools', () => {
  beforeEach(() => { vi.clearAllMocks(); H.account = null; H.threads = []; H.accountError = null; listCsEnabledBrands.mockResolvedValue([]); openOrAttachCsTicket.mockResolvedValue({ ticketId: 'ticket-1' }); runCsHandoffCheck.mockResolvedValue({ escalated: true }); });

  // show_products is NOT a menu widget: a product card sends no reply payload back, so it never
  // becomes something the shopper has to choose from. The no-menu rule still holds.
  it('CS_TOOL_DEFS exposes exactly the 11 conversational tools — NO show_buttons/show_list (pure-text CS, no menu widgets)', async () => {
    const { CS_TOOL_DEFS, getCsTools } = await import('@/lib/cs/tools');
    const names = CS_TOOL_DEFS.map((d) => d.function.name).sort();
    expect(names).toEqual(['bind_brand', 'escalate_to_human', 'list_open_threads', 'lookup_order', 'lookup_orders_by_phone', 'open_or_attach_ticket', 'remember_contact', 'remember_name', 'resolve_brand', 'search_products', 'show_products']);
    expect(names).not.toContain('show_buttons');
    expect(names).not.toContain('show_list');
    expect(CS_TOOL_DEFS.every((d) => d.type === 'function')).toBe(true);
    // getCsTools() (what the agent loop actually dispatches against) must agree — the brain
    // literally cannot emit a menu because no tool implementing one is ever registered.
    expect(getCsTools().map((t) => t.def.function.name).sort()).toEqual(names);
  });

  it('remember_name returns the learnedName signal (the agent loop persists it) — and rejects empty', async () => {
    const ok = await (await tool('remember_name')).handler({ name: '  דנה  ' }, ctx());
    expect(ok.ok).toBe(true);
    expect(ok.learnedName).toBe('דנה'); // trimmed
    const empty = await (await tool('remember_name')).handler({ name: '   ' }, ctx());
    expect(empty.ok).toBe(false);
    expect(empty.learnedName).toBeUndefined();
  });

  it('resolve_brand passes returning-memory preferAccountIds and maps candidates', async () => {
    H.threads = [{ account_id: 'acc-2' }];
    resolveBrand.mockResolvedValue({ kind: 'single', candidates: [{ accountId: 'acc-1', displayName: 'Argania', username: 'argania', domain: 'a.co', score: 0.9 }] });
    const r = await (await tool('resolve_brand')).handler({ query: 'ארגניה' }, ctx());
    expect(resolveBrand).toHaveBeenCalledWith('ארגניה', { preferAccountIds: ['acc-2'] });
    expect((r.data as any).candidates[0]).toMatchObject({ accountId: 'acc-1', name: 'Argania' });
  });

  it('bind_brand GATE: rejects a non-CS-enabled brand', async () => {
    H.account = { id: ACC, config: { whatsapp_cs: { enabled: false } } };
    const r = await (await tool('bind_brand')).handler({ accountId: ACC }, ctx());
    expect(r.ok).toBe(false);
    expect(openOrAttachCsTicket).not.toHaveBeenCalled();
  });

  it('bind_brand GATE: binds a CS-enabled brand + opens the ticket (returns bind signal)', async () => {
    H.account = { id: ACC, config: { whatsapp_cs: { enabled: true }, display_name: 'Argania' } };
    const r = await (await tool('bind_brand')).handler({ accountId: ACC }, ctx());
    expect(r.ok).toBe(true);
    expect(r.bind).toEqual({ accountId: ACC, ticketId: 'ticket-1' });
    expect(openOrAttachCsTicket).toHaveBeenCalledWith(expect.objectContaining({ accountId: ACC, waId: '972501112222' }));
  });

  it('lookup_order GATE: refuses when no brand is bound; scopes when bound', async () => {
    const unbound = await (await tool('lookup_order')).handler({ orderNumber: '1042' }, ctx());
    expect(unbound.ok).toBe(false);
    lookupOrder.mockResolvedValue({ kind: 'found', found: true, orderNumber: '1042', status: 'נשלח' });
    const bound = await (await tool('lookup_order')).handler({ orderNumber: '1042' }, ctx({ accountId: 'acc-1' }));
    expect(lookupOrder).toHaveBeenCalledWith('acc-1', '1042',
      expect.objectContaining({ channel: 'whatsapp', waId: '972501112222', trust: 'channel_verified' }));
    expect((bound.data as any).kind).toBe('found');
  });

  it('lookup_orders_by_phone passes the identity and surfaces identity_required as data', async () => {
    lookupOrdersByPhone.mockResolvedValue({ kind: 'found', orders: [{ orderNumber: '1042', status: 'fulfilled', total: '199.00', itemSummary: '2× Argan Oil', trackingUrls: ['https://t/1'] }] });
    const r = await (await tool('lookup_orders_by_phone')).handler({}, ctx({ accountId: 'acc-1' }));
    expect(lookupOrdersByPhone).toHaveBeenCalledWith('acc-1', expect.objectContaining({ channel: 'whatsapp' }));
    expect((r.data as any).orders[0]).toMatchObject({ orderNumber: '1042', trackingUrl: 'https://t/1' });
    lookupOrdersByPhone.mockResolvedValue({ kind: 'identity_required' });
    const gated = await (await tool('lookup_orders_by_phone')).handler({}, ctx({ accountId: 'acc-1' }));
    expect((gated.data as any).kind).toBe('identity_required');
  });

  it('escalate_to_human GATE: pauses the bot + notifies + returns escalated', async () => {
    const r = await (await tool('escalate_to_human')).handler({ reason: 'refund the bot cannot process' }, ctx({ accountId: 'acc-1', chatSessionId: 'cs-1', ticketId: 't1' }));
    expect(pauseBot).toHaveBeenCalledWith('cs-1', expect.stringContaining('escalate'));
    expect(runCsHandoffCheck).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1', chatSessionId: 'cs-1', force: true }));
    expect(r.escalated).toBe(true);
  });

  // A brand with escalation switched off has no human coming — pausing would drop the shopper into
  // silence. So when the handoff is skipped (disabled/flag_off), the tool must NOT pause the bot.
  it('escalate_to_human does NOT pause when escalation is disabled for the brand (no silent black hole)', async () => {
    runCsHandoffCheck.mockResolvedValueOnce({ escalated: false, skipped: 'disabled' });
    const r = await (await tool('escalate_to_human')).handler({ reason: 'refund' }, ctx({ accountId: 'acc-1', chatSessionId: 'cs-1', ticketId: 't1' }));
    expect(runCsHandoffCheck).toHaveBeenCalled();
    expect(pauseBot).not.toHaveBeenCalled();
    expect(r.escalated).toBeUndefined();
    expect((r.data as any).handed_off).toBe(false);
  });

  // THE 2026-09-03 SHARED-NUMBER FAILURE (פנינה / דנה כחלון). accounts.id is a uuid column, so a
  // non-UUID accountId makes PostgREST answer 400/22P02 — never a row. The error used to be
  // discarded, which turned a MALFORMED ARGUMENT into the policy verdict `brand_not_cs_enabled`:
  // the brain, told a brand the prompt had just listed as available was "not enabled", invented
  // "נראה שיש תקלה בחיבור ל-ARGANIA GROUP" and never bound. The two failures must be tellable apart.
  it('bind_brand: a non-UUID accountId reports invalid_account_id + a resolve_brand hint, NOT brand_not_cs_enabled', async () => {
    const r = await (await tool('bind_brand')).handler({ accountId: 'ARGANIA GROUP' }, ctx());
    expect(r.ok).toBe(false);
    expect((r.data as any).reason).toBe('invalid_account_id');
    expect((r.data as any).hint).toMatch(/resolve_brand/);
    expect(openOrAttachCsTicket).not.toHaveBeenCalled();
  });

  // Belt and braces: even a well-shaped uuid whose lookup ERRORS must not be reported as a policy
  // verdict. Swallowing that error is what let a transport failure read as "this brand is off".
  it('bind_brand: a DB error on a well-formed uuid is reported as invalid_account_id, never brand_not_cs_enabled', async () => {
    H.accountError = { code: '08006', message: 'connection failure' };
    const r = await (await tool('bind_brand')).handler({ accountId: ACC }, ctx());
    expect(r.ok).toBe(false);
    expect((r.data as any).reason).toBe('invalid_account_id');
    expect(openOrAttachCsTicket).not.toHaveBeenCalled();
  });

  // .single() answers PGRST116 for "no rows" — a uuid nobody owns is unknown, not malformed.
  it('bind_brand: a well-formed uuid with no matching brand reports unknown_account', async () => {
    H.account = null;
    const r = await (await tool('bind_brand')).handler({ accountId: ACC }, ctx());
    expect(r.ok).toBe(false);
    expect((r.data as any).reason).toBe('unknown_account');
  });

  it('bind_brand: a real brand with CS switched off still reports brand_not_cs_enabled (the policy verdict is unchanged)', async () => {
    H.account = { id: ACC, config: { whatsapp_cs: { enabled: false } } };
    const r = await (await tool('bind_brand')).handler({ accountId: ACC }, ctx());
    expect(r.ok).toBe(false);
    expect((r.data as any).reason).toBe('brand_not_cs_enabled');
  });

  // Unbound, escalate_to_human can file nothing (runCsHandoffCheck needs an accountId). It used to
  // answer a bare `not_bound`, and the brain read that as "escalated" and promised a callback that
  // reached nobody — פנינה and דנה were both told a human would come back. Zero tickets exist for
  // either. The refusal has to tell the brain what to do and forbid the promise.
  it('escalate_to_human unbound: refuses with a hint that forbids promising a human, and files nothing', async () => {
    const r = await (await tool('escalate_to_human')).handler({ reason: 'רוצה נציג' }, ctx({ accountId: null, chatSessionId: null }));
    expect(r.ok).toBe(false);
    expect((r.data as any).reason).toBe('not_bound');
    expect((r.data as any).hint).toMatch(/resolve_brand|bind_brand/);
    expect((r.data as any).hint).toMatch(/promise/i);
    expect(runCsHandoffCheck).not.toHaveBeenCalled();
    expect(pauseBot).not.toHaveBeenCalled();
  });

  // DEFENSE IN DEPTH, same principle as harvestContact: the shared number must not break because the
  // brain sent a name instead of a uuid. An UNAMBIGUOUS exact match against the CS-enabled roster
  // resolves in code. Exact only — never fuzzy, which is resolve_brand's job; and the roster it
  // matches against is CS-enabled-only, so this can never widen what bind_brand is allowed to bind.
  it('bind_brand: a brand name that exactly matches ONE CS-enabled brand resolves to its accountId and binds', async () => {
    listCsEnabledBrands.mockResolvedValue([
      { accountId: ACC, displayName: 'ARGANIA GROUP', username: 'argania_group', domain: 'argania-oil.co.il' },
      { accountId: '99999999-2222-4333-8444-555555555555', displayName: 'STUDIO PASHA', username: 'studiopasha_fashion', domain: 'studiopasha.co.il' },
    ]);
    H.account = { id: ACC, config: { whatsapp_cs: { enabled: true }, display_name: 'ARGANIA GROUP' } };
    for (const ref of ['ARGANIA GROUP', 'argania group', 'argania_group', 'argania-oil.co.il']) {
      openOrAttachCsTicket.mockClear();
      const r = await (await tool('bind_brand')).handler({ accountId: ref }, ctx());
      expect(r.ok, `ref=${ref}`).toBe(true);
      expect(r.bind).toEqual({ accountId: ACC, ticketId: 'ticket-1' });
      expect(openOrAttachCsTicket).toHaveBeenCalledWith(expect.objectContaining({ accountId: ACC }));
    }
  });

  it('bind_brand: a name matching NO CS-enabled brand stays invalid_account_id and binds nothing', async () => {
    listCsEnabledBrands.mockResolvedValue([
      { accountId: ACC, displayName: 'ARGANIA GROUP', username: 'argania_group', domain: 'argania-oil.co.il' },
    ]);
    const r = await (await tool('bind_brand')).handler({ accountId: 'ZARA' }, ctx());
    expect(r.ok).toBe(false);
    expect((r.data as any).reason).toBe('invalid_account_id');
    expect(r.bind).toBeUndefined();
    expect(openOrAttachCsTicket).not.toHaveBeenCalled();
  });

  // A partial/fuzzy reference must NOT be guessed at here — binding the wrong brand hands one
  // tenant's shopper to another. Narrowing is resolve_brand's job, with the shopper confirming.
  it('bind_brand: a partial name is NOT fuzzy-matched — it is refused, while the exact name binds', async () => {
    listCsEnabledBrands.mockResolvedValue([
      { accountId: ACC, displayName: 'ARGANIA GROUP', username: 'argania_group', domain: 'argania-oil.co.il' },
    ]);
    H.account = { id: ACC, config: { whatsapp_cs: { enabled: true } } };
    // Presence side FIRST, so the refusal below can never pass just because resolution is dead.
    const exact = await (await tool('bind_brand')).handler({ accountId: 'ARGANIA GROUP' }, ctx());
    expect(exact.ok).toBe(true);
    const partial = await (await tool('bind_brand')).handler({ accountId: 'argania' }, ctx());
    expect(partial.ok).toBe(false);
    expect(partial.bind).toBeUndefined();
  });

});
