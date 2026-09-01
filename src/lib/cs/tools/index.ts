import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import { identityPhone, ticketSourceFor, CS_TICKET_SOURCES } from '@/lib/cs/identity';
import { realPhoneOrNull, realEmailOrNull, hasContactRoute } from '@/lib/support/contact';
import { verifyEmail } from '@/lib/support/email-deliverability';
import type { CsProductCard, CsTool, CsToolCtx, CsToolResult, OpenAIFunctionDef } from './types';

const TERMINAL_TICKET = new Set(['resolved', 'closed', 'cancelled']);
function phoneVariants(waId: string): string[] {
  const wa = toWaId(waId);
  const local = wa.startsWith('972') ? '0' + wa.slice(3) : wa;
  return Array.from(new Set([waId, wa, local, '+' + wa]));
}

// Returning memory (§6 step #1): account_ids this shopper already engaged (open/closed whatsapp_cs tickets).
async function previouslyEngagedAccountIds(waId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('support_requests').select('account_id').in('source', CS_TICKET_SOURCES).in('customer_phone', phoneVariants(waId));
  return Array.from(new Set(((data as any[]) || []).map((r) => r.account_id).filter(Boolean)));
}

// Open (non-terminal) whatsapp_cs threads for this shopper, newest first, with the brand display name.
export async function openCsThreads(
  waId: string,
  preBoundAccountId?: string | null,
): Promise<Array<{ ticketId: string; brand: string; topic: string; status: string }>> {
  let q = supabaseAdmin
    .from('support_requests').select('id, account_id, status, message, metadata, accounts(config)')
    .in('source', CS_TICKET_SOURCES).in('customer_phone', phoneVariants(waId));
  // On a customer's own number the tenant is fixed by the address, so listing threads from other
  // brands would hand this tenant another's customer relationship. On Bestie's shared number the
  // cross-brand listing IS the feature (adaptive re-entry), so it stays unfiltered there.
  if (preBoundAccountId) q = q.eq('account_id', preBoundAccountId);
  const { data } = await q.order('updated_at', { ascending: false }).limit(10);
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
    description: "Fuzzy-match the shopper's FREE-TEXT brand mention (Hebrew/English/misspelling) against the CS-enabled brands — this is what lets a roster of thousands of brands narrow to a shortlist. Returns ranked candidates. Call BEFORE bind_brand. When there's a clear best match, CONFIRM it in a plain-text sentence (e.g. \"מדובר ב-Argania (argania-oil.co.il)?\") and wait for the shopper's free-text yes/no. When 2+ candidates are close, ASK a clarifying question in prose (e.g. \"יש לי כמה — התכוונת ל-X או ל-Y?\") — NEVER a button/list menu.",
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'the brand name or site the shopper mentioned' } }, required: ['query'] },
  } },
  async handler(args, ctx) {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const preferAccountIds = await previouslyEngagedAccountIds(identityPhone(ctx.identity) ?? ctx.waId);
    const res = await resolveBrand(String(args?.query || ''), { preferAccountIds });
    return { ok: true, data: { kind: res.kind, candidates: res.candidates.map((c) => ({ accountId: c.accountId, name: c.displayName, domain: c.domain, score: c.score })) } };
  },
};

const rememberNameTool: CsTool = {
  def: { type: 'function', function: {
    name: 'remember_name',
    description: "Save the shopper's name the FIRST time they tell you it (any language) so you can greet them by name and never ask again. Call this as soon as you learn it — e.g. they reply \"קוראים לי דנה\" or just \"דנה\". Don't call it if you already know their name.",
    parameters: { type: 'object', properties: { name: { type: 'string', description: "the shopper's name exactly as they gave it" } }, required: ['name'] },
  } },
  async handler(args, _ctx): Promise<CsToolResult> {
    const name = String(args?.name || '').trim();
    if (!name) return { ok: false, data: { reason: 'empty_name' } };
    // The `learnedName` signal is applied by the agent loop (applyLearnedName in cs-agent.ts):
    // it persists to whatsapp_cs_sessions.customer_name + whatsapp_contacts.profile_name, so the
    // name survives across turns and the prompt then instructs Bestie to greet by name.
    return { ok: true, learnedName: name, data: { saved: true, name } };
  },
};

const lookupOrderTool: CsTool = {
  def: { type: 'function', function: {
    name: 'lookup_order',
    description: "Look up ONE order by its number for the bound brand. Phone verification is enforced INSIDE. Returns structured data (kind: found|not_found|unverified|ambiguous|identity_required|escalate) — YOU phrase the reply from it. kind:'identity_required' → ask for the phone number AND order number before retrying; kind:'escalate' → this order can only be handled by a human — call escalate_to_human.",
    parameters: { type: 'object', properties: { orderNumber: { type: 'string' } }, required: ['orderNumber'] },
  } },
  async handler(args, ctx) {
    if (!ctx.accountId) return { ok: false, data: { reason: 'no_brand_bound' } };
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const outcome = await lookupOrder(ctx.accountId, String(args?.orderNumber || ''), ctx.identity);
    return { ok: true, data: outcome };
  },
};

const lookupOrdersByPhoneTool: CsTool = {
  def: { type: 'function', function: {
    name: 'lookup_orders_by_phone',
    description: "Proactively find the shopper's recent orders for the bound brand by their verified/claimed phone (no order number needed). Each order carries its number, status (incl. cancelled/refunded), total, and — for the recent ones — an itemSummary of WHAT'S IN IT; present the contents too, and if an order is cancelled/refunded say so plainly (don't imply it's on the way). kind:'identity_required' → ask for the shopper's phone number first.",
    parameters: { type: 'object', properties: {} },
  } },
  async handler(_args, ctx) {
    if (!ctx.accountId) return { ok: false, data: { reason: 'no_brand_bound' } };
    const { lookupOrdersByPhone } = await import('@/lib/orders/lookup');
    const res = await lookupOrdersByPhone(ctx.accountId, ctx.identity);
    if (res.kind === 'identity_required') return { ok: true, data: { kind: 'identity_required' } };
    return { ok: true, data: { orders: res.orders.map((o) => ({ orderNumber: o.orderNumber, status: o.status, total: o.total, itemSummary: o.itemSummary, trackingUrl: o.trackingUrls?.[0] })) } };
  },
};

const listOpenThreadsTool: CsTool = {
  def: { type: 'function', function: {
    name: 'list_open_threads',
    description: "List the shopper's open support threads (across brands) so you can offer to continue one (adaptive re-entry).",
    parameters: { type: 'object', properties: {} },
  } },
  async handler(_args, ctx) {
    return { ok: true, data: { threads: await openCsThreads(identityPhone(ctx.identity) ?? ctx.waId, ctx.preBoundAccountId ?? null) } };
  },
};

const bindBrandTool: CsTool = {
  def: { type: 'function', function: {
    name: 'bind_brand',
    description: 'Bind the conversation to a brand AFTER the shopper confirms in free text (e.g. replies "כן"/"נכון" to your prose confirmation) — never call this before a confirmation. Validates the brand is CS-enabled, opens/attaches its support ticket, and scopes ALL later reads to it.',
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
    try { ticketId = (await openOrAttachCsTicket({ accountId, waId: ctx.waId, customerPhone: identityPhone(ctx.identity), customerName: ctx.customerName, source: ticketSourceFor(ctx.identity) })).ticketId; }
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
    const t = await openOrAttachCsTicket({ accountId: ctx.accountId, waId: ctx.waId, customerPhone: identityPhone(ctx.identity), customerName: ctx.customerName, topic: args?.topic, source: ticketSourceFor(ctx.identity) });
    return { ok: true, bind: { accountId: ctx.accountId, ticketId: t.ticketId }, data: { ticketId: t.ticketId } };
  },
};

// A shopper on the widget / chat page arrives anonymous: the channel carries no phone, so an
// escalation used to produce a ticket the brand literally could not answer (the visitor id was
// stored in customer_phone and every send died at Meta). This is how the number gets in.
const rememberContactTool: CsTool = {
  def: { type: 'function', function: {
    name: 'remember_contact',
    description: "Save how a human can get back to this shopper — a phone number, an email address, or both — the moment they give it. Required BEFORE escalate_to_human on this channel: a hand-off with no contact details reaches nobody. Ask plainly (\"לאיזה מספר או מייל שנחזור אלייך?\") once you know a human is needed.",
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'phone number exactly as the shopper gave it' },
        email: { type: 'string', description: 'email address exactly as the shopper gave it' },
      },
    },
  } },
  async handler(args, ctx): Promise<CsToolResult> {
    const phone = realPhoneOrNull(args?.phone);
    // Shape is not enough: gmail.com.il satisfies realEmailOrNull and has no mail server.
    // Verified here rather than at reply time, because by reply time the conversation is
    // over and the bounce lands in a mailbox nobody reads.
    const emailVerdict = await verifyEmail(args?.email);
    const email = emailVerdict.status === 'undeliverable'
      ? null
      : realEmailOrNull(emailVerdict.email);
    // Reject rather than store something undialable/unmailable — the agent would see contact
    // details that don't work and only find out when the reply bounces.
    if (!phone && !email) {
      // A dead domain gets its own answer: the shopper can fix a typo she can see, but
      // "invalid_contact" gives her nothing to act on.
      if (args?.email && emailVerdict.status === 'undeliverable' && emailVerdict.reason === 'no_mx') {
        return {
          ok: false,
          data: {
            reason: 'undeliverable_email',
            hint: emailVerdict.suggestion
              ? `the domain does not exist — ask whether she meant ${emailVerdict.suggestion}`
              : 'the domain does not exist — ask her to read the address again',
            suggestion: emailVerdict.suggestion ?? null,
          },
        };
      }
      return { ok: false, data: { reason: 'invalid_contact', hint: 'ask for a full phone number or a valid email address' } };
    }
    // Write straight through to the open ticket so the support inbox becomes actionable NOW,
    // not only if the conversation later escalates.
    if (ctx.ticketId && ctx.accountId) {
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (phone) patch.customer_phone = phone;
      if (email) patch.customer_email = email;
      await supabaseAdmin
        .from('support_requests')
        .update(patch)
        .eq('id', ctx.ticketId)
        .eq('account_id', ctx.accountId);
    }
    return {
      ok: true,
      ...(phone ? { learnedPhone: phone } : {}),
      ...(email ? { learnedEmail: email } : {}),
      data: { saved: true, phone, email },
    };
  },
};

const escalateTool: CsTool = {
  def: { type: 'function', function: {
    name: 'escalate_to_human',
    description: 'Hand the conversation to a human when you cannot help (refund/return, defective product, legal, real frustration, or an explicit request for a person). Pauses the bot and notifies the brand.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        contact_refused: {
          type: 'boolean',
          description: 'Set true ONLY after you asked for a phone or email and the shopper declined or ignored the request. Never set it without having asked.',
        },
      },
      required: ['reason'],
    },
  } },
  async handler(args, ctx): Promise<CsToolResult> {
    if (!ctx.chatSessionId || !ctx.accountId) return { ok: false, data: { reason: 'not_bound' } };
    const reason = String(args?.reason || '').slice(0, 200);

    // THE GATE. On a channel that carries no contact details, handing off without any means a
    // ticket the brand cannot answer and a shopper promised a callback nobody can make — the
    // exact failure Adi hit. A prompt line asking nicely is not enough, so this is mechanical.
    //
    // It blocks ONCE. If the shopper was already asked (previous turn) and still gave nothing, or
    // the model reports they refused, the escalation goes through anyway: leaving an angry person
    // trapped with a bot is worse than a ticket with no phone, as long as the brand can SEE that
    // there is no way to reply.
    const channelCarriesContact = ctx.identity.channel === 'whatsapp';
    const known = hasContactRoute({ phone: identityPhone(ctx.identity), email: ctx.contactEmail });
    const refused = args?.contact_refused === true;
    if (!channelCarriesContact && !known && !refused && !ctx.contactAsked) {
      return {
        ok: false,
        contactAsked: true, // remembered on the session, so this can never block twice
        data: {
          reason: 'contact_required',
          hint: 'Ask the shopper for a phone number or email so a human can get back to them, then call remember_contact. If they refuse or ignore it, call escalate_to_human again with contact_refused: true.',
        },
      };
    }
    // Notify FIRST (force=true → skip re-detection, brain already decided), THEN decide whether to pause.
    let outcome: any = null;
    try {
      const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch'); // Phase D (D4)
      outcome = await runCsHandoffCheck({ accountId: ctx.accountId, chatSessionId: ctx.chatSessionId, ticketId: ctx.ticketId, waId: ctx.waId, contactPhone: identityPhone(ctx.identity), contactEmail: ctx.contactEmail, userMessage: reason, customerName: ctx.customerName, imageUrl: ctx.lastImageUrl, force: true });
    } catch (e) { console.warn('[cs-tools] escalation notify failed', e); }
    // Pause UNLESS escalation is switched off for this brand. If it's off (skipped disabled/flag_off) no
    // human is coming, so pausing would drop the shopper into silence — keep the bot answering instead.
    // On success, error, or dedup we prefer to pause (fail-closed: an escalation must not reach the bot).
    const disabled = outcome?.skipped === 'disabled' || outcome?.skipped === 'flag_off';
    if (disabled) return { ok: true, data: { handed_off: false, reason: 'handoff_disabled' } };
    const { pauseBot } = await import('@/lib/handoff/bot-pause');            // Phase D (D3)
    await pauseBot(ctx.chatSessionId, `escalate:${reason}`);
    return { ok: true, escalated: true, data: { handed_off: true } };
  },
};

// ---------------------------------------------------------------------------
// Product cards (WhatsApp parity with the widget's product cards).
//
// TWO tools on purpose: search_products finds candidates and hands the model a URL-FREE list,
// then the model decides in prose and calls show_products with the refs it actually featured.
// Splitting them is what keeps the prose and the cards in sync — the model can talk about two
// products and card exactly those two, instead of us guessing from a top-N.
// ---------------------------------------------------------------------------
const MAX_CARDS = 3;

// Per-brand opt-in. OFF unless explicitly enabled, so switching a brand's cards off is one
// config edit and never a deploy (mirrors config.support.auto_ticket_enabled).
async function productsEnabled(accountId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).single();
  return (data as any)?.config?.whatsapp_cs?.products_enabled === true;
}

// Both product tools share the same two gates; neither may run before a brand is bound
// (an unbound search would have no account to scope to and could surface a rival's catalog).
async function productGate(ctx: CsToolCtx): Promise<CsToolResult | null> {
  if (!ctx.accountId) return { ok: false, data: { reason: 'no_brand_bound' } };
  if (!(await productsEnabled(ctx.accountId))) return { ok: false, data: { reason: 'products_disabled' } };
  return null;
}

const searchProductsTool: CsTool = {
  def: { type: 'function', function: {
    name: 'search_products',
    description: "Find products from the bound brand's catalog that fit what the shopper described (a need, a use, a budget, or a product they named). Returns a short candidate list with a `ref` for each. Call this when the shopper asks what suits them, asks about a product, or asks what you sell — NOT during a complaint, a damaged-delivery report, or any escalation. After you get the list, write your recommendation in prose and call show_products with the refs you actually featured.",
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: "what the shopper is looking for, in their own words (e.g. 'שיער יבש ומתולתל')" },
      limit: { type: 'number', description: 'how many candidates to consider (1-8, default 5)' },
    }, required: ['query'] },
  } },
  async handler(args, ctx): Promise<CsToolResult> {
    const gated = await productGate(ctx);
    if (gated) return gated;
    const query = String(args?.query || '').trim();
    if (!query) return { ok: false, data: { reason: 'empty_query' } };
    const limit = Math.min(8, Math.max(1, Number(args?.limit) || 5));

    const { getRecommendations, isValidProductUrl } = await import('@/lib/recommendations/engine');
    let products: any[] = [];
    try {
      const res = await getRecommendations({
        accountId: ctx.accountId!,
        sessionId: ctx.chatSessionId ?? undefined,
        conversationContext: query,
        maxResults: limit,
        strategy: 'auto',
      });
      products = res.products || [];
    } catch (e) {
      console.warn('[cs-tools] getRecommendations failed', e);
      return { ok: false, data: { reason: 'search_failed' } };
    }

    // A card needs BOTH a real detail page and an image. The engine already drops category URLs,
    // but re-check here so an unsendable product never becomes a ref the model can feature.
    // `why` is carried alongside its own product — reading it back by index would mis-pair it
    // with a neighbour as soon as anything above it is filtered out.
    const kept = products
      .filter((p) => p?.imageUrl && isValidProductUrl(p?.productUrl) && String(p?.nameHe || p?.name || '').trim())
      .map((p) => ({
        card: {
          productId: p.id,
          name: String(p.nameHe || p.name).trim(),
          price: typeof p.price === 'number' ? p.price : null,
          originalPrice: typeof p.originalPrice === 'number' ? p.originalPrice : null,
          isOnSale: p.isOnSale === true,
          productUrl: p.productUrl,
          imageUrl: p.imageUrl,
        } as CsProductCard,
        why: p.recommendedFor || p.aiWhy || undefined,
      }));

    ctx.productCandidates = kept.map((k) => k.card);
    if (!kept.length) return { ok: true, data: { products: [], note: 'no_matching_products' } };

    // URL-free by design: the model never sees productUrl/imageUrl, so it cannot paste a raw link
    // into the prose — the card carries the link. It also keeps the tool result small.
    return { ok: true, data: {
      products: kept.map(({ card, why }, i) => ({
        ref: `p${i + 1}`,
        name: card.name,
        price: card.price,
        ...(card.isOnSale && card.originalPrice ? { originalPrice: card.originalPrice, onSale: true } : {}),
        why,
      })),
    } };
  },
};

const showProductsTool: CsTool = {
  def: { type: 'function', function: {
    name: 'show_products',
    description: `Send the shopper a visual card (photo + name + price + a button linking straight to the product page) for up to ${MAX_CARDS} products you just recommended. Pass the refs from search_products — only refs from THIS turn are valid. Call it in the same turn as your prose, and mention those products by name in the prose so the text and the cards match. Never write the product URL yourself; the card carries it.`,
    parameters: { type: 'object', properties: {
      refs: { type: 'array', items: { type: 'string' }, description: `refs from search_products, e.g. ["p1","p3"] — max ${MAX_CARDS}` },
    }, required: ['refs'] },
  } },
  async handler(args, ctx): Promise<CsToolResult> {
    const gated = await productGate(ctx);
    if (gated) return gated;
    const candidates = ctx.productCandidates || [];
    if (!candidates.length) return { ok: false, data: { reason: 'call_search_products_first' } };

    const refs = Array.isArray(args?.refs) ? args.refs.map((r: any) => String(r).trim().toLowerCase()) : [];
    const picked: CsProductCard[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
      const idx = Number(ref.replace(/^p/, '')) - 1;
      const c = candidates[idx];
      if (!c || seen.has(c.productId)) continue;   // unknown/duplicate refs are dropped, not fatal
      seen.add(c.productId);
      picked.push(c);
      if (picked.length >= MAX_CARDS) break;       // WhatsApp has no multi-card message; each card is
    }                                              // its own send, so a hard cap keeps the thread sane.
    if (!picked.length) return { ok: false, data: { reason: 'no_matching_refs' } };

    return { ok: true, cards: picked, data: { sent: picked.map((p) => ({ name: p.name, price: p.price })) } };
  },
};

// NO menu/widget tools here by design — Bestie CS must scale to ~10,000 brands, where a
// list/buttons menu for brand selection is absurd. Disambiguation happens in prose
// (resolve_brand → confirm/clarify in plain text), never via show_buttons/show_list.
const TOOLS: CsTool[] = [
  resolveBrandTool, bindBrandTool, rememberNameTool, lookupOrderTool, lookupOrdersByPhoneTool,
  listOpenThreadsTool, openOrAttachTicketTool, rememberContactTool, escalateTool,
  searchProductsTool, showProductsTool,
];
export function getCsTools(): CsTool[] { return TOOLS; }
export const CS_TOOL_DEFS: OpenAIFunctionDef[] = TOOLS.map((t) => t.def);
