import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import type { CsTool, CsToolCtx, CsToolResult, OpenAIFunctionDef } from './types';

const TERMINAL_TICKET = new Set(['resolved', 'closed', 'cancelled']);
function phoneVariants(waId: string): string[] {
  const wa = toWaId(waId);
  const local = wa.startsWith('972') ? '0' + wa.slice(3) : wa;
  return Array.from(new Set([waId, wa, local, '+' + wa]));
}

// Returning memory (§6 step #1): account_ids this shopper already engaged (open/closed whatsapp_cs tickets).
async function previouslyEngagedAccountIds(waId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('support_requests').select('account_id').eq('source', 'whatsapp_cs').in('customer_phone', phoneVariants(waId));
  return Array.from(new Set(((data as any[]) || []).map((r) => r.account_id).filter(Boolean)));
}

// Open (non-terminal) whatsapp_cs threads for this shopper, newest first, with the brand display name.
async function openCsThreads(waId: string): Promise<Array<{ ticketId: string; brand: string; topic: string; status: string }>> {
  const { data } = await supabaseAdmin
    .from('support_requests').select('id, account_id, status, message, metadata, accounts(config)')
    .eq('source', 'whatsapp_cs').in('customer_phone', phoneVariants(waId)).order('updated_at', { ascending: false }).limit(10);
  return ((data as any[]) || []).filter((r) => !TERMINAL_TICKET.has(r.status)).map((r) => ({
    ticketId: r.id,
    brand: r.accounts?.config?.display_name || r.accounts?.config?.username || 'המותג',
    topic: r.metadata?.topic || r.message || 'פנייה',
    status: r.status,
  }));
}

const resolveBrandTool: CsTool = {
  def: { type: 'function', function: {
    name: 'resolve_brand',
    description: "Fuzzy-match the shopper's brand mention (Hebrew/English/misspelling) against the CS-enabled brands. Returns ranked candidates. Call BEFORE bind_brand; when 2+ candidates, present them with show_list.",
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'the brand name or site the shopper mentioned' } }, required: ['query'] },
  } },
  async handler(args, ctx) {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const preferAccountIds = await previouslyEngagedAccountIds(ctx.senderPhone);
    const res = await resolveBrand(String(args?.query || ''), { preferAccountIds });
    return { ok: true, data: { kind: res.kind, candidates: res.candidates.map((c) => ({ accountId: c.accountId, name: c.displayName, domain: c.domain, score: c.score })) } };
  },
};

const lookupOrderTool: CsTool = {
  def: { type: 'function', function: {
    name: 'lookup_order',
    description: 'Look up ONE order by its number for the bound brand. Phone verification is enforced INSIDE. Returns structured data (kind: found|not_found|unverified|ambiguous) — YOU phrase the reply from it.',
    parameters: { type: 'object', properties: { orderNumber: { type: 'string' } }, required: ['orderNumber'] },
  } },
  async handler(args, ctx) {
    if (!ctx.accountId) return { ok: false, data: { reason: 'no_brand_bound' } };
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const outcome = await lookupOrder(ctx.accountId, String(args?.orderNumber || ''), ctx.senderPhone);
    return { ok: true, data: outcome };
  },
};

const lookupOrdersByPhoneTool: CsTool = {
  def: { type: 'function', function: {
    name: 'lookup_orders_by_phone',
    description: "Proactively find the shopper's recent orders for the bound brand by their WhatsApp phone, so they need not type a number.",
    parameters: { type: 'object', properties: {} },
  } },
  async handler(_args, ctx) {
    if (!ctx.accountId) return { ok: false, data: { reason: 'no_brand_bound' } };
    const { lookupOrdersByPhone } = await import('@/lib/orders/lookup');
    const orders = await lookupOrdersByPhone(ctx.accountId, ctx.senderPhone);
    return { ok: true, data: { orders: orders.map((o) => ({ orderNumber: o.orderNumber, status: o.status, total: o.total, itemSummary: o.itemSummary, trackingUrl: o.trackingUrls?.[0] })) } };
  },
};

const listOpenThreadsTool: CsTool = {
  def: { type: 'function', function: {
    name: 'list_open_threads',
    description: "List the shopper's open support threads (across brands) so you can offer to continue one (adaptive re-entry).",
    parameters: { type: 'object', properties: {} },
  } },
  async handler(_args, ctx) {
    return { ok: true, data: { threads: await openCsThreads(ctx.senderPhone) } };
  },
};

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + '…');
const showButtonsTool: CsTool = {
  def: { type: 'function', function: {
    name: 'show_buttons',
    description: 'Render up to 3 tappable reply buttons (e.g. Yes/No, brand confirm, continue/other). Use for a small fixed choice instead of typing.',
    parameters: { type: 'object', properties: {
      body: { type: 'string' },
      buttons: { type: 'array', maxItems: 3, items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } }, required: ['id', 'title'] } },
      header: { type: 'string' }, footer: { type: 'string' },
    }, required: ['body', 'buttons'] },
  } },
  async handler(args): Promise<CsToolResult> {
    const buttons = (Array.isArray(args?.buttons) ? args.buttons : []).slice(0, 3).map((b: any) => ({ id: String(b.id), title: clip(String(b.title), 20) }));
    return { ok: true, interactive: { kind: 'buttons', body: String(args?.body || ''), buttons, header: args?.header, footer: args?.footer } };
  },
};

const showListTool: CsTool = {
  def: { type: 'function', function: {
    name: 'show_list',
    description: 'Render a tappable WhatsApp list (e.g. brand disambiguation, thread re-entry). Up to 10 rows total.',
    parameters: { type: 'object', properties: {
      body: { type: 'string' }, buttonLabel: { type: 'string' },
      sections: { type: 'array', items: { type: 'object', properties: {
        title: { type: 'string' },
        rows: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } }, required: ['id', 'title'] } },
      }, required: ['rows'] } },
    }, required: ['body', 'sections'] },
  } },
  async handler(args): Promise<CsToolResult> {
    const sections = (Array.isArray(args?.sections) ? args.sections : []).map((s: any) => ({
      ...(s.title ? { title: clip(String(s.title), 24) } : {}),
      rows: (Array.isArray(s.rows) ? s.rows : []).map((r: any) => ({ id: String(r.id), title: clip(String(r.title), 24), ...(r.description ? { description: clip(String(r.description), 72) } : {}) })),
    }));
    return { ok: true, interactive: { kind: 'list', body: String(args?.body || ''), buttonLabel: clip(String(args?.buttonLabel || 'בחירה'), 20), sections } };
  },
};

const bindBrandTool: CsTool = {
  def: { type: 'function', function: {
    name: 'bind_brand',
    description: 'Bind the conversation to a brand AFTER the shopper confirms. Validates the brand is CS-enabled, opens/attaches its support ticket, and scopes ALL later reads to it.',
    parameters: { type: 'object', properties: { accountId: { type: 'string' } }, required: ['accountId'] },
  } },
  async handler(args, ctx): Promise<CsToolResult> {
    const accountId = String(args?.accountId || '');
    if (!accountId) return { ok: false, data: { reason: 'missing_accountId' } };
    // GATE: only CS-enabled brands may be bound (prevents wrong-brand data leakage).
    const { data: acct } = await supabaseAdmin.from('accounts').select('id, config').eq('id', accountId).single();
    const cfg = (acct as any)?.config || {};
    if (cfg?.whatsapp_cs?.enabled !== true) return { ok: false, data: { reason: 'brand_not_cs_enabled' } };
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket'); // Phase D (D1)
    let ticketId: string | null = ctx.ticketId;
    try { ticketId = (await openOrAttachCsTicket({ accountId, waId: ctx.waId, customerPhone: ctx.senderPhone, customerName: ctx.customerName })).ticketId; }
    catch (e) { console.warn('[cs-tools] openOrAttachCsTicket failed', e); }
    return { ok: true, bind: { accountId, ticketId }, data: { brand: cfg.display_name || cfg.username || accountId, ticketId } };
  },
};

const openOrAttachTicketTool: CsTool = {
  def: { type: 'function', function: {
    name: 'open_or_attach_ticket',
    description: 'Ensure a support thread exists for the bound brand + this shopper (documents the conversation). Rarely needed — bind_brand already opens one.',
    parameters: { type: 'object', properties: { topic: { type: 'string' } } },
  } },
  async handler(args, ctx): Promise<CsToolResult> {
    if (!ctx.accountId) return { ok: false, data: { reason: 'no_brand_bound' } };
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket'); // Phase D (D1)
    const t = await openOrAttachCsTicket({ accountId: ctx.accountId, waId: ctx.waId, customerPhone: ctx.senderPhone, customerName: ctx.customerName, topic: args?.topic });
    return { ok: true, bind: { accountId: ctx.accountId, ticketId: t.ticketId }, data: { ticketId: t.ticketId } };
  },
};

const escalateTool: CsTool = {
  def: { type: 'function', function: {
    name: 'escalate_to_human',
    description: 'Hand the conversation to a human when you cannot help (refund/return, defective product, legal, real frustration, or an explicit request for a person). Pauses the bot and notifies the brand.',
    parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  } },
  async handler(args, ctx): Promise<CsToolResult> {
    if (!ctx.chatSessionId || !ctx.accountId) return { ok: false, data: { reason: 'not_bound' } };
    const reason = String(args?.reason || '').slice(0, 200);
    // GATE: pause the bot for this thread, then notify (force=true → skip re-detection, brain already decided).
    const { pauseBot } = await import('@/lib/handoff/bot-pause');            // Phase D (D3)
    await pauseBot(ctx.chatSessionId, `escalate:${reason}`);
    try {
      const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch'); // Phase D (D4)
      await runCsHandoffCheck({ accountId: ctx.accountId, chatSessionId: ctx.chatSessionId, ticketId: ctx.ticketId, waId: ctx.waId, userMessage: reason, force: true });
    } catch (e) { console.warn('[cs-tools] escalation notify failed', e); }
    return { ok: true, escalated: true, data: { handed_off: true } };
  },
};

const TOOLS: CsTool[] = [
  resolveBrandTool, bindBrandTool, lookupOrderTool, lookupOrdersByPhoneTool,
  listOpenThreadsTool, openOrAttachTicketTool, escalateTool, showButtonsTool, showListTool,
];
export function getCsTools(): CsTool[] { return TOOLS; }
export const CS_TOOL_DEFS: OpenAIFunctionDef[] = TOOLS.map((t) => t.def);
