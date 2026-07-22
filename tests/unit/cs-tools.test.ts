import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveBrand = vi.fn();
vi.mock('@/lib/cs/brand-resolver', () => ({ resolveBrand: (...a: any[]) => resolveBrand(...a), listCsEnabledBrands: vi.fn() }));
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

const H: any = { account: null, threads: [] };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const c: any = { table };
      c.select = () => c; c.eq = () => c; c.in = () => c; c.order = () => c; c.limit = () => c;
      c.single = async () => ({ data: table === 'accounts' ? H.account : null, error: null });
      c.maybeSingle = async () => ({ data: null, error: null });
      c.then = (r: any) => r({ data: table === 'support_requests' ? H.threads : [], error: null });
      return c;
    },
  },
}));

const ctx = (over: any = {}) => ({ waId: '972501112222', accountId: null, chatSessionId: null, ticketId: null, customerName: 'דנה', senderPhone: '972501112222', ...over } as any);
const tool = async (name: string) => {
  const { getCsTools } = await import('@/lib/cs/tools');
  const t = getCsTools().find((x) => x.def.function.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

describe('CS tools', () => {
  beforeEach(() => { vi.clearAllMocks(); H.account = null; H.threads = []; openOrAttachCsTicket.mockResolvedValue({ ticketId: 'ticket-1' }); runCsHandoffCheck.mockResolvedValue({ escalated: true }); });

  it('CS_TOOL_DEFS exposes exactly the 8 conversational tools — NO show_buttons/show_list (pure-text CS, no menu widgets)', async () => {
    const { CS_TOOL_DEFS, getCsTools } = await import('@/lib/cs/tools');
    const names = CS_TOOL_DEFS.map((d) => d.function.name).sort();
    expect(names).toEqual(['bind_brand', 'escalate_to_human', 'list_open_threads', 'lookup_order', 'lookup_orders_by_phone', 'open_or_attach_ticket', 'remember_name', 'resolve_brand']);
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
    H.account = { id: 'acc-1', config: { whatsapp_cs: { enabled: false } } };
    const r = await (await tool('bind_brand')).handler({ accountId: 'acc-1' }, ctx());
    expect(r.ok).toBe(false);
    expect(openOrAttachCsTicket).not.toHaveBeenCalled();
  });

  it('bind_brand GATE: binds a CS-enabled brand + opens the ticket (returns bind signal)', async () => {
    H.account = { id: 'acc-1', config: { whatsapp_cs: { enabled: true }, display_name: 'Argania' } };
    const r = await (await tool('bind_brand')).handler({ accountId: 'acc-1' }, ctx());
    expect(r.ok).toBe(true);
    expect(r.bind).toEqual({ accountId: 'acc-1', ticketId: 'ticket-1' });
    expect(openOrAttachCsTicket).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1', waId: '972501112222' }));
  });

  it('lookup_order GATE: refuses when no brand is bound; scopes when bound', async () => {
    const unbound = await (await tool('lookup_order')).handler({ orderNumber: '1042' }, ctx());
    expect(unbound.ok).toBe(false);
    lookupOrder.mockResolvedValue({ kind: 'found', found: true, orderNumber: '1042', status: 'נשלח' });
    const bound = await (await tool('lookup_order')).handler({ orderNumber: '1042' }, ctx({ accountId: 'acc-1' }));
    expect(lookupOrder).toHaveBeenCalledWith('acc-1', '1042', '972501112222');
    expect((bound.data as any).kind).toBe('found');
  });

  it('escalate_to_human GATE: pauses the bot + notifies + returns escalated', async () => {
    const r = await (await tool('escalate_to_human')).handler({ reason: 'refund the bot cannot process' }, ctx({ accountId: 'acc-1', chatSessionId: 'cs-1', ticketId: 't1' }));
    expect(pauseBot).toHaveBeenCalledWith('cs-1', expect.stringContaining('escalate'));
    expect(runCsHandoffCheck).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1', chatSessionId: 'cs-1', force: true }));
    expect(r.escalated).toBe(true);
  });

});
