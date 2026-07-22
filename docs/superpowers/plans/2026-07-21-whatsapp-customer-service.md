# WhatsApp Customer Service (Bestie CS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-tenant WhatsApp customer-service bot on the shared Bestie number, first brand Argania (QuickShop) — brand routing, unified order lookup, product/RAG answers, shipping status, tickets, and human handoff.

**Architecture:** A 4th unknown-sender branch in the existing WhatsApp webhook feeds a Redis/QStash CS worker that runs the **brain-led tool-calling loop** (Bestie's LLM leads the conversation in its own voice; deterministic work + security gates live inside the tools — NOT a scripted FSM). Orders resolve through an internal brand_orders store fed by per-platform connectors (QuickShop pull+webhook now, Shopify later). Handoff reuses the approved bot-pause model.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Supabase/Postgres (+ pg_trgm), Upstash Redis, QStash, Meta WhatsApp Cloud API, Vitest.

## Global Constraints

- MIGRATIONS: next number is 067 (current max is 066_agent_wa_recent_turns.sql). Allocate 067→whatsapp_cs_sessions, 068→brand_orders, 069→chat_sessions bot_paused. Idempotent DDL only (create table if not exists / add column if not exists / create index if not exists), each opens with a `-- Migration NNN:` comment. Do NOT reuse the duplicated 053-059 numbers. There is NO supabase CLI/config.toml/db-push in-repo: commit the .sql AND apply to prod via the Supabase MCP apply_migration tool (named migration). Never write `supabase migration up`.
- SERVICE-ROLE CLIENT: server code imports `import { supabase as supabaseAdmin } from '@/lib/supabase'` (bypasses RLS). Reuse it; do not construct a new createClient. Webhook + worker + brand_orders + cs-ticket paths all use the service-role client. chat_sessions.id is a UUID column → use randomUUID() for new sessions.
- READ-ONLY BOT (D5): the CS bot performs NO store writes. Never call QuickShop PATCH /orders, /edit-items, /fulfill, /cancel or any Shopify write. Only pull/list/webhook-ingest. Writes are a human's job via handoff.
- SECRETS live in accounts.config (config.integrations.quickshop.api_key, .webhook_secret, config.integrations.shopify.admin_api_token). Write-only from admin UI, masked on read, NEVER committed to git. Rotate the Argania qs_live_ key after wiring (it was live during design). Remaining brand secrets go straight into config, not chat.
- PROVISIONING (v1, manual — consistent with the §2 "manual provisioning" non-goal): the CS-enablement blocks `config.whatsapp_cs.{enabled, aliases, order_source, greeting}`, `config.shipment_provider`, and `config.escalation.{recipients, triggers, lowConfidenceThreshold, enabled}` are set per-account by **manual SQL / a Supabase console update** for v1 — there is no admin UI/endpoint for them (only Task B9 exposes write paths for `config.integrations.quickshop/shopify` tokens). Enabling a brand for CS = one SQL update setting `config.whatsapp_cs.enabled=true` (+ recipients). A dedicated admin surface for these blocks is a deliberate post-v1 follow-up, not a gap.
- META 24h WINDOW: CS conversations are customer-initiated, so in-window replies are free-form sendText / interactive messages. Re-engaging a shopper after 24h requires an approved template. Brand-facing escalation notifications use approved templates.
- QUICKSHOP RATE LIMIT 100 req/min per key: backfill must honor X-RateLimit-Remaining/X-RateLimit-Reset with backoff; live lookup is exactly one GET /orders/{id} per shopper request. QuickShop has NO working server-side order_number filter → number→id resolution MUST go through brand_orders.
- PHONE VERIFY is best-effort (§8, D4): when the resolved order carries a phone, require it to match the WhatsApp sender via toWaId normalization (tolerant 0↔+972); mismatch → return {kind:'unverified'}, do NOT reveal, offer handoff. When the order has no phone → reveal without verification. No email step. Proactively find orders by sender phone when possible.
- pg_trgm IS installed (confirmed live). Brand resolution is scoped to CS-enabled brands ONLY (accounts where config.whatsapp_cs.enabled=true) — a small set. Fuzzy match may use pg_trgm similarity() over the small set or an in-app matcher; never scan all 10k accounts.
- SUPPORT_REQUESTS HAS NO `channel` OR `topic` COLUMN (verified live). The spec's channel='whatsapp_cs' maps to the existing `source` text column: CS tickets use source='whatsapp_cs' (optionally mirror channel:'whatsapp_cs' inside metadata jsonb). support_ticket_history.actor is free-text (agent display_name for human rows), not an enum. Terminal statuses: resolved/closed/cancelled.
- QSTASH deduplicationId MUST NOT contain ':' (QStash rejects it) — use '_'/'-' separators. Redis keys MAY contain ':' (cs:wa:<waId>:q, cs:wa:<waId>:lock, cs:wa:<wamid>:queued, cs:wa:<wamid>:done). Publish-with-retry 3x; force drains use unique cs id (cs_drain_<waId>_f_<ts>). A requeue (attempt>0) must append _a<attempt> to the dedup id.
- QUEUE/WORKER invariants (mirror the CRM engine): per-waId FIFO (RPUSH ingest, LPOP-1 drain, strict arrival order); single-drainer SETNX mutex; lock TTL 300s >= worker maxDuration 300s; DRAIN_BUDGET_MS=230s then release+continuation; reply sent BEFORE the done-guard SETNX (crash re-processes, no lost reply); send-with-retry 3x (Meta can return success:false without throwing); drain loop swallows per-item errors (dedup+done guards are the backstop).
- WEBHOOK SECURITY: HMAC-SHA256 verify the QuickShop X-Webhook-Signature (format 'sha256=<hex>') against the RAW body before JSON.parse, using timingSafeEqual over equal-length buffers (mirror src/app/api/webhooks/shipping/[accountToken]/route.ts). Resolve the brand by the accountToken in the path (config JSONB token equality). Bad token → 404 (not 200); invalid signature → 401; no secret configured → skip; otherwise always 200.
- ACCOUNT_ID SCOPING: every brand_orders, RAG, chatbot_persona, and support_request query is scoped by account_id. Brand-confirm step precedes any binding; phone verification precedes any order reveal — to prevent wrong-brand data leakage.
- BRAIN OUTPUT: SandwichBotOutput.response ALWAYS ends with a <<SUGGESTIONS>> envelope — stripSuggestions is MANDATORY before sending to WhatsApp. mode:'whatsapp' behaves like 'dm' for RAG enrichment; running the widget-only strips (Intent/Action/Products) is harmless but only stripSuggestions is required. Persist user+assistant rows to chat_messages exactly like the widget; feed responseId back as previousResponseId.
- TESTS: Vitest (jsdom, globals, alias @→./src, setup tests/setup.ts where global.fetch is already a vi.fn()). Run a file with `npx vitest run tests/unit/<file>.test.ts`. Declare vi.mock() at top level BEFORE `await import()` of the SUT; prefer dependency injection or hand-rolled chainable Supabase fakes. tsconfig strict:false and build ignores TS errors → run `npm run type-check` separately.
- COMMIT DISCIPLINE (project rule): commit fixes straight to main + push, no branch/PR; stage only the feature's files.

## Shared Interface Contract

```ts
// ============================================================================
// BESTIE CS — SHARED INTERFACE CONTRACT (TypeScript)
// Every implementation task MUST conform to these definitions verbatim.
// Reused DTOs (do NOT redefine): OrderLookupResult (src/lib/shopify/order-lookup.ts:22),
// FocusCustomerStatusView (src/lib/shipment/focus-client.ts:25),
// SandwichBotInput/Output (src/lib/chatbot/sandwichBot.ts:42/81).
// ============================================================================

// ---------------------------------------------------------------------------
// 1. ORDER LAYER — canonical normalized shape (src/lib/orders/connectors/types.ts)
// ---------------------------------------------------------------------------
export type StorePlatform = 'quickshop' | 'shopify' | 'woocommerce' | 'magento';

export interface NormalizedLineItem {
  name: string;
  sku: string | null;
  quantity: number;
  price: string | null;      // per-unit, string-formatted (mirror Shopify DTO style)
  total: string | null;      // line total
  imageUrl: string | null;
}

export interface NormalizedOrder {
  orderNumber: string;                 // human-facing (# stripped), used as brand_orders.order_number
  externalId: string;                  // platform primary id (QuickShop {id}); brand_orders.external_id
  status: string | null;              // platform 'status'
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  lineItems: NormalizedLineItem[];    // [] when summary-only (list/backfill)
  trackingNumber: string | null;
  trackingUrl: string | null;
  total: string | null;               // string-formatted, e.g. "₪199.00" or "199.00"
  currency: string | null;
  placedAt: string | null;            // ISO timestamp
  raw: unknown;                        // untouched platform payload → brand_orders.raw
}

// Per-account credentials handed to a connector. Sourced from accounts.config.integrations.<platform>.
export interface OrderConnectorCreds {
  platform: StorePlatform;
  apiKey?: string;         // QuickShop qs_live_… (auto-identifies shop)
  shopDomain?: string;     // Shopify mystore.myshopify.com
  adminApiToken?: string;  // Shopify shpat_… (CANONICAL key name — see globalConstraints)
  webhookSecret?: string;  // HMAC secret for inbound order webhook
  [k: string]: unknown;
}

export interface OrderConnector {
  platform: StorePlatform;
  installMode: 'manual_token' | 'oauth' | 'platform_partner' | 'snippet';
  supportsDirectLookup: boolean; // Shopify true (by order name); QuickShop false → must go via brand_orders
  // Fetch ONE order fresh (full detail incl. line items). ref.id preferred; orderNumber fallback.
  pull(creds: OrderConnectorCreds, ref: { id?: string; orderNumber?: string }): Promise<NormalizedOrder | null>;
  // Backfill/sync paging. Present on QuickShop; absent on Shopify (direct lookup).
  list?(creds: OrderConnectorCreds, cursor?: string): Promise<{ orders: NormalizedOrder[]; next?: string }>;
  // Push feeders — map an inbound webhook body → NormalizedOrder.
  normalizeWebhook?(payload: unknown): NormalizedOrder;
  // Optional programmatic webhook registration (needs webhooks:write scope).
  registerWebhooks?(creds: OrderConnectorCreds, url: string, secret: string): Promise<void>;
}

// Registry — keyed by platform. src/lib/orders/connectors/registry.ts
export function getConnector(platform: StorePlatform): OrderConnector; // throws on unknown platform

// ---------------------------------------------------------------------------
// 2. QuickShop wire types (src/lib/orders/connectors/quickshop.ts) — Appendix A verbatim
// ---------------------------------------------------------------------------
export interface QuickShopPagination {
  page: number; limit: number; total: number; total_pages: number; has_next: boolean; has_prev: boolean;
}
export interface QuickShopListResponse<T> { data: T[]; meta: { pagination: QuickShopPagination }; }

// GET /orders — summary only, NO line_items
export interface QuickShopOrderSummary {
  id: string; order_number: string;
  customer_name?: string | null; customer_email?: string | null; customer_phone?: string | null;
  financial_status?: string | null; fulfillment_status?: string | null; status?: string | null;
  total?: string | number | null; currency?: string | null; created_at?: string | null;
}
export interface QuickShopLineItem {
  id: string; name: string; sku?: string | null; quantity: number;
  price?: string | number | null; total?: string | number | null;
  image_url?: string | null; product_id?: string | null; variant_title?: string | null;
  properties?: { addons?: unknown; bundleComponents?: unknown; addonTotal?: unknown } | null;
}
// GET /orders/{id} — full detail
export interface QuickShopOrderDetail extends QuickShopOrderSummary {
  customer_id?: string | null;
  line_items: QuickShopLineItem[];
  tracking_number?: string | null; tracking_url?: string | null;
  payment_method?: string | null; paid_at?: string | null;
  shipping_method?: string | null; shipping_amount?: string | number | null;
  subtotal?: string | number | null; tax_amount?: string | number | null;
  discount_amount?: string | number | null; discount_code?: string | null;
  billing_address?: Record<string, unknown> & { phone?: string | null };
  shipping_address?: Record<string, unknown> & { phone?: string | null };
  updated_at?: string | null; note?: string | null;
}
// Webhook delivery body — TOP field is `event`
export interface QuickShopWebhookBody {
  event: string;      // 'order.created' | 'order.updated' | 'order.fulfilled' | ...
  timestamp: string;
  data: QuickShopOrderDetail; // order webhooks carry a detail-shaped payload
}

// ---------------------------------------------------------------------------
// 3. lookupOrder facade (src/lib/orders/lookup.ts)
// ---------------------------------------------------------------------------
// Success returns the SANITIZED, customer-safe OrderLookupResult (reuse the existing DTO shape).
export type OrderLookupOutcome =
  | (OrderLookupResultLike & { kind: 'found' })   // `kind` is the discriminator; the REAL order status lives on OrderLookupResultLike.status
  | { kind: 'not_found' }
  | { kind: 'ambiguous' }
  | { kind: 'unverified' };  // phone present on order but did not match sender

// Structural mirror of src/lib/shopify/order-lookup.ts:22 OrderLookupResult — DO NOT redefine there,
// import the real type. Repeated here so parallel authors know the field set.
export interface OrderLookupResultLike {
  found: boolean;
  orderNumber?: string;
  status?: string;
  placedAt?: string;
  total?: string;
  itemSummary?: string;
  trackingUrls?: string[];
  trackingNumbers?: string[];
  shippedAt?: string | null;
  deliveredAt?: string | null;
  // CS additions (safe to render): line items + optional Focus shipment view.
  lineItems?: NormalizedLineItem[];
  shipment?: FocusCustomerStatusViewLike | null;
}
// Mirror of src/lib/shipment/focus-client.ts:25 — import the real FocusCustomerStatusView.
export interface FocusCustomerStatusViewLike {
  found: boolean; shipmentNumber: string | null; statusText: string;
  isDelivered: boolean; isCanceled: boolean; isReturned: boolean;
  lastUpdate: { date: string | null; time: string | null };
  destinationBranch: string | null; shipmentDirection: string | null;
  history: Array<{ desc: string; date: string | null; time: string | null }>;
  errorMessage: string | null; provider: 'focus';
}

// The facade. senderPhone is the raw WhatsApp wa_id (E.164 digits).
export function lookupOrder(
  accountId: string,
  orderNumber: string,
  senderPhone: string,
): Promise<OrderLookupOutcome>;

// Proactive-by-phone variant (§8 — "find the order by sender phone so shopper need not type a number").
export function lookupOrdersByPhone(
  accountId: string,
  senderPhone: string,
): Promise<OrderLookupResultLike[]>;

// Best-effort phone verification (src/lib/orders/phone-verify.ts). Tolerant of 0↔+972 via toWaId.
export function phoneMatches(orderPhone: string | null | undefined, senderWaId: string): boolean;

// ---------------------------------------------------------------------------
// 4. brand_orders store helpers (src/lib/orders/brand-orders.ts)
// ---------------------------------------------------------------------------
export interface BrandOrderRow {
  id: string;                       // uuid pk
  account_id: string;               // uuid, scoping key — EVERY query filters on this
  external_id: string | null;
  order_number: string;             // NOT NULL in brand_orders — connectors always supply it (keeps the unique upsert idempotent)
  customer_phone: string | null;
  customer_email: string | null;
  customer_name: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  status: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  total: string | null;
  currency: string | null;
  line_items: NormalizedLineItem[] | null; // jsonb, nullable (lazy-filled on live pull)
  placed_at: string | null;
  source_platform: StorePlatform | null;
  raw: unknown;                     // jsonb
  created_at: string;
  updated_at: string;
}
// Upsert on conflict (account_id, order_number). summary=true skips line_items.
export function upsertBrandOrder(accountId: string, order: NormalizedOrder, platform: StorePlatform): Promise<void>;
export function upsertBrandOrders(accountId: string, orders: NormalizedOrder[], platform: StorePlatform): Promise<number>;
export function findBrandOrderByNumber(accountId: string, orderNumber: string): Promise<BrandOrderRow | null>;
export function findBrandOrdersByPhone(accountId: string, senderWaId: string): Promise<BrandOrderRow[]>;

// ---------------------------------------------------------------------------
// 5. CS lightweight state (src/lib/cs/cs-session.ts) — table whatsapp_cs_sessions (§10.1)
//    NOT an FSM. Only the state the brain-led tool loop needs between turns.
// ---------------------------------------------------------------------------
// `phase` is a COARSE ANALYTICS HINT ONLY — it does NOT gate the brain. The brain decides
// everything from the injected context digest; phase just records "still onboarding" vs "serving".
export type CsPhase = 'onboarding' | 'serving';

export interface CsSessionRow {
  wa_id: string;                          // text pk (E.164 digits)
  contact_id: string | null;              // uuid → whatsapp_contacts.id
  phase: CsPhase;                         // analytics hint only (onboarding|serving); does NOT gate
  active_account_id: string | null;       // currently bound brand
  active_ticket_id: string | null;        // → support_requests.id (current thread)
  active_chat_session_id: string | null;  // → chat_sessions.id (brain history + bot_paused)
  customer_name: string | null;           // learned once
  context: CsSessionContext;              // jsonb scratch (last order ref, pending candidates, etc.)
  last_activity_at: string;               // warm(<45m)/cold re-entry signal
  version: number;                        // optimistic lock (mirror crm_agent_wa_state)
  created_at: string;
  updated_at: string;
}
export interface CsSessionContext {
  lastOrderRef?: string;                     // last order number the shopper referenced
  lastBrandCandidates?: BrandCandidate[];    // last resolve_brand result (brain scratch)
  [k: string]: unknown;
}
export function loadCsSession(waId: string): Promise<CsSessionRow | null>;
export function createCsSession(waId: string, contactId: string | null): Promise<CsSessionRow>;
// Optimistic-concurrency update (WHERE version = row.version, bump version). Returns false on conflict.
export function saveCsSession(prev: CsSessionRow, patch: Partial<CsSessionRow>): Promise<boolean>;
export const WARM_WINDOW_MS = 45 * 60 * 1000;
export function isWarm(row: CsSessionRow, now?: number): boolean;

// ---------------------------------------------------------------------------
// 6. Brand resolver (src/lib/cs/brand-resolver.ts)
// ---------------------------------------------------------------------------
export interface BrandCandidate {
  accountId: string;
  displayName: string;
  username: string;
  domain: string | null;
  score: number;      // 0..1 fuzzy similarity (pg_trgm or in-app)
}
// Resolvable set = accounts WHERE config.whatsapp_cs.enabled = true ONLY.
export interface BrandResolution {
  kind: 'none' | 'single' | 'multi';
  candidates: BrandCandidate[]; // [] | [one] | [top N]
}
export function resolveBrand(query: string, opts?: { preferAccountIds?: string[] }): Promise<BrandResolution>;
export function listCsEnabledBrands(): Promise<BrandCandidate[]>; // vocabulary source

// ---------------------------------------------------------------------------
// 7. CS queue / worker (cs: namespace — mirror src/lib/crm/wa-*; parameterized copies)
// ---------------------------------------------------------------------------
export interface CsJob {
  waId: string;
  msg: any;                 // raw inbound WhatsApp message object
  textBody: string | null;  // pre-extracted (text/button/interactive title)
  contactId?: string | null;
  attempt?: number;
}
// src/lib/cs/wa-cs-queue.ts — Redis FIFO. Keys use ':' (Redis-safe): cs:wa:<waId>:q
export function enqueueCsMessage(job: CsJob): Promise<{ enqueued: boolean; queueLen: number }>;
export function dequeueCsMessage(waId: string): Promise<CsJob | null>;
export function csQueueLength(waId: string): Promise<number>;
// src/lib/cs/wa-cs-locks.ts
export function acquireCsLock(waId: string, ttlSeconds?: number): Promise<boolean>; // key cs:wa:<waId>:lock, TTL 300
export function releaseCsLock(waId: string): Promise<void>;
// src/lib/cs/wa-cs-publish.ts — QStash. deduplicationId MUST be colon-free ('_'/'-').
export function publishCsDrain(waId: string, opts?: { force?: boolean }): Promise<void>;
// src/lib/cs/wa-cs-worker.ts
export function runCsDrain(waId: string): Promise<{ status: string; processed: number }>;
export function processOneCsInbound(job: CsJob): Promise<string | null>;

// ---------------------------------------------------------------------------
// 8. CS agent — brain-led tool-calling loop (src/lib/cs/cs-agent.ts) + CS tools (src/lib/cs/tools/*)
//    The brain LEADS the whole conversation in its own voice; deterministic work + security GATES
//    live inside the tools. There is NO scripted FSM.
// ---------------------------------------------------------------------------
// The producer 4th branch (called from webhook route.ts after the routeInboundToTicket guard).
// Returns claimed=true if it claimed the message (reaction+typing, enqueue, publishCsDrain).
export function routeInboundToCustomerService(input: {
  waId: string;
  contactId: string | null;
  msg: any;
  textBody: string | null;
}): Promise<{ claimed: boolean }>;

// A WhatsApp interactive reply a tool can emit (rendered by the worker / returned as the turn reply).
export type WaInteractive =
  | { kind: 'buttons'; body: string; buttons: InteractiveButton[]; header?: string; footer?: string }
  | { kind: 'list'; body: string; buttonLabel: string; sections: InteractiveSection[]; header?: string; footer?: string };

// Structural mirror of the OpenAI chat-completions function-tool schema (avoid a hard SDK type dep).
export interface OpenAIFunctionDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

// Per-turn tool execution context. Handlers READ + SCOPE on it; the loop APPLIES the returned
// side-effect signals to ctx + whatsapp_cs_sessions after each call (src/lib/cs/tools/types.ts).
export interface CsToolCtx {
  waId: string;
  accountId: string | null;        // bound brand (null until bind_brand); scopes EVERY read
  chatSessionId: string | null;    // brain history + bot_paused
  ticketId: string | null;         // current support_request thread
  customerName: string | null;     // learned once
  senderPhone: string;             // = waId (E.164); used by phone-verify + proactive lookup
}
// Uniform result every handler returns.
export interface CsToolResult {
  ok: boolean;
  data?: unknown;                  // structured payload fed back to the model as the tool result
  bind?: { accountId: string; ticketId?: string | null }; // bind_brand → loop sets ctx.accountId + chat_session + ticket + phase='serving'
  learnedName?: string;            // brain-learned name → loop persists to whatsapp_contacts + ctx
  interactive?: WaInteractive;     // show_buttons/show_list → becomes the turn reply (short-circuit)
  escalated?: boolean;             // escalate_to_human → loop returns { kind:'none' } (bot paused)
}
// One OpenAI function definition + its handler. Each handler enforces its OWN code-level gate.
export interface CsTool {
  def: OpenAIFunctionDef;
  handler(args: any, ctx: CsToolCtx): Promise<CsToolResult>;
}
// The tool set (src/lib/cs/tools/index.ts). Gate per handler noted:
//   resolve_brand(query)            → fuzzy over CS-enabled brands ONLY; preferAccountIds from memory
//   bind_brand(accountId)           → GATE: validates config.whatsapp_cs.enabled; opens/attaches ticket; binds chat_session
//   lookup_order(orderNumber)       → GATE: phone-verify INSIDE (best-effort §8); account_id-scoped → OrderLookupOutcome
//   lookup_orders_by_phone()        → proactive by senderPhone; account_id-scoped
//   list_open_threads()             → the shopper's open whatsapp_cs tickets (re-entry digest)
//   open_or_attach_ticket(topic)    → ensures ctx.ticketId
//   escalate_to_human(reason)       → GATE: sets bot_paused + notifies config.escalation.recipients
//   show_buttons(body, buttons[])   → WA interactive reply (≤3 buttons)
//   show_list(body, sections[])     → WA interactive list reply (≤10 rows)
export function getCsTools(): CsTool[];
export const CS_TOOL_DEFS: OpenAIFunctionDef[]; // = getCsTools().map(t => t.def)

// The single CS turn — the brain-led tool-calling loop (src/lib/cs/cs-agent.ts). Loads lightweight
// state, guards on isBotPaused, runs the detectHandoff code backstop, builds the brand-grounded
// system prompt (persona + RAG + name/brand/open-threads/warm-cold digest), runs the tool loop
// (cap ~5 iterations), applies side-effects to whatsapp_cs_sessions, persists chat_messages, strips
// <<SUGGESTIONS>>, and returns the reply. `reply.kind:'none'` = paused / already handled.
export interface CsTurnResult {
  reply:
    | { kind: 'text'; body: string }
    | { kind: 'buttons'; body: string; buttons: InteractiveButton[]; header?: string; footer?: string }
    | { kind: 'list'; body: string; buttonLabel: string; sections: InteractiveSection[]; header?: string; footer?: string }
    | { kind: 'none' };            // paused / already handled
  phase: CsPhase;                  // analytics hint after the turn (onboarding|serving)
}
export function runCsTurn(job: CsJob, depsOverride?: Partial<CsAgentDeps>): Promise<CsTurnResult>;
// CsAgentDeps.callModel injects the LLM (default = OpenAI chat.completions with CS_TOOL_DEFS); tests stub it.
export interface CsAgentDeps { callModel(params: { system: string; messages: any[]; tools: OpenAIFunctionDef[] }): Promise<{ toolCalls: Array<{ id: string; name: string; args: any }>; text: string | null }>; }

// ---------------------------------------------------------------------------
// 9. WhatsApp interactive send additions (src/lib/whatsapp-cloud/client.ts)
//    Return WhatsAppSendResult exactly like sendText. Both are 24h-window messages.
// ---------------------------------------------------------------------------
export interface InteractiveButton { id: string; title: string; }        // title<=20, id<=256
export interface InteractiveRow { id: string; title: string; description?: string; } // title<=24, desc<=72, id<=200
export interface InteractiveSection { title?: string; rows: InteractiveRow[]; }        // <=10 rows total
export function sendInteractiveButtons(params: {
  to: string; body: string; buttons: InteractiveButton[]; header?: string; footer?: string; // max 3 buttons, body<=1024
}): Promise<WhatsAppSendResultLike>;
export function sendInteractiveList(params: {
  to: string; body: string; buttonLabel: string; sections: InteractiveSection[]; header?: string; footer?: string; // buttonLabel<=20, body<=4096
}): Promise<WhatsAppSendResultLike>;
// Mirror of client.ts WhatsAppSendResult — import the real type; shown for reference.
export interface WhatsAppSendResultLike {
  success: boolean; wa_message_id?: string; contact_wa_id?: string;
  error?: { code: number; type: string; message: string; error_data?: unknown };
}

// ---------------------------------------------------------------------------
// 10. Tickets (src/lib/cs/cs-ticket.ts) — reuse support_requests; source='whatsapp_cs'
//     NOTE: support_requests has NO `channel`/`topic` column. Discriminator is `source`.
// ---------------------------------------------------------------------------
export function openOrAttachCsTicket(input: {
  accountId: string; waId: string; customerPhone: string; customerName: string | null; topic?: string;
}): Promise<{ ticketId: string }>; // status:'new', source:'whatsapp_cs', metadata.channel:'whatsapp_cs'
export function appendCsTicketHistory(input: {
  ticketId: string; accountId: string; action: string; actor: string; note?: string; body_text?: string;
  whatsapp_message_id?: string | null;
}): Promise<void>;

// ---------------------------------------------------------------------------
// 11. Handoff / bot-pause (GREENFIELD — built by this plan)
// ---------------------------------------------------------------------------
export type HandoffTrigger =
  | 'human_demand' | 'refund_return' | 'defective_product' | 'frustration'
  | 'legal' | 'abuse' | 'repeated_failure' | 'low_confidence';
export interface HandoffDetection { triggered: boolean; triggers: HandoffTrigger[]; severity: 'low'|'medium'|'high'; reason: string; }
// src/engines/escalation/detect.ts — extends detectEscalation (word-boundary safe).
export function detectHandoff(
  message: string,
  priorUserTexts: string[],
  opts?: { enabledTriggers?: Partial<Record<HandoffTrigger, boolean>>; lowConfidenceThreshold?: number; confidence?: number },
): HandoffDetection;

// src/lib/handoff/bot-pause.ts — reads/writes chat_sessions.bot_paused* (migration 069).
export function isBotPaused(chatSessionId: string): Promise<boolean>;
export function pauseBot(chatSessionId: string, reason: string): Promise<void>;   // sets bot_paused=true, bot_paused_at=now(), bot_paused_reason
export function resumeBot(chatSessionId: string): Promise<void>;                    // clears all three

// ---------------------------------------------------------------------------
// 12. CONFIG SHAPES (accounts.config) — secrets write-only, masked on read
// ---------------------------------------------------------------------------
export interface WhatsAppCsConfig {
  enabled: boolean;
  aliases?: string[];        // seeds fuzzy matcher (else derived from display_name/domain)
  order_source?: StorePlatform;
  greeting?: string;
}
export interface QuickShopIntegrationConfig {
  api_key: string;           // qs_live_… — auto-identifies shop
  webhook_secret?: string;   // HMAC for inbound order webhook
  enabled: boolean;
}
export interface ShopifyIntegrationConfig {
  shop_domain: string;
  admin_api_token: string;   // CANONICAL — reconcile admin-UI `api_token` mismatch
  enabled: boolean;
}
export interface ShipmentProviderConfig {
  type: 'focus';
  host?: string;
  enabled: boolean;
  lookup_mode?: 'p1' | 'p2' | 'p2_then_p1';
  reference_prefix?: string;
  expected_master_customer_id?: number;
}
export interface EscalationRecipient { name: string; email?: string; whatsapp?: string; }
// This is the SAME `EscalationConfig` (src/engines/escalation/types.ts:17), EXTENDED IN PLACE by
// Task D2 (adds `triggers` + `lowConfidenceThreshold`). There is NO separate `EscalationConfigExtended`
// type — D2 edits the base interface, and D4 imports/casts `EscalationConfig`.
export interface EscalationConfig {
  enabled?: boolean;
  recipients?: EscalationRecipient[];
  dedupeMinutes?: number;
  triggers?: Partial<Record<HandoffTrigger, boolean>>; // NEW (added by D2)
  lowConfidenceThreshold?: number;                       // NEW (added by D2)
}
// Return shape of runEscalationCheck / runCsHandoffCheck. This is the EXISTING `EscalationOutcome`
// exported from src/engines/escalation/dispatch.ts (NOT types.ts) — it ALREADY carries every field
// D4 needs (verified: { escalated; reason?; recipientsNotified?; deduped?; skipped? }); no widening required.
export interface EscalationOutcome {
  escalated: boolean;
  reason?: string;
  skipped?: string;             // e.g. 'flag_off' | 'disabled'
  deduped?: boolean;
  recipientsNotified?: number;
}
export interface AccountCsConfig {   // the slice of accounts.config CS reads
  whatsapp_cs?: WhatsAppCsConfig;
  integrations?: { quickshop?: QuickShopIntegrationConfig; shopify?: ShopifyIntegrationConfig; [k: string]: unknown };
  shipment_provider?: ShipmentProviderConfig;
  escalation?: EscalationConfig;
}
```

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `supabase/migrations/067_whatsapp_cs_sessions.sql` | create | Create whatsapp_cs_sessions lightweight-state table (pk wa_id; `phase` analytics hint, NOT an FSM) + fk indexes; idempotent DDL. |
| `supabase/migrations/068_brand_orders.sql` | create | Create brand_orders unified store; unique(account_id,order_number) + (account_id,customer_phone) index. |
| `supabase/migrations/069_chat_sessions_bot_paused.sql` | create | Add bot_paused/bot_paused_at/bot_paused_reason columns to chat_sessions (handoff pause state). |
| `src/lib/whatsapp-cloud/client.ts` | modify | Add sendInteractiveButtons + sendInteractiveList (reply-button & sectioned-list) via existing graphFetch/parseSendResponse. |
| `src/app/api/webhooks/whatsapp/route.ts` | modify | Add 4th inbound branch calling routeInboundToCustomerService after the routeInboundToTicket guard (route.ts:272-284). |
| `src/lib/cs/route-inbound-cs.ts` | create | 4th-branch producer: sendReaction('👀')+sendTyping, enqueueCsMessage, publishCsDrain (claims unknown-sender messages). |
| `src/lib/cs/wa-cs-queue.ts` | create | CS Redis FIFO: enqueueCsMessage/dequeueCsMessage/csQueueLength over cs:wa:<waId>:q with per-wamid SETNX dedup. |
| `src/lib/cs/wa-cs-locks.ts` | create | acquireCsLock/releaseCsLock over cs:wa:<waId>:lock (TTL 300s). |
| `src/lib/cs/wa-cs-publish.ts` | create | publishCsDrain to /api/cs/wa-worker with 10s-bucket dedup + colon-free ids + 3x retry. |
| `src/app/api/cs/wa-worker/route.ts` | create | QStash-verified worker route; verify sig on raw body then runCsDrain(waId) (runtime nodejs, maxDuration 300). |
| `src/lib/cs/wa-cs-worker.ts` | create | runCsDrain lock+FIFO drain loop (230s budget, continuation) + processOneCsInbound (done-guard, runCsTurn from cs-agent, send-with-retry, reaction). |
| `src/app/api/cron/cs-drain-sweep/route.ts` | create | Per-minute sweep recovering orphaned CS queues (queue>0 && lock free → publishCsDrain force). |
| `src/lib/cs/cs-session.ts` | create | whatsapp_cs_sessions lightweight state: load/create/save (optimistic version), isWarm(45min), `phase` hint — NO FSM transitions. |
| `src/lib/orders/connectors/types.ts` | create | OrderConnector interface, NormalizedOrder/NormalizedLineItem, OrderConnectorCreds, StorePlatform. |
| `src/lib/orders/connectors/registry.ts` | create | getConnector(platform) registry keyed by StorePlatform. |
| `src/lib/orders/connectors/quickshop.ts` | create | QuickShop adapter: pull(GET /orders/{id}), list(paginated GET /orders), normalizeWebhook, registerWebhooks; rate-limit aware; QuickShop wire types. |
| `src/lib/orders/connectors/shopify.ts` | create | Shopify adapter: thin wrapper over lookupShopifyOrder (supportsDirectLookup=true, no backfill). |
| `src/lib/orders/lookup.ts` | create | lookupOrder facade (resolve brand_orders → connector.pull → phone-verify → Focus enrichment) + lookupOrdersByPhone; returns OrderLookupOutcome. |
| `src/lib/orders/brand-orders.ts` | create | brand_orders upsert/query helpers (upsertBrandOrder(s), findBrandOrderByNumber, findBrandOrdersByPhone) — all account_id-scoped. |
| `src/lib/orders/phone-verify.ts` | create | phoneMatches best-effort (0↔+972 via toWaId); reveal-when-absent policy. |
| `src/lib/orders/backfill.ts` | create | QuickShop backfill: paginate GET /orders → upsert summaries into brand_orders, honoring X-RateLimit-* backoff. |
| `src/app/api/webhooks/quickshop/[accountToken]/route.ts` | create | HMAC-verified QuickShop order webhook receiver (mirror shipping webhook): resolve account by token, normalizeWebhook, upsertBrandOrder; always 200. |
| `src/app/api/cs/orders-backfill/route.ts` | create | QStash/admin-triggered backfill runner invoking src/lib/orders/backfill.ts for an account. |
| `src/lib/cs/brand-resolver.ts` | create | resolveBrand fuzzy match (pg_trgm/in-app) over CS-enabled brands' vocabulary + listCsEnabledBrands; returns 0/1/N BrandResolution. |
| `src/lib/cs/interactive.ts` | create | Build interactive buttons/list payloads for brand disambiguation, brand-confirm, and adaptive re-entry menus. |
| `src/lib/chatbot/sandwichBot.ts` | modify | Add 'whatsapp' to mode union (line 54) and treat it like 'dm' in the RAG-enrichment branch (lines 189-209). |
| `src/lib/chatbot/archetypes/index.ts` | modify | Handle mode:'whatsapp' in processWithArchetype prompt assembly (DM-like 1:1 CS behaviour). |
| `src/lib/cs/cs-context.ts` | create | Build the brand-grounded CS system prompt: buildPersonalityFromDB + searchContentByQuery/formatMetadataForAI (RAG) + name/brand/open-threads/warm-cold digest; stripSuggestions helper. |
| `src/lib/cs/tools/types.ts` | create | CsToolCtx, CsToolResult, WaInteractive, CsTool, OpenAIFunctionDef (the tool contract). |
| `src/lib/cs/tools/index.ts` | create | getCsTools() + CS_TOOL_DEFS: the 9 CS tools (defs + handlers), each enforcing its own code-level gate. |
| `src/lib/cs/cs-agent.ts` | create | runCsTurn: the brain-led tool-calling loop (isBotPaused guard, detectHandoff backstop, persona+RAG system prompt, OpenAI chat.completions tool loop ≤5 iters, side-effect apply, persist chat_messages, strip envelopes) → CsTurnResult. |
| `src/lib/cs/cs-ticket.ts` | create | openOrAttachCsTicket (source='whatsapp_cs') + appendCsTicketHistory; every bound conversation opens/attaches a support_request thread. |
| `src/engines/escalation/types.ts` | modify | Extend EscalationConfig with triggers{} + lowConfidenceThreshold; add HandoffTrigger union + HandoffDetection. |
| `src/engines/escalation/detect.ts` | modify | Add detectHandoff extending detectEscalation with refund/return/defective/frustration/repeated_failure/low_confidence triggers (word-boundary safe). |
| `src/engines/escalation/dispatch.ts` | modify | Wire handoff outcome: on trigger set bot_paused, flag ticket, notify config.escalation.recipients (email + in-app); reuse runEscalationCheck audit/dedup path. |
| `src/lib/handoff/bot-pause.ts` | create | isBotPaused/pauseBot/resumeBot over chat_sessions.bot_paused* (read on every CS bot turn). |
| `src/app/api/influencer/conversations/bot-toggle/route.ts` | create | POST endpoint to pause/resume the bot per conversation (manual resume only). |
| `src/app/api/cs/reply/route.ts` | create | Bestie-inbox human reply → sendText out the same Bestie number; auto-sets bot_paused_reason='human_reply' + appends agent_message history. |
| `src/app/api/admin/accounts/[accountId]/integrations/route.ts` | modify | Support quickshop platform + reconcile Shopify api_token↔admin_api_token field-name mismatch (write admin_api_token). |
| `tests/unit/cs-brand-resolver.test.ts` | create | Unit: fuzzy match 0/1/N disambiguation, aliases, Hebrew/English/misspelling, CS-enabled-only scope. |
| `tests/unit/quickshop-adapter.test.ts` | create | Unit: QuickShop normalizeWebhook + pull mapping → NormalizedOrder. |
| `tests/unit/lookup-order.test.ts` | create | Unit: lookupOrder phone-verify branches (present/match/mismatch/absent) + not_found/ambiguous. |
| `tests/unit/cs-agent.test.ts` | create | Unit: brain-led tool loop — isBotPaused/detectHandoff guards, bind_brand side-effect, order lookup via tools, warm/cold re-entry digest, envelope strip. |
| `tests/unit/detect-handoff.test.ts` | create | Unit: detectHandoff triggers, word-boundary safety, toggleable triggers, low_confidence threshold. |
| `tests/unit/quickshop-webhook.test.ts` | create | Integration-ish: QuickShop webhook HMAC verify → brand_orders upsert (DI/mock supabase). |

**Migration notes:** Current highest migration is 066_agent_wa_recent_turns.sql, so allocate 067/068/069 (do NOT reuse the duplicated 053-059 widget/crm numbers). All idempotent DDL, applied to prod via the Supabase MCP apply_migration tool.

067_whatsapp_cs_sessions.sql — CREATE TABLE public.whatsapp_cs_sessions:
  wa_id text PRIMARY KEY;
  contact_id uuid REFERENCES public.whatsapp_contacts(id);
  phase text NOT NULL DEFAULT 'onboarding' (onboarding|serving — analytics HINT only, does NOT gate the brain);
  active_account_id uuid REFERENCES public.accounts(id);
  active_ticket_id uuid REFERENCES public.support_requests(id);
  active_chat_session_id uuid REFERENCES public.chat_sessions(id);
  customer_name text;
  context jsonb NOT NULL DEFAULT '{}'::jsonb;
  last_activity_at timestamptz NOT NULL DEFAULT now();
  version int NOT NULL DEFAULT 0 (optimistic locking, mirrors crm_agent_wa_state);
  created_at timestamptz DEFAULT now(); updated_at timestamptz DEFAULT now().
  INDEX idx_cs_sessions_active_account ON (active_account_id).

068_brand_orders.sql — CREATE TABLE public.brand_orders:
  id uuid PK DEFAULT gen_random_uuid();
  account_id uuid NOT NULL REFERENCES public.accounts(id);
  external_id text; order_number text NOT NULL (connectors always supply it → keeps the unique upsert idempotent);
  customer_phone text; customer_email text; customer_name text;
  financial_status text; fulfillment_status text; status text;
  tracking_number text; tracking_url text;
  total text; currency text;
  line_items jsonb (NULLABLE — lazy-filled on live pull);
  placed_at timestamptz; source_platform text; raw jsonb;
  created_at timestamptz DEFAULT now(); updated_at timestamptz DEFAULT now().
  UNIQUE (account_id, order_number)  ← upsert conflict target.
  INDEX idx_brand_orders_number ON (account_id, order_number);
  INDEX idx_brand_orders_phone ON (account_id, customer_phone)  ← proactive phone lookup.

069_chat_sessions_bot_paused.sql — ALTER TABLE public.chat_sessions:
  ADD COLUMN IF NOT EXISTS bot_paused boolean NOT NULL DEFAULT false;
  ADD COLUMN IF NOT EXISTS bot_paused_at timestamptz;
  ADD COLUMN IF NOT EXISTS bot_paused_reason text.
  (chat_sessions confirmed live to lack all three; greenfield handoff work. No index needed — read by session id.)

No column is added to support_requests: CS tickets use the EXISTING source text column with value 'whatsapp_cs' (the spec's `channel` maps to `source`; support_requests has no channel/topic column). pg_trgm is already installed — no extension migration required; if a trigram index over the CS-enabled brand vocabulary is later desired it can be added, but v1 fuzzy match runs over the small CS-enabled set without a dedicated index.

---

I have everything I need. Here is the Phase A plan.

## Phase A: Foundations

This phase builds the greenfield database schema, the WhatsApp interactive-send primitives, and the entire CS async ingress pipeline (4th webhook branch → Redis FIFO → QStash drain worker → lightweight-state session store). It mirrors the proven CRM agent engine (`src/lib/crm/wa-*`) with a `cs:` Redis namespace and a `/api/cs/wa-worker` target. At the end of Phase A an unknown-sender WhatsApp message is claimed, queued, drained by a locked worker, and answered through `runCsTurn` (mocked here; the brain-led loop is built in Phase C). No store writes anywhere.

**Migration numbering:** current max is `066_agent_wa_recent_turns.sql` → allocate `067`, `068`, `069`. Idempotent DDL only. Commit the `.sql` AND apply to prod via the Supabase MCP `apply_migration` tool (there is no `supabase` CLI in-repo). Do NOT reuse the duplicated 053–059 numbers.

**Shared conventions for every task below:**
- Service-role client: `import { supabase as supabaseAdmin } from '@/lib/supabase'`.
- Redis primitives: `redisRPush, redisLPopCount, redisLLen, redisSetNx, redisDel, redisExists, redisGet` from `@/lib/redis`.
- QStash: `getQStash()` and `verifyQStashSignature(req, rawBody)` from `@/lib/pipeline/qstash`.
- QStash `deduplicationId` MUST be colon-free (`_`/`-`). Redis keys MAY contain `:`.
- Tests: Vitest, `npx vitest run tests/unit/<file>.test.ts`. `global.fetch` is already a `vi.fn()` from `tests/setup.ts`. Declare `vi.mock()` at top level BEFORE `await import()` of the SUT.
- Commit discipline: straight to `main`, push, stage only the feature's files.

---

### Task A1: Migration 067 — `whatsapp_cs_sessions` lightweight-state table

**Files:**
- Create: `supabase/migrations/067_whatsapp_cs_sessions.sql`
- Verify (no test file — verified via Supabase MCP `execute_sql`)

**Interfaces:** Produces: table `public.whatsapp_cs_sessions` (pk `wa_id text`; `contact_id uuid`, `phase text` [onboarding|serving — analytics hint, NOT an FSM], `active_account_id uuid`, `active_ticket_id uuid`, `active_chat_session_id uuid`, `customer_name text`, `context jsonb`, `last_activity_at timestamptz`, `version int`, `created_at`, `updated_at`) + index `idx_cs_sessions_active_account`. Consumed by Task A9 (`cs-session.ts` — `CsSessionRow`).

> **Note (TDD caveat):** This is a DDL migration, so the "failing test" here is a `information_schema` *schema-verify* query, not a behavioral TDD test — the weakest form of red-green. The red→green signal is "columns absent → columns present." The prod apply lands before any consumer code exists (acceptable for idempotent DDL); the first consuming code (Task A9) is what proves behavior.

- [ ] Step 1: Write the verification query (this is the schema-verify "failing test"). Save it to `scratchpad/verify_067.sql` and run it via the Supabase MCP `execute_sql` tool. Query:
```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'whatsapp_cs_sessions'
order by ordinal_position;
```
- [ ] Step 2: Run it via `mcp__supabase__execute_sql` with the above SQL. Expected FAIL: returns `[]` (empty — table does not exist yet).
- [ ] Step 3: Write the migration file `supabase/migrations/067_whatsapp_cs_sessions.sql`:
```sql
-- Migration 067: whatsapp_cs_sessions — lightweight per-shopper state for the brain-led CS loop (spec §10.1).
-- NOT an FSM: `phase` is a COARSE ANALYTICS HINT ONLY (onboarding|serving) and does NOT gate the brain.
-- Optimistic-locking `version` mirrors crm_agent_wa_state.
create table if not exists public.whatsapp_cs_sessions (
  wa_id                   text primary key,
  contact_id              uuid references public.whatsapp_contacts(id),
  phase                   text not null default 'onboarding',
  active_account_id       uuid references public.accounts(id),
  active_ticket_id        uuid references public.support_requests(id),
  active_chat_session_id  uuid references public.chat_sessions(id),
  customer_name           text,
  context                 jsonb not null default '{}'::jsonb,
  last_activity_at        timestamptz not null default now(),
  version                 int not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_cs_sessions_active_account
  on public.whatsapp_cs_sessions(active_account_id);
comment on table public.whatsapp_cs_sessions is
  'Lightweight state for the brain-led CS tool loop keyed on shopper wa_id (spec §10.1). phase (onboarding|serving) is an analytics HINT only — it does NOT gate the brain. version = optimistic lock.';
```
- [ ] Step 4: Apply it to prod via `mcp__supabase__apply_migration` (name: `whatsapp_cs_sessions`, query = the file contents), then re-run the Step 1 verification query via `mcp__supabase__execute_sql`. Expected PASS: **12 rows returned** (wa_id, contact_id, phase, active_account_id, active_ticket_id, active_chat_session_id, customer_name, context, last_activity_at, version, created_at, updated_at) — including `wa_id | text`, `phase | text`, `context | jsonb`, `version | integer`.
- [ ] Step 5: Commit:
```bash
git add supabase/migrations/067_whatsapp_cs_sessions.sql
git commit -m "feat(cs): migration 067 whatsapp_cs_sessions lightweight-state table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A2: Migration 068 — `brand_orders` unified store

**Files:**
- Create: `supabase/migrations/068_brand_orders.sql`
- Verify via Supabase MCP `execute_sql`

**Interfaces:** Produces: table `public.brand_orders` with unique `(account_id, order_number)` (upsert conflict target) + index `idx_brand_orders_phone` on `(account_id, customer_phone)`. `order_number` is **NOT NULL** (connectors always supply it) so the unique conflict target never sees a NULL (NULLs are distinct in a Postgres unique index and would silently insert duplicates instead of upserting). Consumed by Phase B (`brand-orders.ts` — `BrandOrderRow`, `upsertBrandOrder`).

> **Note (TDD caveat):** DDL migration — the "failing test" is an `information_schema`/`pg_indexes` *schema-verify* query, not behavioral TDD (weakest red-green). Behavior is proven by the first consumer (Task B4 `brand-orders.ts`).

- [ ] Step 1: Prepare the verification query in `scratchpad/verify_068.sql`:
```sql
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='brand_orders') as col_count,
  (select count(*) from pg_indexes
     where schemaname='public' and tablename='brand_orders'
       and indexdef ilike '%unique%account_id%order_number%') as unique_idx;
```
- [ ] Step 2: Run it via `mcp__supabase__execute_sql`. Expected FAIL: `col_count = 0`, `unique_idx = 0` (table absent).
- [ ] Step 3: Write `supabase/migrations/068_brand_orders.sql`:
```sql
-- Migration 068: brand_orders — one internal store fed by per-platform connectors (spec §10.2).
-- Read-only mirror: number→id resolution + phone-verify + lazy line_items on live pull.
create table if not exists public.brand_orders (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.accounts(id),
  external_id         text,
  order_number        text not null,   -- NOT NULL: connectors always supply it; keeps (account_id, order_number) upsert idempotent (NULLs are distinct in a unique index)
  customer_phone      text,
  customer_email      text,
  customer_name       text,
  financial_status    text,
  fulfillment_status  text,
  status              text,
  tracking_number     text,
  tracking_url        text,
  total               text,
  currency            text,
  line_items          jsonb,
  placed_at           timestamptz,
  source_platform     text,
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists idx_brand_orders_account_number
  on public.brand_orders(account_id, order_number);
create index if not exists idx_brand_orders_phone
  on public.brand_orders(account_id, customer_phone);
comment on table public.brand_orders is
  'Unified read-only order store (spec §10.2). Unique(account_id, order_number) is the upsert target. line_items nullable (lazy-filled on live connector.pull).';
```
- [ ] Step 4: Apply via `mcp__supabase__apply_migration` (name: `brand_orders`), then re-run the Step 1 query. Expected PASS: `col_count = 20`, `unique_idx = 1`. (The 20 columns: id, account_id, external_id, order_number, customer_phone, customer_email, customer_name, financial_status, fulfillment_status, status, tracking_number, tracking_url, total, currency, line_items, placed_at, source_platform, raw, created_at, updated_at.)
- [ ] Step 5: Commit:
```bash
git add supabase/migrations/068_brand_orders.sql
git commit -m "feat(cs): migration 068 brand_orders unified read-only order store

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A3: Migration 069 — `chat_sessions` bot-pause columns

**Files:**
- Create: `supabase/migrations/069_chat_sessions_bot_paused.sql`
- Verify via Supabase MCP `execute_sql`

**Interfaces:** Produces: columns `chat_sessions.bot_paused boolean not null default false`, `bot_paused_at timestamptz`, `bot_paused_reason text`. Consumed by Phase D (`bot-pause.ts` — `isBotPaused/pauseBot/resumeBot`).

> **Note (TDD caveat):** DDL migration — the "failing test" is an `information_schema` *schema-verify* query, not behavioral TDD. Behavior is proven by the first consumer (Task D3 `bot-pause.ts`).

- [ ] Step 1: Prepare `scratchpad/verify_069.sql`:
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='chat_sessions'
  and column_name in ('bot_paused','bot_paused_at','bot_paused_reason')
order by column_name;
```
- [ ] Step 2: Run via `mcp__supabase__execute_sql`. Expected FAIL: returns `[]` (columns confirmed absent live).
- [ ] Step 3: Write `supabase/migrations/069_chat_sessions_bot_paused.sql`:
```sql
-- Migration 069: chat_sessions bot-pause state for human handoff / bot-takeover (spec §9.2).
-- Each CS thread binds a chat_session, so per-conversation pause applies directly. Read on every bot turn.
alter table public.chat_sessions
  add column if not exists bot_paused boolean not null default false;
alter table public.chat_sessions
  add column if not exists bot_paused_at timestamptz;
alter table public.chat_sessions
  add column if not exists bot_paused_reason text;
comment on column public.chat_sessions.bot_paused is
  'Human-handoff pause flag (spec §9.2). true → bot skips its turn; cleared only by manual resume.';
```
- [ ] Step 4: Apply via `mcp__supabase__apply_migration` (name: `chat_sessions_bot_paused`), then re-run the Step 1 query. Expected PASS: 3 rows — `bot_paused | boolean | false`, `bot_paused_at | timestamp with time zone`, `bot_paused_reason | text`.
- [ ] Step 5: Commit:
```bash
git add supabase/migrations/069_chat_sessions_bot_paused.sql
git commit -m "feat(cs): migration 069 chat_sessions bot_paused columns for handoff

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A4: WhatsApp interactive send — `sendInteractiveButtons` + `sendInteractiveList`

**Files:**
- Modify: `src/lib/whatsapp-cloud/client.ts` (append after `sendMediaByLink`, which ends at line 220)
- Test: `tests/unit/wa-interactive-send.test.ts`

**Interfaces:** Consumes: existing `getConfig()`, `toWaId()`, `graphFetch()`, `parseSendResponse()`, `WhatsAppSendResult` (client.ts). Produces:
```ts
export interface InteractiveButton { id: string; title: string; }
export interface InteractiveRow { id: string; title: string; description?: string; }
export interface InteractiveSection { title?: string; rows: InteractiveRow[]; }
export function sendInteractiveButtons(params: { to: string; body: string; buttons: InteractiveButton[]; header?: string; footer?: string }): Promise<WhatsAppSendResult>;
export function sendInteractiveList(params: { to: string; body: string; buttonLabel: string; sections: InteractiveSection[]; header?: string; footer?: string }): Promise<WhatsAppSendResult>;
```
Both consumed by Task A8 (`processOneCsInbound` reply dispatch) and Phase C `interactive.ts`.

- [ ] Step 1: Write the failing test `tests/unit/wa-interactive-send.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('interactive WhatsApp sends', () => {
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '111';
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messages: [{ id: 'wamid.OUT' }], contacts: [{ wa_id: '972500000000' }] }),
      headers: { get: () => 'application/json' },
    });
  });

  it('sendInteractiveButtons posts an interactive/button body and parses the result', async () => {
    const { sendInteractiveButtons } = await import('@/lib/whatsapp-cloud/client');
    const res = await sendInteractiveButtons({
      to: '0500000000',
      body: 'ממשיכים?',
      buttons: [{ id: 'yes', title: 'כן' }, { id: 'other', title: 'משהו אחר' }],
      header: 'LA BEAUTÉ',
      footer: 'Bestie',
    });
    expect(res.success).toBe(true);
    expect(res.wa_message_id).toBe('wamid.OUT');
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.to).toBe('972500000000');
    expect(body.type).toBe('interactive');
    expect(body.interactive.type).toBe('button');
    expect(body.interactive.action.buttons).toHaveLength(2);
    expect(body.interactive.action.buttons[0]).toEqual({ type: 'reply', reply: { id: 'yes', title: 'כן' } });
    expect(body.interactive.header).toEqual({ type: 'text', text: 'LA BEAUTÉ' });
  });

  it('sendInteractiveList posts an interactive/list body with sections', async () => {
    const { sendInteractiveList } = await import('@/lib/whatsapp-cloud/client');
    const res = await sendInteractiveList({
      to: '972500000000',
      body: 'במה נמשיך?',
      buttonLabel: 'בחירה',
      sections: [{ title: 'הפניות שלך', rows: [{ id: 't1', title: 'Argania', description: 'שאלה על מוצר' }] }],
    });
    expect(res.success).toBe(true);
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.interactive.type).toBe('list');
    expect(body.interactive.action.button).toBe('בחירה');
    expect(body.interactive.action.sections[0].rows[0].id).toBe('t1');
  });
});
```
- [ ] Step 2: Run `npx vitest run tests/unit/wa-interactive-send.test.ts`. Expected FAIL: `SyntaxError` / `sendInteractiveButtons is not a function` (exports do not exist yet).
- [ ] Step 3: Append to `src/lib/whatsapp-cloud/client.ts` (after `sendMediaByLink`, line 220):
```ts
// -----------------------------------------------------------------------
// Send: interactive reply buttons (max 3) — 24h service-window message.
// -----------------------------------------------------------------------
export interface InteractiveButton { id: string; title: string; }        // title<=20, id<=256
export interface InteractiveRow { id: string; title: string; description?: string; } // title<=24, desc<=72, id<=200
export interface InteractiveSection { title?: string; rows: InteractiveRow[]; }        // <=10 rows total

export async function sendInteractiveButtons(params: {
  to: string;
  body: string;                 // <=1024
  buttons: InteractiveButton[]; // max 3
  header?: string;
  footer?: string;
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId } = getConfig();
  const to = toWaId(params.to);
  const interactive: any = {
    type: 'button',
    body: { text: params.body },
    action: {
      buttons: params.buttons.slice(0, 3).map((b) => ({
        type: 'reply',
        reply: { id: b.id, title: b.title },
      })),
    },
  };
  if (params.header) interactive.header = { type: 'text', text: params.header };
  if (params.footer) interactive.footer = { text: params.footer };

  const { ok, data } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    }),
  });
  return parseSendResponse(ok, data);
}

// -----------------------------------------------------------------------
// Send: interactive sectioned list (single button opens it) — 24h window.
// -----------------------------------------------------------------------
export async function sendInteractiveList(params: {
  to: string;
  body: string;                 // <=4096
  buttonLabel: string;          // <=20
  sections: InteractiveSection[]; // <=10 rows total
  header?: string;
  footer?: string;
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId } = getConfig();
  const to = toWaId(params.to);
  const interactive: any = {
    type: 'list',
    body: { text: params.body },
    action: {
      button: params.buttonLabel,
      sections: params.sections.map((s) => ({
        ...(s.title ? { title: s.title } : {}),
        rows: s.rows.map((r) => ({
          id: r.id,
          title: r.title,
          ...(r.description ? { description: r.description } : {}),
        })),
      })),
    },
  };
  if (params.header) interactive.header = { type: 'text', text: params.header };
  if (params.footer) interactive.footer = { text: params.footer };

  const { ok, data } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    }),
  });
  return parseSendResponse(ok, data);
}
```
- [ ] Step 4: Run `npx vitest run tests/unit/wa-interactive-send.test.ts`. Expected PASS: 2 passed.
- [ ] Step 5: Commit:
```bash
git add src/lib/whatsapp-cloud/client.ts tests/unit/wa-interactive-send.test.ts
git commit -m "feat(cs): sendInteractiveButtons + sendInteractiveList in WA Cloud client

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A5: CS Redis FIFO queue + locks

**Files:**
- Create: `src/lib/cs/wa-cs-queue.ts`
- Create: `src/lib/cs/wa-cs-locks.ts`
- Test: `tests/unit/cs-queue.test.ts`

**Interfaces:** Consumes: `redisRPush, redisLPopCount, redisLLen, redisSetNx, redisDel` from `@/lib/redis`. Produces:
```ts
export interface CsJob { waId: string; msg: any; textBody: string | null; contactId?: string | null; attempt?: number; }
export function enqueueCsMessage(job: CsJob): Promise<{ enqueued: boolean; queueLen: number }>;
export function dequeueCsMessage(waId: string): Promise<CsJob | null>;
export function csQueueLength(waId: string): Promise<number>;
export function acquireCsLock(waId: string, ttlSeconds?: number): Promise<boolean>;
export function releaseCsLock(waId: string): Promise<void>;
```
`CsJob` consumed by Tasks A6/A7/A8/A10. Redis keys: `cs:wa:<waId>:q`, `cs:wa:<waId>:lock`, dedup `cs:wa:<wamid>:queued`.

- [ ] Step 1: Write the failing test `tests/unit/cs-queue.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpush = vi.fn();
const lpop = vi.fn();
const llen = vi.fn();
const setnx = vi.fn();
const del = vi.fn();

vi.mock('@/lib/redis', () => ({
  redisRPush: (...a: any[]) => rpush(...a),
  redisLPopCount: (...a: any[]) => lpop(...a),
  redisLLen: (...a: any[]) => llen(...a),
  redisSetNx: (...a: any[]) => setnx(...a),
  redisDel: (...a: any[]) => del(...a),
}));

describe('CS queue + locks', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('enqueues onto cs:wa:<waId>:q behind a per-wamid SETNX dedup', async () => {
    setnx.mockResolvedValue(true);
    rpush.mockResolvedValue(1);
    const { enqueueCsMessage } = await import('@/lib/cs/wa-cs-queue');
    const r = await enqueueCsMessage({ waId: '972500000000', msg: { id: 'wamid.A' }, textBody: 'hi' });
    expect(setnx).toHaveBeenCalledWith('cs:wa:wamid.A:queued', '1', 86_400);
    expect(rpush).toHaveBeenCalledWith('cs:wa:972500000000:q', [expect.any(String)]);
    expect(r).toEqual({ enqueued: true, queueLen: 1 });
  });

  it('a duplicate wamid does not push again', async () => {
    setnx.mockResolvedValue(false);
    llen.mockResolvedValue(3);
    const { enqueueCsMessage } = await import('@/lib/cs/wa-cs-queue');
    const r = await enqueueCsMessage({ waId: '972500000000', msg: { id: 'wamid.A' }, textBody: 'hi' });
    expect(rpush).not.toHaveBeenCalled();
    expect(r).toEqual({ enqueued: false, queueLen: 3 });
  });

  it('dequeues FIFO (LPOP count=1) and parses JSON', async () => {
    lpop.mockResolvedValue([JSON.stringify({ waId: 'x', msg: { id: 'm' }, textBody: 't' })]);
    const { dequeueCsMessage } = await import('@/lib/cs/wa-cs-queue');
    const j = await dequeueCsMessage('x');
    expect(lpop).toHaveBeenCalledWith('cs:wa:x:q', 1);
    expect(j?.textBody).toBe('t');
  });

  it('acquireCsLock SETNX on cs:wa:<waId>:lock with TTL 300', async () => {
    setnx.mockResolvedValue(true);
    const { acquireCsLock, releaseCsLock } = await import('@/lib/cs/wa-cs-locks');
    expect(await acquireCsLock('x')).toBe(true);
    expect(setnx).toHaveBeenCalledWith('cs:wa:x:lock', '1', 300);
    await releaseCsLock('x');
    expect(del).toHaveBeenCalledWith('cs:wa:x:lock');
  });
});
```
- [ ] Step 2: Run `npx vitest run tests/unit/cs-queue.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/wa-cs-queue'`.
- [ ] Step 3a: Create `src/lib/cs/wa-cs-queue.ts`:
```ts
/**
 * Per-shopper FIFO inbox for the WhatsApp customer-service engine. Mirrors the CRM agent
 * queue (src/lib/crm/wa-agent-queue.ts) but on the `cs:` Redis namespace and keyed on wa_id.
 * A single drain worker (holding the per-wa_id lock) pops these one-by-one in arrival order.
 */
import { redisRPush, redisLPopCount, redisLLen, redisSetNx } from '@/lib/redis';

export interface CsJob {
  waId: string;
  msg: any;                 // raw inbound WhatsApp message object
  textBody: string | null;  // pre-extracted (text/button/interactive title)
  contactId?: string | null;
  attempt?: number;
}

const qKey = (waId: string) => `cs:wa:${waId}:q`;

/**
 * Append one inbound to the shopper's FIFO queue. A per-wamid SETNX guard makes a redelivered
 * Meta webhook a no-op (the same message can't enqueue twice). Redis keys may contain ':'.
 */
export async function enqueueCsMessage(job: CsJob): Promise<{ enqueued: boolean; queueLen: number }> {
  const wamid = String(job.msg?.id || '');
  if (wamid) {
    const fresh = await redisSetNx(`cs:wa:${wamid}:queued`, '1', 86_400);
    if (!fresh) return { enqueued: false, queueLen: await redisLLen(qKey(job.waId)) };
  }
  const queueLen = await redisRPush(qKey(job.waId), [JSON.stringify(job)]);
  return { enqueued: true, queueLen };
}

/** Pop the oldest queued inbound (FIFO). Returns null when the queue is empty. */
export async function dequeueCsMessage(waId: string): Promise<CsJob | null> {
  const [raw] = await redisLPopCount(qKey(waId), 1);
  if (!raw) return null;
  try { return JSON.parse(raw) as CsJob; } catch { return null; }
}

export async function csQueueLength(waId: string): Promise<number> {
  return redisLLen(qKey(waId));
}
```
- [ ] Step 3b: Create `src/lib/cs/wa-cs-locks.ts`:
```ts
import { redisSetNx, redisDel } from '@/lib/redis';

/**
 * Per-shopper mutex so a burst can't race whatsapp_cs_sessions. TTL >= the worker's
 * maxDuration (300s) so the lock can't expire mid-job and admit a sibling.
 */
export async function acquireCsLock(waId: string, ttlSeconds = 300): Promise<boolean> {
  return redisSetNx(`cs:wa:${waId}:lock`, '1', ttlSeconds);
}
export async function releaseCsLock(waId: string): Promise<void> {
  await redisDel(`cs:wa:${waId}:lock`);
}
```
- [ ] Step 4: Run `npx vitest run tests/unit/cs-queue.test.ts`. Expected PASS: 4 passed.
- [ ] Step 5: Commit:
```bash
git add src/lib/cs/wa-cs-queue.ts src/lib/cs/wa-cs-locks.ts tests/unit/cs-queue.test.ts
git commit -m "feat(cs): CS Redis FIFO queue + per-wa_id locks on cs: namespace

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A6: `publishCsDrain` — QStash drain trigger

**Files:**
- Create: `src/lib/cs/wa-cs-publish.ts`
- Test: `tests/unit/cs-publish.test.ts`

**Interfaces:** Consumes: `getQStash()` from `@/lib/pipeline/qstash`. Produces:
```ts
export function publishCsDrain(waId: string, opts?: { force?: boolean }): Promise<void>;
```
Targets `${BASE_URL}/api/cs/wa-worker` with body `{ drain: true, waId }`. Dedup id colon-free: `csdrain_<waId>_<10sBucket>` or forced `csdrain_<waId>_f_<ts>`. Consumed by Tasks A8 (continuation), A7 (cron), A10 (producer).

- [ ] Step 1: Write the failing test `tests/unit/cs-publish.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const publishJSON = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({
  getQStash: () => ({ publishJSON: (...a: any[]) => publishJSON(...a) }),
}));

describe('publishCsDrain', () => {
  beforeEach(() => { vi.clearAllMocks(); publishJSON.mockResolvedValue({}); });

  it('publishes a drain trigger targeting /api/cs/wa-worker with a colon-free bucket id', async () => {
    const { publishCsDrain } = await import('@/lib/cs/wa-cs-publish');
    await publishCsDrain('972500000000');
    const payload = publishJSON.mock.calls[0][0];
    expect(payload.url).toMatch(/\/api\/cs\/wa-worker$/);
    expect(payload.body).toEqual({ drain: true, waId: '972500000000' });
    expect(payload.retries).toBe(3);
    expect(payload.deduplicationId).not.toContain(':');
    expect(payload.deduplicationId).toMatch(/^csdrain_972500000000_\d+$/);
  });

  it('force uses a unique id so a continuation is never swallowed', async () => {
    const { publishCsDrain } = await import('@/lib/cs/wa-cs-publish');
    await publishCsDrain('x', { force: true });
    expect(publishJSON.mock.calls[0][0].deduplicationId).toMatch(/^csdrain_x_f_\d+$/);
  });

  it('retries a transient publish blip 3x before throwing', async () => {
    publishJSON.mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce({});
    const { publishCsDrain } = await import('@/lib/cs/wa-cs-publish');
    await publishCsDrain('x');
    expect(publishJSON).toHaveBeenCalledTimes(2);
  });
});
```
- [ ] Step 2: Run `npx vitest run tests/unit/cs-publish.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/wa-cs-publish'`.
- [ ] Step 3: Create `src/lib/cs/wa-cs-publish.ts`:
```ts
import { getQStash } from '@/lib/pipeline/qstash';

const BASE_URL =
  process.env.WA_WORKER_BASE_URL || process.env.PIPELINE_BASE_URL || 'https://influencers-bot.vercel.app';

/**
 * Wake the per-shopper CS drain worker. The FIFO messages live in Redis, not this job.
 * A 10-second-bucket dedup id coalesces a burst of triggers into ~1 QStash publish; `force`
 * (a budget continuation / release-race closer / cron sweep) always fires with a unique id.
 * QStash REJECTS a deduplicationId containing ':' — use '_' separators only.
 */
export async function publishCsDrain(waId: string, opts: { force?: boolean } = {}): Promise<void> {
  const bucket = Math.floor(Date.now() / 10_000);
  const deduplicationId = opts.force ? `csdrain_${waId}_f_${Date.now()}` : `csdrain_${waId}_${bucket}`;
  const payload = {
    url: `${BASE_URL}/api/cs/wa-worker`,
    body: { drain: true, waId },
    retries: 3,
    deduplicationId,
  };
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try { await getQStash().publishJSON(payload); return; }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 150 * (i + 1))); }
  }
  throw lastErr;
}
```
- [ ] Step 4: Run `npx vitest run tests/unit/cs-publish.test.ts`. Expected PASS: 3 passed.
- [ ] Step 5: Commit:
```bash
git add src/lib/cs/wa-cs-publish.ts tests/unit/cs-publish.test.ts
git commit -m "feat(cs): publishCsDrain QStash trigger for the CS worker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A7: CS worker route `/api/cs/wa-worker` + `cs-drain-sweep` cron

**Files:**
- Create: `src/app/api/cs/wa-worker/route.ts`
- Create: `src/app/api/cron/cs-drain-sweep/route.ts`
- Test: `tests/unit/cs-worker-route.test.ts`

**Interfaces:** Consumes: `verifyQStashSignature(req, rawBody)` from `@/lib/pipeline/qstash`; `runCsDrain(waId)` from `@/lib/cs/wa-cs-worker` (Task A8); `csQueueLength` from `@/lib/cs/wa-cs-queue`; `publishCsDrain` from `@/lib/cs/wa-cs-publish`; `redisExists` from `@/lib/redis`; `supabaseAdmin`. Produces: `POST /api/cs/wa-worker` (QStash-verified → `runCsDrain`), `GET /api/cron/cs-drain-sweep`.

Note: Task A8 defines `runCsDrain`; this task is authored second in code, but the route only needs the signature. The route test mocks `@/lib/cs/wa-cs-worker`, so it passes before A8's implementation lands. Build A8 before deploying.

- [ ] Step 1: Write the failing test `tests/unit/cs-worker-route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const verify = vi.fn();
const runCsDrain = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({ verifyQStashSignature: (...a: any[]) => verify(...a) }));
vi.mock('@/lib/cs/wa-cs-worker', () => ({ runCsDrain: (...a: any[]) => runCsDrain(...a) }));

// ---- cs-drain-sweep cron deps (only used by the sweep describe below) ----
const sweepState: any = { sessions: [] };
const qlenSweep = vi.fn();
const redisExistsSweep = vi.fn();
const publishSweep = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ gte: async () => ({ data: sweepState.sessions, error: null }) }) }) },
}));
vi.mock('@/lib/cs/wa-cs-queue', () => ({ csQueueLength: (...a: any[]) => qlenSweep(...a) }));
vi.mock('@/lib/cs/wa-cs-publish', () => ({ publishCsDrain: (...a: any[]) => publishSweep(...a) }));
vi.mock('@/lib/redis', () => ({ redisExists: (...a: any[]) => redisExistsSweep(...a) }));

function req(body: any) {
  return { text: async () => JSON.stringify(body), headers: { get: () => 'sig' } } as any;
}

describe('POST /api/cs/wa-worker', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('401s on a bad QStash signature', async () => {
    verify.mockResolvedValue(false);
    const { POST } = await import('@/app/api/cs/wa-worker/route');
    const res = await POST(req({ drain: true, waId: 'x' }));
    expect(res.status).toBe(401);
    expect(runCsDrain).not.toHaveBeenCalled();
  });

  it('runs the drain when signed and body.drain+waId present', async () => {
    verify.mockResolvedValue(true);
    runCsDrain.mockResolvedValue({ status: 'ok', processed: 2 });
    const { POST } = await import('@/app/api/cs/wa-worker/route');
    const res = await POST(req({ drain: true, waId: '972500000000' }));
    expect(res.status).toBe(200);
    expect(runCsDrain).toHaveBeenCalledWith('972500000000');
  });
});

describe('GET /api/cron/cs-drain-sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sweepState.sessions = [{ wa_id: 'wa-1' }];
    qlenSweep.mockResolvedValue(2);
    redisExistsSweep.mockResolvedValue(false);
    publishSweep.mockResolvedValue(undefined);
  });

  it('force-drains an orphaned queue when the lock is free', async () => {
    const { GET } = await import('@/app/api/cron/cs-drain-sweep/route');
    const res = await GET();
    const json = await res.json();
    expect(publishSweep).toHaveBeenCalledWith('wa-1', { force: true });
    expect(json.swept).toEqual([{ waId: 'wa-1', queued: 2 }]);
  });

  it('skips a queue whose lock is held (marks it seen-but-busy, no publish)', async () => {
    redisExistsSweep.mockResolvedValue(true);
    const { GET } = await import('@/app/api/cron/cs-drain-sweep/route');
    const res = await GET();
    const json = await res.json();
    expect(publishSweep).not.toHaveBeenCalled();
    expect(json.swept).toEqual([{ waId: 'wa-1', queued: -2 }]); // negative = seen-but-busy
  });

  it('ignores a session with an empty queue', async () => {
    qlenSweep.mockResolvedValue(0);
    const { GET } = await import('@/app/api/cron/cs-drain-sweep/route');
    const res = await GET();
    const json = await res.json();
    expect(publishSweep).not.toHaveBeenCalled();
    expect(json.swept).toEqual([]);
  });
});
```
- [ ] Step 2: Run `npx vitest run tests/unit/cs-worker-route.test.ts`. Expected FAIL: `Cannot find module '@/app/api/cs/wa-worker/route'` (and `.../cs-drain-sweep/route`).
- [ ] Step 3a: Create `src/app/api/cs/wa-worker/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/pipeline/qstash';
import { runCsDrain } from '@/lib/cs/wa-cs-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // one CS turn (RAG + brain) is slow

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  if (body?.drain && body?.waId) {
    const result = await runCsDrain(String(body.waId));
    return NextResponse.json(result, { status: 200 });
  }
  return NextResponse.json({ status: 'ignored' }, { status: 200 });
}
```
- [ ] Step 3b: Create `src/app/api/cron/cs-drain-sweep/route.ts`:
```ts
/**
 * Safety-net sweeper for the per-shopper CS FIFO queue. The primary trigger is the webhook's
 * publishCsDrain; this cron recovers an ORPHANED queue (messages in cs:wa:<waId>:q with no drain
 * scheduled, e.g. a transient QStash blip). Every minute it inspects the active CS session set and,
 * for any non-empty queue whose lock is free, fires a forced drain. Idempotent — a spurious drain
 * that finds the lock held or the queue empty is a no-op.
 */
import { NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { csQueueLength } from '@/lib/cs/wa-cs-queue';
import { publishCsDrain } from '@/lib/cs/wa-cs-publish';
import { redisExists } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Candidate wa_ids: active CS sessions touched in the last hour (bounded scan).
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: sessions } = await supabaseAdmin
    .from('whatsapp_cs_sessions')
    .select('wa_id')
    .gte('last_activity_at', since);

  const swept: { waId: string; queued: number }[] = [];
  for (const s of sessions || []) {
    const waId = (s as any).wa_id as string;
    let queued = 0;
    try { queued = await csQueueLength(waId); } catch { continue; }
    if (queued <= 0) continue;
    let locked = false;
    try { locked = await redisExists(`cs:wa:${waId}:lock`); } catch { /* treat as unlocked */ }
    if (locked) { swept.push({ waId, queued: -queued }); continue; } // negative = seen-but-busy
    try { await publishCsDrain(waId, { force: true }); swept.push({ waId, queued }); }
    catch (e) { console.error('[cs-drain-sweep] publishCsDrain failed', waId, e); }
  }
  return NextResponse.json({ ok: true, sessions: (sessions || []).length, swept });
}
```
- [ ] Step 4: Run `npx vitest run tests/unit/cs-worker-route.test.ts`. Expected PASS: 5 passed (2 wa-worker route + 3 cs-drain-sweep cron).
- [ ] Step 5: Commit:
```bash
git add src/app/api/cs/wa-worker/route.ts src/app/api/cron/cs-drain-sweep/route.ts tests/unit/cs-worker-route.test.ts
git commit -m "feat(cs): QStash-verified /api/cs/wa-worker route + cs-drain-sweep cron

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A8: `runCsDrain` + `processOneCsInbound` — the drain loop

**Files:**
- Create: `src/lib/cs/wa-cs-worker.ts`
- Test: `tests/unit/cs-worker.test.ts`

**Interfaces:** Consumes: `acquireCsLock/releaseCsLock` (A5), `dequeueCsMessage/csQueueLength/type CsJob` (A5), `publishCsDrain` (A6), `runCsTurn(job): Promise<CsTurnResult>` from `@/lib/cs/cs-agent` (Phase C brain-led loop — dynamically imported, mocked here), `sendText/sendInteractiveButtons/sendInteractiveList/sendReaction` (client.ts, A4), `redisGet/redisSetNx`. Produces:
```ts
export function runCsDrain(waId: string): Promise<{ status: string; processed: number }>;
export function processOneCsInbound(job: CsJob): Promise<string | null>;
```

`CsTurnResult.reply` discriminated union: `{kind:'text',body}` | `{kind:'buttons',body,buttons,header?,footer?}` | `{kind:'list',body,buttonLabel,sections,header?,footer?}` | `{kind:'none'}`.

- [ ] Step 1: Write the failing test `tests/unit/cs-worker.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const acquire = vi.fn();
const release = vi.fn();
const dequeue = vi.fn();
const qlen = vi.fn();
const publish = vi.fn();
const runCsTurn = vi.fn();
const sendText = vi.fn();
const sendButtons = vi.fn();
const sendReaction = vi.fn();
const redisGet = vi.fn();
const redisSetNx = vi.fn();

vi.mock('@/lib/cs/wa-cs-locks', () => ({ acquireCsLock: (...a: any[]) => acquire(...a), releaseCsLock: (...a: any[]) => release(...a) }));
vi.mock('@/lib/cs/wa-cs-queue', () => ({ dequeueCsMessage: (...a: any[]) => dequeue(...a), csQueueLength: (...a: any[]) => qlen(...a) }));
vi.mock('@/lib/cs/wa-cs-publish', () => ({ publishCsDrain: (...a: any[]) => publish(...a) }));
vi.mock('@/lib/cs/cs-agent', () => ({ runCsTurn: (...a: any[]) => runCsTurn(...a) }));
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendText: (...a: any[]) => sendText(...a),
  sendInteractiveButtons: (...a: any[]) => sendButtons(...a),
  sendInteractiveList: vi.fn(),
  sendReaction: (...a: any[]) => sendReaction(...a),
}));
vi.mock('@/lib/redis', () => ({ redisGet: (...a: any[]) => redisGet(...a), redisSetNx: (...a: any[]) => redisSetNx(...a) }));

describe('runCsDrain / processOneCsInbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acquire.mockResolvedValue(true);
    qlen.mockResolvedValue(0);
    redisGet.mockResolvedValue(null);
    redisSetNx.mockResolvedValue(true);
    sendText.mockResolvedValue({ success: true });
    sendButtons.mockResolvedValue({ success: true });
  });

  it('busy when the lock is held', async () => {
    acquire.mockResolvedValue(false);
    const { runCsDrain } = await import('@/lib/cs/wa-cs-worker');
    expect(await runCsDrain('x')).toEqual({ status: 'busy', processed: 0 });
  });

  it('drains FIFO in order, sends text replies, releases the lock', async () => {
    dequeue
      .mockResolvedValueOnce({ waId: 'x', msg: { id: 'm1' }, textBody: 'hi' })
      .mockResolvedValueOnce({ waId: 'x', msg: { id: 'm2' }, textBody: 'bye' })
      .mockResolvedValueOnce(null);
    runCsTurn.mockResolvedValue({ reply: { kind: 'text', body: 'שלום' }, phase: 'onboarding' });
    const { runCsDrain } = await import('@/lib/cs/wa-cs-worker');
    const r = await runCsDrain('x');
    expect(r).toEqual({ status: 'ok', processed: 2 });
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText.mock.calls[0][0]).toMatchObject({ to: 'x', body: 'שלום' });
    expect(release).toHaveBeenCalledWith('x');
  });

  it('done-guard short-circuits an already-processed wamid', async () => {
    redisGet.mockResolvedValue('1');
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const out = await processOneCsInbound({ waId: 'x', msg: { id: 'm1' }, textBody: 'hi' });
    expect(out).toBeNull();
    expect(runCsTurn).not.toHaveBeenCalled();
  });

  it('dispatches a buttons reply via sendInteractiveButtons', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'buttons', body: 'ממשיכים?', buttons: [{ id: 'y', title: 'כן' }] }, phase: 'serving' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    await processOneCsInbound({ waId: 'x', msg: { id: 'm3' }, textBody: 'q' });
    expect(sendButtons).toHaveBeenCalledWith(expect.objectContaining({ to: 'x', body: 'ממשיכים?' }));
    expect(sendText).not.toHaveBeenCalled();
  });

  it('kind:none sends nothing (paused / already handled)', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'none' }, phase: 'serving' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    await processOneCsInbound({ waId: 'x', msg: { id: 'm4' }, textBody: 'q' });
    expect(sendText).not.toHaveBeenCalled();
    expect(sendButtons).not.toHaveBeenCalled();
  });
});
```
- [ ] Step 2: Run `npx vitest run tests/unit/cs-worker.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/wa-cs-worker'`.
- [ ] Step 3a: Create `src/lib/cs/wa-cs-worker.ts` with the imports + `processOneCsInbound` (validated by the done-guard / buttons / kind:none tests):
```ts
import { acquireCsLock, releaseCsLock } from '@/lib/cs/wa-cs-locks';
import { dequeueCsMessage, csQueueLength, type CsJob } from '@/lib/cs/wa-cs-queue';
import { publishCsDrain } from '@/lib/cs/wa-cs-publish';
import { sendText, sendInteractiveButtons, sendInteractiveList, sendReaction } from '@/lib/whatsapp-cloud/client';
import { redisGet, redisSetNx } from '@/lib/redis';

// Exit ~70s before Vercel's 300s kill so the loop releases the lock and enqueues a continuation
// instead of dying mid-item with the lock still held.
const DRAIN_BUDGET_MS = 230_000;

/**
 * Process exactly one inbound: done-guard → runCsTurn → dispatch reply by kind (send-with-retry)
 * → done SETNX (only after a CONFIRMED send) → ✅ reaction. The reply is sent BEFORE the done guard
 * so a crash between them re-processes (no lost reply). runCsTurn is dynamically imported so this
 * module has no static dependency on the Phase-C brain-led agent loop (src/lib/cs/cs-agent.ts).
 * NOTE: Task C7 finalizes this body (static runCsTurn import, wa_message_id return) — see C7's diff.
 */
export async function processOneCsInbound(job: CsJob): Promise<string | null> {
  const doneKey = `cs:wa:${job.msg?.id}:done`;
  try { if (job.msg?.id && (await redisGet(doneKey))) return null; } catch { /* ignore */ }

  const { runCsTurn } = await import('@/lib/cs/cs-agent');
  const turn = await runCsTurn(job);
  const reply = turn.reply;
  if (!reply || reply.kind === 'none') return turn.phase;

  // Meta can return {success:false} WITHOUT throwing on 429/503 → retry the SEND 3x.
  let sent = { success: false } as { success: boolean };
  for (let i = 0; i < 3; i++) {
    try {
      if (reply.kind === 'text') {
        sent = await sendText({ to: job.waId, body: reply.body, contextMessageId: job.msg?.id });
      } else if (reply.kind === 'buttons') {
        sent = await sendInteractiveButtons({ to: job.waId, body: reply.body, buttons: reply.buttons, header: reply.header, footer: reply.footer });
      } else if (reply.kind === 'list') {
        sent = await sendInteractiveList({ to: job.waId, body: reply.body, buttonLabel: reply.buttonLabel, sections: reply.sections, header: reply.header, footer: reply.footer });
      }
    } catch (e) { sent = { success: false }; console.warn('[cs-worker] send threw', e); }
    if (sent.success) break;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }

  if (sent.success) {
    try { if (job.msg?.id) await redisSetNx(doneKey, '1', 900); } catch { /* ignore */ }
    if (job.msg?.id) void sendReaction({ to: job.waId, messageId: job.msg.id, emoji: '✅' }).catch(() => {});
  } else {
    console.error('[cs-worker] reply delivery FAILED after 3 retries', job.msg?.id);
    if (job.msg?.id) void sendReaction({ to: job.waId, messageId: job.msg.id, emoji: '⚠️' }).catch(() => {});
  }
  return turn.phase;
}
```
- [ ] Step 3b: Append `runCsDrain` to the same file (validated by the "busy" + "drains FIFO in order" tests):
```ts
/**
 * Drain the shopper's FIFO queue. ONE drain holds the per-wa_id lock and pops messages one-by-one
 * in ARRIVAL ORDER. A concurrent drain that can't get the lock simply exits. On hitting the time
 * budget with items still queued, or on a release-race, it re-enqueues a forced continuation.
 */
export async function runCsDrain(waId: string): Promise<{ status: string; processed: number }> {
  const locked = await acquireCsLock(waId);
  if (!locked) return { status: 'busy', processed: 0 };

  const deadline = Date.now() + DRAIN_BUDGET_MS;
  let processed = 0;
  try {
    while (Date.now() < deadline) {
      const job = await dequeueCsMessage(waId);
      if (!job) break; // queue drained
      try { await processOneCsInbound(job); }
      catch (e) { console.warn('[cs-drain] item failed (dropped; dedup+done guards are the backstops)', e); }
      processed++;
    }
  } catch (e) {
    console.warn('[cs-drain] drain failed', e);
  } finally {
    await releaseCsLock(waId);
  }

  try {
    if (await csQueueLength(waId) > 0) await publishCsDrain(waId, { force: true });
  } catch (e) { console.warn('[cs-drain] continuation publish failed', e); }

  return { status: 'ok', processed };
}
```
- [ ] Step 4: Run `npx vitest run tests/unit/cs-worker.test.ts`. Expected PASS: 5 passed.
- [ ] Step 5: Commit:
```bash
git add src/lib/cs/wa-cs-worker.ts tests/unit/cs-worker.test.ts
git commit -m "feat(cs): runCsDrain FIFO loop + processOneCsInbound with send-retry & guards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A9: `cs-session.ts` — lightweight per-shopper state store

**Files:**
- Create: `src/lib/cs/cs-session.ts`
- Test: `tests/unit/cs-session-store.test.ts`

**Interfaces:** Consumes: `supabaseAdmin` (`@/lib/supabase`), table `whatsapp_cs_sessions` (Task A1). Produces:
```ts
export type CsPhase = 'onboarding' | 'serving';   // analytics HINT only — does NOT gate the brain
export interface CsSessionContext { lastOrderRef?: string; lastBrandCandidates?: any[]; [k: string]: unknown; }
export interface CsSessionRow { wa_id: string; contact_id: string|null; phase: CsPhase; active_account_id: string|null; active_ticket_id: string|null; active_chat_session_id: string|null; customer_name: string|null; context: CsSessionContext; last_activity_at: string; version: number; created_at: string; updated_at: string; }
export function loadCsSession(waId: string): Promise<CsSessionRow | null>;
export function createCsSession(waId: string, contactId: string | null): Promise<CsSessionRow>;
export function saveCsSession(prev: CsSessionRow, patch: Partial<CsSessionRow>): Promise<boolean>;
export const WARM_WINDOW_MS: number;
export function isWarm(row: CsSessionRow, now?: number): boolean;
```
This is **lightweight state only** (no FSM transitions) — the brain-led loop (Phase C `cs-agent.ts`) reads/writes it between turns. `saveCsSession` uses optimistic concurrency (`WHERE version = prev.version`, bumps version).

- [ ] Step 1: Write the failing test `tests/unit/cs-session-store.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { rows: [] as any[], updateResult: [{ wa_id: 'x' }] };

vi.mock('@/lib/supabase', () => {
  const from = () => {
    const ctx: any = {};
    ctx.select = () => ctx;
    ctx.eq = () => ctx;
    ctx.maybeSingle = async () => ({ data: state.rows[0] ?? null, error: null });
    ctx.single = async () => ({ data: state.insertRow, error: null });
    ctx.insert = (row: any) => { state.insertRow = { ...row }; return ctx; };
    ctx.update = (patch: any) => { state.lastPatch = patch; return ctx; };
    // update().eq().eq().select() → resolves to updated rows (thenable)
    ctx.then = (resolve: any) => resolve({ data: state.updateResult, error: null });
    return ctx;
  };
  return { supabase: { from } };
});

describe('cs-session store', () => {
  beforeEach(() => { state.rows = []; state.insertRow = null; state.updateResult = [{ wa_id: 'x' }]; });

  it('isWarm true when last activity < 45 min', async () => {
    const { isWarm, WARM_WINDOW_MS } = await import('@/lib/cs/cs-session');
    expect(WARM_WINDOW_MS).toBe(45 * 60 * 1000);
    const now = Date.parse('2026-07-21T10:00:00Z');
    const warm = { last_activity_at: '2026-07-21T09:40:00Z' } as any;
    const cold = { last_activity_at: '2026-07-21T09:00:00Z' } as any;
    expect(isWarm(warm, now)).toBe(true);
    expect(isWarm(cold, now)).toBe(false);
  });

  it('createCsSession inserts an onboarding-phase row', async () => {
    const { createCsSession } = await import('@/lib/cs/cs-session');
    const row = await createCsSession('972500000000', 'contact-1');
    expect(state.insertRow).toMatchObject({ wa_id: '972500000000', contact_id: 'contact-1', phase: 'onboarding', version: 0 });
    expect(row.wa_id).toBe('972500000000');
  });

  it('saveCsSession returns true when a row was updated (version matched)', async () => {
    const { saveCsSession } = await import('@/lib/cs/cs-session');
    const prev = { wa_id: 'x', version: 2, phase: 'onboarding' } as any;
    const ok = await saveCsSession(prev, { phase: 'serving', active_account_id: 'acc-1' });
    expect(state.lastPatch).toMatchObject({ phase: 'serving', active_account_id: 'acc-1', version: 3 });
    expect(ok).toBe(true);
  });

  it('saveCsSession returns false on a version conflict (no rows updated)', async () => {
    state.updateResult = [];
    const { saveCsSession } = await import('@/lib/cs/cs-session');
    const ok = await saveCsSession({ wa_id: 'x', version: 2 } as any, { phase: 'serving' });
    expect(ok).toBe(false);
  });
});
```
- [ ] Step 2: Run `npx vitest run tests/unit/cs-session-store.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/cs-session'`.
- [ ] Step 3: Create `src/lib/cs/cs-session.ts`:
```ts
import { supabase as supabaseAdmin } from '@/lib/supabase';

// `phase` is a COARSE ANALYTICS HINT ONLY (onboarding|serving) — it does NOT gate the brain.
// The brain-led loop decides everything from the injected context digest.
export type CsPhase = 'onboarding' | 'serving';

export interface CsSessionContext {
  lastOrderRef?: string;
  lastBrandCandidates?: any[];
  [k: string]: unknown;
}

export interface CsSessionRow {
  wa_id: string;
  contact_id: string | null;
  phase: CsPhase;
  active_account_id: string | null;
  active_ticket_id: string | null;
  active_chat_session_id: string | null;
  customer_name: string | null;
  context: CsSessionContext;
  last_activity_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export const WARM_WINDOW_MS = 45 * 60 * 1000;

/** A session is "warm" if the last activity is within 45 min → continue silently, don't interrogate. */
export function isWarm(row: CsSessionRow, now: number = Date.now()): boolean {
  if (!row?.last_activity_at) return false;
  return now - Date.parse(row.last_activity_at) < WARM_WINDOW_MS;
}

export async function loadCsSession(waId: string): Promise<CsSessionRow | null> {
  const { data } = await supabaseAdmin
    .from('whatsapp_cs_sessions')
    .select('*')
    .eq('wa_id', waId)
    .maybeSingle();
  return (data as CsSessionRow) ?? null;
}

export async function createCsSession(waId: string, contactId: string | null): Promise<CsSessionRow> {
  const { data } = await supabaseAdmin
    .from('whatsapp_cs_sessions')
    .insert({
      wa_id: waId,
      contact_id: contactId,
      phase: 'onboarding',
      context: {},
      version: 0,
      last_activity_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  return data as CsSessionRow;
}

/**
 * Optimistic-concurrency update: WHERE wa_id = prev.wa_id AND version = prev.version, bumping
 * version by 1. Returns false when no row matched (a sibling drain won the race) so the caller
 * can reload + retry. Mirrors crm_agent_wa_state.
 */
export async function saveCsSession(prev: CsSessionRow, patch: Partial<CsSessionRow>): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('whatsapp_cs_sessions')
    .update({
      ...patch,
      version: prev.version + 1,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('wa_id', prev.wa_id)
    .eq('version', prev.version)
    .select('wa_id');
  return Array.isArray(data) && data.length > 0;
}
```
- [ ] Step 4: Run `npx vitest run tests/unit/cs-session-store.test.ts`. Expected PASS: 4 passed.
- [ ] Step 5: Commit:
```bash
git add src/lib/cs/cs-session.ts tests/unit/cs-session-store.test.ts
git commit -m "feat(cs): whatsapp_cs_sessions lightweight state store (phase hint, optimistic version, isWarm)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A10: `routeInboundToCustomerService` — the 4th-branch producer

**Files:**
- Create: `src/lib/cs/route-inbound-cs.ts`
- Test: `tests/unit/route-inbound-cs.test.ts`

**Interfaces:** Consumes: `sendReaction/sendTyping` (client.ts), `enqueueCsMessage/type CsJob` (A5), `publishCsDrain` (A6). Produces:
```ts
export function routeInboundToCustomerService(input: { waId: string; contactId: string | null; msg: any; textBody: string | null }): Promise<{ claimed: boolean }>;
```
Claims an unknown-sender message: instant `👀` reaction + typing, enqueue, `publishCsDrain`. Consumed by Task A11 (webhook wiring). Mirrors `maybeEnqueueAgentJob` (route.ts:346).

- [ ] Step 1: Write the failing test `tests/unit/route-inbound-cs.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendReaction = vi.fn();
const sendTyping = vi.fn();
const enqueue = vi.fn();
const publish = vi.fn();

vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendReaction: (...a: any[]) => sendReaction(...a),
  sendTyping: (...a: any[]) => sendTyping(...a),
}));
vi.mock('@/lib/cs/wa-cs-queue', () => ({ enqueueCsMessage: (...a: any[]) => enqueue(...a) }));
vi.mock('@/lib/cs/wa-cs-publish', () => ({ publishCsDrain: (...a: any[]) => publish(...a) }));

describe('routeInboundToCustomerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendReaction.mockResolvedValue(true);
    sendTyping.mockResolvedValue(true);
    enqueue.mockResolvedValue({ enqueued: true, queueLen: 1 });
    publish.mockResolvedValue(undefined);
  });

  it('claims the message: reaction + typing + enqueue + publish', async () => {
    const { routeInboundToCustomerService } = await import('@/lib/cs/route-inbound-cs');
    const r = await routeInboundToCustomerService({ waId: '972500000000', contactId: 'c1', msg: { id: 'm1' }, textBody: 'שלום' });
    expect(sendReaction).toHaveBeenCalledWith({ to: '972500000000', messageId: 'm1', emoji: '👀' });
    expect(sendTyping).toHaveBeenCalledWith('m1');
    expect(enqueue).toHaveBeenCalledWith({ waId: '972500000000', contactId: 'c1', msg: { id: 'm1' }, textBody: 'שלום' });
    expect(publish).toHaveBeenCalledWith('972500000000');
    expect(r).toEqual({ claimed: true });
  });

  it('still claimed when publish fails (next inbound drains it)', async () => {
    publish.mockRejectedValue(new Error('qstash down'));
    const { routeInboundToCustomerService } = await import('@/lib/cs/route-inbound-cs');
    const r = await routeInboundToCustomerService({ waId: 'x', contactId: null, msg: { id: 'm2' }, textBody: 'hi' });
    expect(r).toEqual({ claimed: true });
  });

  it('not claimed when Redis enqueue throws', async () => {
    enqueue.mockRejectedValue(new Error('redis down'));
    const { routeInboundToCustomerService } = await import('@/lib/cs/route-inbound-cs');
    const r = await routeInboundToCustomerService({ waId: 'x', contactId: null, msg: { id: 'm3' }, textBody: 'hi' });
    expect(r).toEqual({ claimed: false });
    expect(publish).not.toHaveBeenCalled();
  });
});
```
- [ ] Step 2: Run `npx vitest run tests/unit/route-inbound-cs.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/route-inbound-cs'`.
- [ ] Step 3: Create `src/lib/cs/route-inbound-cs.ts`:
```ts
import { sendReaction, sendTyping } from '@/lib/whatsapp-cloud/client';
import { enqueueCsMessage } from '@/lib/cs/wa-cs-queue';
import { publishCsDrain } from '@/lib/cs/wa-cs-publish';

/**
 * The 4th webhook branch: an inbound from an UNKNOWN sender (not Itamar, not a registered agent,
 * not an open ticket) is a customer-service shopper. Give instant feedback (👀 + typing), push the
 * message onto the per-shopper FIFO queue, and wake the drain worker. Returns claimed=true when the
 * message was queued (so the caller stops routing). Mirrors maybeEnqueueAgentJob (route.ts:346).
 */
export async function routeInboundToCustomerService(input: {
  waId: string;
  contactId: string | null;
  msg: any;
  textBody: string | null;
}): Promise<{ claimed: boolean }> {
  // Instant feedback — fire-and-forget so they add no latency. 👀 lands first; the worker swaps
  // it to ✅/⚠️ when the reply is ready. Typing also marks-as-read.
  if (input.msg?.id) {
    void sendReaction({ to: input.waId, messageId: input.msg.id, emoji: '👀' }).catch(() => {});
    void sendTyping(input.msg.id).catch(() => {});
  }

  try {
    await enqueueCsMessage({
      waId: input.waId,
      contactId: input.contactId,
      msg: input.msg,
      textBody: input.textBody,
    });
  } catch (e) {
    // Redis unreachable → we can't even queue it → leave the message in whatsapp_messages for triage.
    console.error('[cs] failed to enqueue CS message', e);
    return { claimed: false };
  }

  // Safely queued; wake the drain (bucket-dedup coalesces a burst to ~1 publish). If this throws,
  // the message still gets picked up by the next inbound's drain or the sweep cron — so don't fail.
  try { await publishCsDrain(input.waId); }
  catch (e) { console.error('[cs] publishCsDrain failed (queued; next trigger will drain)', e); }

  return { claimed: true };
}
```
- [ ] Step 4: Run `npx vitest run tests/unit/route-inbound-cs.test.ts`. Expected PASS: 3 passed.
- [ ] Step 5: Commit:
```bash
git add src/lib/cs/route-inbound-cs.ts tests/unit/route-inbound-cs.test.ts
git commit -m "feat(cs): routeInboundToCustomerService 4th-branch producer (claim + enqueue + drain)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task A11: Wire the 4th branch into `webhooks/whatsapp/route.ts`

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts` — add import (near line 30) and the 4th branch after the `routeInboundToTicket` guard (ends at line 284)
- Test: `tests/unit/whatsapp-webhook-cs-branch.test.ts`

**Interfaces:** Consumes: `routeInboundToCustomerService` (A10), and the existing `routeInboundToTicket` return `{ ticketId, matchedBy, ambiguous }`. Produces: the wired inbound flow — an unknown sender whose message did NOT match a ticket is claimed by CS.

The existing branch order is: Itamar → agent (`handledAsAgent`) → ticket (`routeInboundToTicket`). `routeInboundToTicket` currently returns void in the call site (line 274) but its real signature returns `{ ticketId: string | null; matchedBy?: string; ambiguous?: boolean }`. **Before relying on it, open `src/lib/whatsapp/route-inbound-ticket.ts` (or wherever `routeInboundToTicket` is defined) and confirm the return shape has a `ticketId` field** — if the real signature differs, adjust `extractTicketId` accordingly. Capture that return via the small exported `extractTicketId` helper; when no ticket matched (`ticketId === null`), invoke CS.

- [ ] Step 1: Write the failing integration-ish test `tests/unit/whatsapp-webhook-cs-branch.test.ts`. It tests the small extracted decision helper `maybeRouteCs` (added alongside the branch) so the routing logic is unit-testable without a full Meta payload:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const routeCs = vi.fn();
vi.mock('@/lib/cs/route-inbound-cs', () => ({ routeInboundToCustomerService: (...a: any[]) => routeCs(...a) }));

describe('maybeRouteCs (webhook 4th branch decision)', () => {
  beforeEach(() => { vi.clearAllMocks(); routeCs.mockResolvedValue({ claimed: true }); });

  it('routes to CS when not Itamar, not agent, and no ticket matched', async () => {
    const { maybeRouteCs } = await import('@/app/api/webhooks/whatsapp/route');
    await maybeRouteCs({ isItamar: false, handledAsAgent: false, ticketId: null, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).toHaveBeenCalledWith({ waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
  });

  it('does NOT route to CS when a ticket matched', async () => {
    const { maybeRouteCs } = await import('@/app/api/webhooks/whatsapp/route');
    await maybeRouteCs({ isItamar: false, handledAsAgent: false, ticketId: 'ticket-1', waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).not.toHaveBeenCalled();
  });

  it('does NOT route to CS for an agent or Itamar', async () => {
    const { maybeRouteCs } = await import('@/app/api/webhooks/whatsapp/route');
    await maybeRouteCs({ isItamar: false, handledAsAgent: true, ticketId: null, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    await maybeRouteCs({ isItamar: true, handledAsAgent: false, ticketId: null, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).not.toHaveBeenCalled();
  });
});

// Covers the ACTUAL wiring (Step 3c): the value captured from routeInboundToTicket's return
// is what drives the branch. This proves the {ticketId} assumption end-to-end.
describe('extractTicketId (routeInboundToTicket return capture)', () => {
  beforeEach(() => { vi.clearAllMocks(); routeCs.mockResolvedValue({ claimed: true }); });

  it('reads .ticketId off a real routeInboundToTicket result (and is null-safe)', async () => {
    const { extractTicketId } = await import('@/app/api/webhooks/whatsapp/route');
    expect(extractTicketId({ ticketId: 't1', matchedBy: 'phone', ambiguous: false })).toBe('t1');
    expect(extractTicketId({ ticketId: null })).toBeNull();
    expect(extractTicketId(undefined)).toBeNull();
    expect(extractTicketId(null)).toBeNull();
  });

  it('a matched ticketId captured from routeInboundToTicket suppresses CS routing', async () => {
    const { maybeRouteCs, extractTicketId } = await import('@/app/api/webhooks/whatsapp/route');
    const ticketMatch = extractTicketId({ ticketId: 'ticket-9' });   // stubbed routeInboundToTicket return
    await maybeRouteCs({ isItamar: false, handledAsAgent: false, ticketId: ticketMatch, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).not.toHaveBeenCalled();
  });

  it('a null ticketId captured from routeInboundToTicket falls through to CS', async () => {
    const { maybeRouteCs, extractTicketId } = await import('@/app/api/webhooks/whatsapp/route');
    const ticketMatch = extractTicketId({ ticketId: null });          // stubbed no-match return
    await maybeRouteCs({ isItamar: false, handledAsAgent: false, ticketId: ticketMatch, waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
    expect(routeCs).toHaveBeenCalledWith({ waId: 'x', contactId: 'c1', msg: { id: 'm1' }, textBody: 'hi' });
  });
});
```
- [ ] Step 2: Run `npx vitest run tests/unit/whatsapp-webhook-cs-branch.test.ts`. Expected FAIL: `maybeRouteCs is not a function` (not exported yet).
- [ ] Step 3a: Add the import after line 30 (`import { publishDrain } from '@/lib/crm/wa-queue';`) in `src/app/api/webhooks/whatsapp/route.ts`:
```ts
import { routeInboundToCustomerService } from '@/lib/cs/route-inbound-cs';
```
- [ ] Step 3b: Add the exported decision helpers near `maybeEnqueueAgentJob` (after line 375). These isolate the 4th-branch decision + the ticket-match capture so both are unit-testable:
```ts
/**
 * Capture routeInboundToTicket's return. Its real signature is
 * { ticketId: string | null; matchedBy?: string; ambiguous?: boolean } — we only need ticketId.
 * Null-safe: a void/undefined/null return (or a shape without ticketId) means "no ticket matched".
 */
export function extractTicketId(
  res: { ticketId?: string | null } | null | undefined,
): string | null {
  return res?.ticketId ?? null;
}

/**
 * The customer-service 4th branch. Reached only when the inbound is NOT Itamar, NOT a registered
 * agent, and did NOT match an open support ticket — the unknown-sender slot that used to dead-end.
 * Claims the message into the CS queue/worker pipeline. Best-effort: the raw message is already
 * persisted to whatsapp_messages, so a failure here just leaves it for manual triage.
 */
export async function maybeRouteCs(args: {
  isItamar: boolean;
  handledAsAgent: boolean;
  ticketId: string | null;
  waId: string;
  contactId: string | null;
  msg: any;
  textBody: string | null;
}): Promise<void> {
  if (args.isItamar || args.handledAsAgent || args.ticketId) return;
  try {
    await routeInboundToCustomerService({
      waId: args.waId,
      contactId: args.contactId,
      msg: args.msg,
      textBody: args.textBody,
    });
  } catch (err) {
    console.error('[whatsapp webhook] CS routing failed', err);
  }
}
```
- [ ] Step 3c: Replace the existing ticket-routing block at lines 272–284 so it captures the match result and falls through to CS. Change:
```ts
        if (!isItamarSender(waId) && !handledAsAgent) {
          try {
            await routeInboundToTicket({
              waId,
              textBody,
              contextId: msg.context?.id ?? null,
              waMessageId: msg.id,
              contactId: contact.id,
            });
          } catch (err) {
            console.error('[whatsapp webhook] support routing failed', err);
          }
        }
```
to:
```ts
        let ticketMatch: string | null = null;
        if (!isItamarSender(waId) && !handledAsAgent) {
          try {
            const res = await routeInboundToTicket({
              waId,
              textBody,
              contextId: msg.context?.id ?? null,
              waMessageId: msg.id,
              contactId: contact.id,
            });
            ticketMatch = extractTicketId(res);
          } catch (err) {
            console.error('[whatsapp webhook] support routing failed', err);
          }
        }

        // 4th branch — unknown sender, no open ticket → customer-service bot.
        await maybeRouteCs({
          isItamar: isItamarSender(waId),
          handledAsAgent,
          ticketId: ticketMatch,
          waId,
          contactId: contact.id,
          msg,
          textBody,
        });
```
- [ ] Step 4: Run `npx vitest run tests/unit/whatsapp-webhook-cs-branch.test.ts`. Expected PASS: 6 passed (3 `maybeRouteCs` + 3 `extractTicketId` wiring). Then run the full CS suite to confirm no regression: `npx vitest run tests/unit/cs-queue.test.ts tests/unit/cs-publish.test.ts tests/unit/cs-worker.test.ts tests/unit/cs-worker-route.test.ts tests/unit/cs-session-store.test.ts tests/unit/route-inbound-cs.test.ts tests/unit/wa-interactive-send.test.ts tests/unit/whatsapp-webhook-cs-branch.test.ts` — expected all passed. Also run `npm run type-check` (separate from build, per project convention) and confirm no NEW errors introduced by these files.
- [ ] Step 5: Commit:
```bash
git add src/app/api/webhooks/whatsapp/route.ts tests/unit/whatsapp-webhook-cs-branch.test.ts
git commit -m "feat(cs): wire the 4th webhook branch — unknown sender -> customer service

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

**Phase A exit state:** An unknown-sender WhatsApp message now flows: signature-verified webhook → `maybeRouteCs` → `routeInboundToCustomerService` (👀 + typing + enqueue on `cs:wa:<waId>:q` + `publishCsDrain`) → QStash → `/api/cs/wa-worker` (sig-verified) → `runCsDrain` (locked FIFO drain, 230s budget, forced continuation) → `processOneCsInbound` (done-guard → `runCsTurn` → reply dispatched by kind with 3x send-retry → ✅ reaction). The lightweight state table (`whatsapp_cs_sessions`, `phase` hint), the unified `brand_orders` store, and `chat_sessions.bot_paused*` are migrated live. The only unbuilt dependency is `runCsTurn` (`@/lib/cs/cs-agent`, the brain-led tool loop — dynamically imported and mocked in tests) — delivered in Phase C. Interactive send primitives are ready for the CS `show_buttons`/`show_list` tools.

---

# Phase B: Order Layer

This phase builds the entire read-only order subsystem that the CS bot uses to answer "where is my order?" questions: a platform-agnostic connector interface, the QuickShop + Shopify adapters, the unified `brand_orders` store, best-effort phone verification, the `lookupOrder` facade, the inbound QuickShop order webhook, and the backfill job. Every task is test-first (Vitest), every store call is read-only (the bot never calls QuickShop/Shopify write endpoints), and every DB call uses the service-role client `import { supabase as supabaseAdmin } from '@/lib/supabase'`.

**Prerequisite from Phase A:** migration `068_brand_orders.sql` (table `public.brand_orders`, unique `(account_id, order_number)`, indexes on `(account_id, order_number)` and `(account_id, customer_phone)`, nullable `line_items jsonb`) is already committed and applied to prod. All Phase B DB helpers assume that table exists.

**Registration pattern used throughout:** `registry.ts` holds an internal `Map<StorePlatform, OrderConnector>` with `registerConnector()` + `getConnector()`. Each adapter file self-registers at module load by calling `registerConnector(...)` at its bottom. Any consumer of `getConnector()` (the facade, the webhook, the backfill) does a side-effect import of the adapter modules at the top of its file so the map is populated before use. This keeps every task independently buildable and green.

---

## Phase B: Order Layer

### Task B1: Order connector types + registry

**Files:**
- Create `src/lib/orders/connectors/types.ts`
- Create `src/lib/orders/connectors/registry.ts`
- Test `tests/unit/order-registry.test.ts`

**Interfaces:**
Consumes: nothing (leaf module).
Produces:
- `type StorePlatform = 'quickshop' | 'shopify' | 'woocommerce' | 'magento'`
- `interface NormalizedLineItem { name: string; sku: string|null; quantity: number; price: string|null; total: string|null; imageUrl: string|null }`
- `interface NormalizedOrder { orderNumber; externalId; status; financialStatus; fulfillmentStatus; customerName; customerPhone; customerEmail; lineItems: NormalizedLineItem[]; trackingNumber; trackingUrl; total; currency; placedAt; raw }` (nullability per contract §1)
- `interface OrderConnectorCreds { platform: StorePlatform; apiKey?: string; shopDomain?: string; adminApiToken?: string; webhookSecret?: string; [k:string]: unknown }`
- `interface OrderConnector { platform; installMode; supportsDirectLookup; pull(creds, ref): Promise<NormalizedOrder|null>; list?(creds, cursor?): Promise<{orders: NormalizedOrder[]; next?: string}>; normalizeWebhook?(payload): NormalizedOrder; registerWebhooks?(creds, url, secret): Promise<void> }`
- `function registerConnector(c: OrderConnector): void` (registry.ts)
- `function getConnector(platform: StorePlatform): OrderConnector` — throws on unknown/unregistered (registry.ts)

Steps:

- [ ] Step 1: Write the failing test at `tests/unit/order-registry.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { registerConnector, getConnector } from '@/lib/orders/connectors/registry';
import type { OrderConnector } from '@/lib/orders/connectors/types';

const fakeQuickShop: OrderConnector = {
  platform: 'quickshop',
  installMode: 'manual_token',
  supportsDirectLookup: false,
  async pull() { return null; },
};

describe('order connector registry', () => {
  beforeEach(() => { registerConnector(fakeQuickShop); });

  it('returns a registered connector by platform', () => {
    expect(getConnector('quickshop')).toBe(fakeQuickShop);
    expect(getConnector('quickshop').supportsDirectLookup).toBe(false);
  });

  it('throws on an unregistered platform', () => {
    expect(() => getConnector('woocommerce')).toThrowError(/woocommerce/);
  });
});
```

- [ ] Step 2: Run the test to verify it fails:
`npx vitest run tests/unit/order-registry.test.ts`
Expected FAIL: `Failed to resolve import "@/lib/orders/connectors/registry"` (module does not exist yet).

- [ ] Step 3: Create `src/lib/orders/connectors/types.ts`:
```ts
// Canonical, platform-agnostic order shapes for the CS order layer (spec §7.2).
export type StorePlatform = 'quickshop' | 'shopify' | 'woocommerce' | 'magento';

export interface NormalizedLineItem {
  name: string;
  sku: string | null;
  quantity: number;
  price: string | null;   // per-unit, string-formatted
  total: string | null;   // line total
  imageUrl: string | null;
}

export interface NormalizedOrder {
  orderNumber: string;                 // human-facing (# stripped) → brand_orders.order_number
  externalId: string;                  // platform primary id → brand_orders.external_id
  status: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  lineItems: NormalizedLineItem[];     // [] when summary-only (list/backfill)
  trackingNumber: string | null;
  trackingUrl: string | null;
  total: string | null;
  currency: string | null;
  placedAt: string | null;             // ISO timestamp
  raw: unknown;                        // untouched platform payload → brand_orders.raw
}

// Per-account credentials from accounts.config.integrations.<platform>.
export interface OrderConnectorCreds {
  platform: StorePlatform;
  apiKey?: string;         // QuickShop qs_live_…
  shopDomain?: string;     // Shopify mystore.myshopify.com
  adminApiToken?: string;  // Shopify shpat_…
  webhookSecret?: string;  // HMAC secret for inbound order webhook
  [k: string]: unknown;
}

export interface OrderConnector {
  platform: StorePlatform;
  installMode: 'manual_token' | 'oauth' | 'platform_partner' | 'snippet';
  supportsDirectLookup: boolean;
  // Fetch ONE order fresh (full detail incl. line items). ref.id preferred; orderNumber fallback.
  pull(creds: OrderConnectorCreds, ref: { id?: string; orderNumber?: string }): Promise<NormalizedOrder | null>;
  // Backfill/sync paging. Present on QuickShop; absent on Shopify (direct lookup).
  list?(creds: OrderConnectorCreds, cursor?: string): Promise<{ orders: NormalizedOrder[]; next?: string }>;
  // Push feeders — map an inbound webhook body → NormalizedOrder.
  normalizeWebhook?(payload: unknown): NormalizedOrder;
  // Optional programmatic webhook registration (needs webhooks:write scope).
  registerWebhooks?(creds: OrderConnectorCreds, url: string, secret: string): Promise<void>;
}
```
Then create `src/lib/orders/connectors/registry.ts`:
```ts
// Registry keyed by platform. Adapters self-register at module load via registerConnector().
// Consumers of getConnector() must side-effect-import the adapter modules first.
import type { OrderConnector, StorePlatform } from './types';

const registry = new Map<StorePlatform, OrderConnector>();

export function registerConnector(connector: OrderConnector): void {
  registry.set(connector.platform, connector);
}

export function getConnector(platform: StorePlatform): OrderConnector {
  const connector = registry.get(platform);
  if (!connector) {
    throw new Error(`No order connector registered for platform: ${platform}`);
  }
  return connector;
}
```

- [ ] Step 4: Run the test to verify it passes:
`npx vitest run tests/unit/order-registry.test.ts`
Expected PASS: `2 passed`.

- [ ] Step 5: Commit:
```
git add src/lib/orders/connectors/types.ts src/lib/orders/connectors/registry.ts tests/unit/order-registry.test.ts
git commit -m "feat(orders): connector types + registry for CS order layer"
```

---

### Task B2: QuickShop adapter

**Files:**
- Create `src/lib/orders/connectors/quickshop.ts`
- Test `tests/unit/quickshop-adapter.test.ts`

**Interfaces:**
Consumes: `OrderConnector`, `OrderConnectorCreds`, `NormalizedOrder`, `NormalizedLineItem` from `./types`; `registerConnector` from `./registry`.
Produces:
- QuickShop wire types (exported): `QuickShopPagination`, `QuickShopListResponse<T>`, `QuickShopOrderSummary`, `QuickShopLineItem`, `QuickShopOrderDetail`, `QuickShopWebhookBody`.
- `const quickShopConnector: OrderConnector` with `pull` (GET `/orders/{id}`), `list` (paginated GET `/orders`), `normalizeWebhook` (webhook body → NormalizedOrder), `registerWebhooks` (POST `/webhooks`). `supportsDirectLookup = false`, `installMode = 'manual_token'`.
- Self-registers via `registerConnector(quickShopConnector)` at module load.

Steps:

- [ ] Step 1: Write the failing test at `tests/unit/quickshop-adapter.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { quickShopConnector, type QuickShopWebhookBody } from '@/lib/orders/connectors/quickshop';
import type { OrderConnectorCreds } from '@/lib/orders/connectors/types';

const creds: OrderConnectorCreds = { platform: 'quickshop', apiKey: 'qs_live_TEST' };

const detail = {
  id: 'ord_123',
  order_number: '#1042',
  customer_name: 'Dana Levi',
  customer_email: 'dana@example.com',
  customer_phone: '0501234567',
  financial_status: 'paid',
  fulfillment_status: 'fulfilled',
  status: 'open',
  tracking_number: 'FOCUS-77',
  tracking_url: 'https://track/77',
  total: '199.00',
  currency: 'ILS',
  created_at: '2026-07-01T10:00:00Z',
  line_items: [
    { id: 'li1', name: 'Argan Oil', sku: 'AO-1', quantity: 2, price: '49.50', total: '99.00', image_url: 'https://img/1' },
    { id: 'li2', name: 'Hair Mask', sku: null, quantity: 1, price: '100.00', total: '100.00', image_url: null },
  ],
};

describe('quickShopConnector', () => {
  beforeEach(() => { (global.fetch as any).mockReset?.(); });

  it('has the correct connector metadata', () => {
    expect(quickShopConnector.platform).toBe('quickshop');
    expect(quickShopConnector.supportsDirectLookup).toBe(false);
    expect(quickShopConnector.installMode).toBe('manual_token');
  });

  it('pull() maps GET /orders/{id} detail → NormalizedOrder', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => detail,
    });
    const order = await quickShopConnector.pull(creds, { id: 'ord_123' });
    expect(order).not.toBeNull();
    expect(order!.orderNumber).toBe('1042');        // '#' stripped
    expect(order!.externalId).toBe('ord_123');
    expect(order!.customerPhone).toBe('0501234567');
    expect(order!.trackingNumber).toBe('FOCUS-77');
    expect(order!.lineItems).toHaveLength(2);
    expect(order!.lineItems[0]).toEqual({
      name: 'Argan Oil', sku: 'AO-1', quantity: 2, price: '49.50', total: '99.00', imageUrl: 'https://img/1',
    });
    expect(order!.lineItems[1].sku).toBeNull();
    // read-only: never a mutating verb
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('pull() returns null on 404', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 404, headers: { get: () => null }, text: async () => '' });
    expect(await quickShopConnector.pull(creds, { id: 'missing' })).toBeNull();
  });

  it('list() maps a paginated summary page and exposes next cursor', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({
        data: [{ id: 'o1', order_number: '1000', customer_phone: '0500000000', total: 50, currency: 'ILS', created_at: '2026-06-01T00:00:00Z' }],
        meta: { pagination: { page: 1, limit: 100, total: 150, total_pages: 2, has_next: true, has_prev: false } },
      }),
    });
    const { orders, next } = await quickShopConnector.list!(creds);
    expect(orders).toHaveLength(1);
    expect(orders[0].orderNumber).toBe('1000');
    expect(orders[0].lineItems).toEqual([]);        // summary → no items
    expect(orders[0].total).toBe('50');             // number coerced to string
    expect(next).toBe('2');                          // next page number
  });

  it('normalizeWebhook() maps {event,data} detail body → NormalizedOrder', () => {
    const body: QuickShopWebhookBody = { event: 'order.updated', timestamp: '2026-07-02T00:00:00Z', data: detail as any };
    const order = quickShopConnector.normalizeWebhook!(body);
    expect(order.orderNumber).toBe('1042');
    expect(order.fulfillmentStatus).toBe('fulfilled');
    expect(order.lineItems).toHaveLength(2);
  });

  it('list() honors the X-RateLimit-* backoff branch when near-exhausted', async () => {
    // remaining<=1 && reset>0 → the adapter awaits the reset window before returning. A tiny
    // 0.01s reset keeps the test fast while still exercising the backoff branch.
    const headers = { get: (k: string) => (k === 'X-RateLimit-Remaining' ? '1' : k === 'X-RateLimit-Reset' ? '0.01' : null) };
    (global.fetch as any).mockResolvedValue({
      ok: true, status: 200, headers,
      json: async () => ({
        data: [{ id: 'o1', order_number: '2000', total: 10, currency: 'ILS', created_at: '2026-06-01T00:00:00Z' }],
        meta: { pagination: { page: 1, limit: 100, total: 100, total_pages: 1, has_next: false, has_prev: false } },
      }),
    });
    const { orders, next } = await quickShopConnector.list!(creds);
    expect(orders).toHaveLength(1); // still returns the page after honoring the reset window
    expect(next).toBeUndefined();
  });

  it('registerWebhooks() POSTs the order events + secret to /webhooks', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) });
    await quickShopConnector.registerWebhooks!(creds, 'https://cb/quickshop/tok', 'whsec');
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toContain('/webhooks');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body);
    expect(sent.url).toBe('https://cb/quickshop/tok');
    expect(sent.secret).toBe('whsec');
    expect(sent.events).toEqual(expect.arrayContaining(['order.created', 'order.updated', 'order.fulfilled']));
  });

  it('registerWebhooks() throws on a non-OK response', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 403, headers: { get: () => null }, text: async () => '' });
    await expect(quickShopConnector.registerWebhooks!(creds, 'https://cb', 's')).rejects.toThrow(/register failed/);
  });
});
```

- [ ] Step 2: Run the test to verify it fails:
`npx vitest run tests/unit/quickshop-adapter.test.ts`
Expected FAIL: `Failed to resolve import "@/lib/orders/connectors/quickshop"`.

- [ ] Step 3: Create `src/lib/orders/connectors/quickshop.ts`:
```ts
// QuickShop adapter (Argania v1). READ-ONLY: pull/list/webhook-ingest only.
// NEVER calls PATCH /orders, /edit-items, /fulfill, /cancel (spec D5).
import type { NormalizedLineItem, NormalizedOrder, OrderConnector, OrderConnectorCreds } from './types';
import { registerConnector } from './registry';

const QUICKSHOP_BASE = 'https://my-quickshop.com/api/v1';
const QUICKSHOP_TIMEOUT_MS = 8000;

// ---- Wire types (Appendix A) ----
export interface QuickShopPagination {
  page: number; limit: number; total: number; total_pages: number; has_next: boolean; has_prev: boolean;
}
export interface QuickShopListResponse<T> { data: T[]; meta: { pagination: QuickShopPagination }; }
export interface QuickShopOrderSummary {
  id: string; order_number: string;
  customer_name?: string | null; customer_email?: string | null; customer_phone?: string | null;
  financial_status?: string | null; fulfillment_status?: string | null; status?: string | null;
  total?: string | number | null; currency?: string | null; created_at?: string | null;
}
export interface QuickShopLineItem {
  id: string; name: string; sku?: string | null; quantity: number;
  price?: string | number | null; total?: string | number | null;
  image_url?: string | null; product_id?: string | null; variant_title?: string | null;
  properties?: { addons?: unknown; bundleComponents?: unknown; addonTotal?: unknown } | null;
}
export interface QuickShopOrderDetail extends QuickShopOrderSummary {
  customer_id?: string | null;
  line_items: QuickShopLineItem[];
  tracking_number?: string | null; tracking_url?: string | null;
  billing_address?: Record<string, unknown> & { phone?: string | null };
  shipping_address?: Record<string, unknown> & { phone?: string | null };
  updated_at?: string | null; note?: string | null;
}
export interface QuickShopWebhookBody { event: string; timestamp: string; data: QuickShopOrderDetail; }

// ---- helpers ----
const asString = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function qsHeaders(creds: OrderConnectorCreds): Record<string, string> {
  return { 'X-API-Key': creds.apiKey || '', 'Content-Type': 'application/json' };
}

async function qsFetch(creds: OrderConnectorCreds, path: string, init?: RequestInit): Promise<Response> {
  return Promise.race([
    fetch(`${QUICKSHOP_BASE}${path}`, { ...init, headers: { ...qsHeaders(creds), ...(init?.headers || {}) } }),
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('quickshop timeout')), QUICKSHOP_TIMEOUT_MS)),
  ]);
}

function mapLineItem(li: QuickShopLineItem): NormalizedLineItem {
  return {
    name: li.name,
    sku: li.sku ?? null,
    quantity: li.quantity,
    price: asString(li.price ?? null),
    total: asString(li.total ?? null),
    imageUrl: li.image_url ?? null,
  };
}

function mapSummary(o: QuickShopOrderSummary): NormalizedOrder {
  return {
    orderNumber: String(o.order_number).replace(/^#/, ''),
    externalId: String(o.id),
    status: o.status ?? null,
    financialStatus: o.financial_status ?? null,
    fulfillmentStatus: o.fulfillment_status ?? null,
    customerName: o.customer_name ?? null,
    customerPhone: o.customer_phone ?? null,
    customerEmail: o.customer_email ?? null,
    lineItems: [],
    trackingNumber: null,
    trackingUrl: null,
    total: asString(o.total ?? null),
    currency: o.currency ?? null,
    placedAt: o.created_at ?? null,
    raw: o,
  };
}

function mapDetail(d: QuickShopOrderDetail): NormalizedOrder {
  return {
    orderNumber: String(d.order_number).replace(/^#/, ''),
    externalId: String(d.id),
    status: d.status ?? null,
    financialStatus: d.financial_status ?? null,
    fulfillmentStatus: d.fulfillment_status ?? null,
    customerName: d.customer_name ?? null,
    customerPhone: d.customer_phone ?? d.shipping_address?.phone ?? d.billing_address?.phone ?? null,
    customerEmail: d.customer_email ?? null,
    lineItems: Array.isArray(d.line_items) ? d.line_items.map(mapLineItem) : [],
    trackingNumber: d.tracking_number ?? null,
    trackingUrl: d.tracking_url ?? null,
    total: asString(d.total ?? null),
    currency: d.currency ?? null,
    placedAt: d.created_at ?? null,
    raw: d,
  };
}

export const quickShopConnector: OrderConnector = {
  platform: 'quickshop',
  installMode: 'manual_token',
  supportsDirectLookup: false, // no working order_number filter → resolve via brand_orders

  async pull(creds, ref) {
    if (!ref.id) return null; // QuickShop detail lookup is by id only
    const res = await qsFetch(creds, `/orders/${encodeURIComponent(ref.id)}`);
    if (!res.ok) {
      if (res.status !== 404) console.warn('[quickshop.pull] non-OK', res.status);
      return null;
    }
    const detail = (await res.json().catch(() => null)) as QuickShopOrderDetail | null;
    if (!detail || !detail.id) return null;
    return mapDetail(detail);
  },

  async list(creds, cursor) {
    const page = cursor ? parseInt(cursor, 10) : 1;
    const res = await qsFetch(creds, `/orders?page=${page}&limit=100`);
    if (!res.ok) throw new Error(`quickshop list failed: ${res.status}`);
    // Honor the rate limit for the caller's next iteration.
    const remaining = Number(res.headers.get('X-RateLimit-Remaining') ?? '99');
    const resetSec = Number(res.headers.get('X-RateLimit-Reset') ?? '0');
    if (remaining <= 1 && resetSec > 0) {
      await new Promise((r) => setTimeout(r, Math.min(resetSec, 60) * 1000));
    }
    const body = (await res.json()) as QuickShopListResponse<QuickShopOrderSummary>;
    const orders = (body.data || []).map(mapSummary);
    const next = body.meta?.pagination?.has_next ? String(page + 1) : undefined;
    return { orders, next };
  },

  normalizeWebhook(payload) {
    const body = payload as QuickShopWebhookBody;
    return mapDetail(body.data);
  },

  async registerWebhooks(creds, url, secret) {
    // Webhook registration is not a store data write — permitted.
    const res = await qsFetch(creds, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({ url, events: ['order.created', 'order.updated', 'order.fulfilled'], secret }),
    });
    if (!res.ok) throw new Error(`quickshop webhook register failed: ${res.status}`);
  },
};

registerConnector(quickShopConnector);
```

- [ ] Step 4: Run the test to verify it passes:
`npx vitest run tests/unit/quickshop-adapter.test.ts`
Expected PASS: `8 passed` (metadata, pull, pull-404, list, normalizeWebhook, list-backoff, registerWebhooks-ok, registerWebhooks-throws).

- [ ] Step 5: Commit:
```
git add src/lib/orders/connectors/quickshop.ts tests/unit/quickshop-adapter.test.ts
git commit -m "feat(orders): read-only QuickShop connector (pull/list/webhook)"
```

---

### Task B3: Shopify adapter

**Files:**
- Create `src/lib/orders/connectors/shopify.ts`
- Test `tests/unit/shopify-adapter.test.ts`

**Interfaces:**
Consumes: `lookupShopifyOrder`, `OrderLookupResult`, `ShopifyIntegrationConfig` from `@/lib/shopify/order-lookup` (existing, `src/lib/shopify/order-lookup.ts:16/22/45`); `OrderConnector`, `OrderConnectorCreds`, `NormalizedOrder` from `./types`; `registerConnector` from `./registry`.
Produces:
- `const shopifyConnector: OrderConnector` — `supportsDirectLookup = true`, `installMode = 'oauth'`, no `list` (direct lookup, no backfill). `pull(creds, ref)` wraps `lookupShopifyOrder(cfg, ref.orderNumber, '')` and maps `OrderLookupResult` → `NormalizedOrder`.
- Self-registers via `registerConnector(shopifyConnector)`.

Note: `lookupShopifyOrder` filters on order name AND email server-side. In the CS flow the shopper is phone-verified separately, so `pull` passes an empty email; direct Shopify lookup by name still works when the store allows name-only, and full Shopify wiring is deferred (LA BEAUTÉ). The adapter must compile and map correctly today; behavior is validated when the Shopify token arrives.

Steps:

- [ ] Step 1: Write the failing test at `tests/unit/shopify-adapter.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/shopify/order-lookup', () => ({
  lookupShopifyOrder: vi.fn(),
}));

import { lookupShopifyOrder } from '@/lib/shopify/order-lookup';
import { shopifyConnector } from '@/lib/orders/connectors/shopify';
import type { OrderConnectorCreds } from '@/lib/orders/connectors/types';

const creds: OrderConnectorCreds = { platform: 'shopify', shopDomain: 'x.myshopify.com', adminApiToken: 'shpat_x' };

describe('shopifyConnector', () => {
  beforeEach(() => { (lookupShopifyOrder as any).mockReset(); });

  it('advertises direct lookup and has no list()', () => {
    expect(shopifyConnector.platform).toBe('shopify');
    expect(shopifyConnector.supportsDirectLookup).toBe(true);
    expect(shopifyConnector.list).toBeUndefined();
  });

  it('pull() maps an OrderLookupResult → NormalizedOrder', async () => {
    (lookupShopifyOrder as any).mockResolvedValue({
      found: true, orderNumber: '#1234', status: 'Shipped', placedAt: '2026-07-01T00:00:00Z',
      total: 'ILS199.00', itemSummary: '2× Argan Oil',
      trackingUrls: ['https://track/1'], trackingNumbers: ['TN1'], shippedAt: '2026-07-02T00:00:00Z', deliveredAt: null,
    });
    const order = await shopifyConnector.pull(creds, { orderNumber: '1234' });
    expect(order).not.toBeNull();
    expect(order!.orderNumber).toBe('1234');           // '#' stripped
    expect(order!.fulfillmentStatus).toBe('Shipped');
    expect(order!.trackingNumber).toBe('TN1');
    expect(order!.trackingUrl).toBe('https://track/1');
    expect(order!.total).toBe('ILS199.00');
  });

  it('pull() returns null when not found', async () => {
    (lookupShopifyOrder as any).mockResolvedValue({ found: false });
    expect(await shopifyConnector.pull(creds, { orderNumber: '9' })).toBeNull();
  });
});
```

- [ ] Step 2: Run the test to verify it fails:
`npx vitest run tests/unit/shopify-adapter.test.ts`
Expected FAIL: `Failed to resolve import "@/lib/orders/connectors/shopify"`.

- [ ] Step 3: Create `src/lib/orders/connectors/shopify.ts`:
```ts
// Shopify adapter (LA BEAUTÉ, deferred). Thin wrapper over the existing lookupShopifyOrder,
// which returns items + tracking in one direct call by order name. READ-ONLY.
import { lookupShopifyOrder, type OrderLookupResult, type ShopifyIntegrationConfig } from '@/lib/shopify/order-lookup';
import type { NormalizedOrder, OrderConnector, OrderConnectorCreds } from './types';
import { registerConnector } from './registry';

function credsToConfig(creds: OrderConnectorCreds): ShopifyIntegrationConfig {
  return {
    shop_domain: creds.shopDomain || '',
    admin_api_token: creds.adminApiToken || '',
    enabled: true,
  };
}

function mapResult(r: OrderLookupResult, ref: { orderNumber?: string }): NormalizedOrder | null {
  if (!r.found) return null;
  const number = (r.orderNumber || ref.orderNumber || '').replace(/^#/, '');
  return {
    orderNumber: number,
    externalId: number,           // Shopify direct lookup keys by name; no separate id surfaced
    status: r.status ?? null,
    financialStatus: null,
    fulfillmentStatus: r.status ?? null,
    customerName: null,
    customerPhone: null,          // OrderLookupResult sanitizes phone out; verification is upstream
    customerEmail: null,
    lineItems: [],                // itemSummary is a string; detailed items not exposed by the DTO
    trackingNumber: r.trackingNumbers?.[0] ?? null,
    trackingUrl: r.trackingUrls?.[0] ?? null,
    total: r.total ?? null,
    currency: null,
    placedAt: r.placedAt ?? null,
    raw: r,
  };
}

export const shopifyConnector: OrderConnector = {
  platform: 'shopify',
  installMode: 'oauth',
  supportsDirectLookup: true,      // by order name → no backfill needed

  async pull(creds, ref) {
    if (!ref.orderNumber) return null;
    const result = await lookupShopifyOrder(credsToConfig(creds), ref.orderNumber, '');
    return mapResult(result, ref);
  },
  // no list() — direct lookup means no backfill/sync paging.
};

registerConnector(shopifyConnector);
```

- [ ] Step 4: Run the test to verify it passes:
`npx vitest run tests/unit/shopify-adapter.test.ts`
Expected PASS: `3 passed`.

- [ ] Step 5: Commit:
```
git add src/lib/orders/connectors/shopify.ts tests/unit/shopify-adapter.test.ts
git commit -m "feat(orders): Shopify connector wrapping lookupShopifyOrder"
```

---

### Task B4: brand_orders store helpers

**Files:**
- Create `src/lib/orders/brand-orders.ts`
- Test `tests/unit/brand-orders.test.ts`

**Interfaces:**
Consumes: `supabase as supabaseAdmin` from `@/lib/supabase`; `NormalizedOrder`, `StorePlatform` from `./connectors/types`; `toWaId` from `@/lib/whatsapp-cloud/client` (`src/lib/whatsapp-cloud/client.ts:67`).
Produces:
- `interface BrandOrderRow { ... }` (contract §4 field set)
- `upsertBrandOrder(accountId: string, order: NormalizedOrder, platform: StorePlatform): Promise<void>` — upsert on conflict `(account_id, order_number)`, writes line_items (detail path).
- `upsertBrandOrders(accountId: string, orders: NormalizedOrder[], platform: StorePlatform): Promise<number>` — batch upsert of summaries; omits `line_items` so existing detail is preserved. Returns row count.
- `findBrandOrderByNumber(accountId: string, orderNumber: string): Promise<BrandOrderRow | null>`
- `findBrandOrdersByPhone(accountId: string, senderWaId: string): Promise<BrandOrderRow[]>` — matches `0`↔`+972` phone variants.

Steps:

- [ ] Step 1: Write the failing test at `tests/unit/brand-orders.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { upserts: [], lastConflict: null, byNumber: null, byPhoneRows: [], lastIn: null };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(_table: string) {
      const ctx: any = {};
      ctx.upsert = (rows: any, opts: any) => {
        state.upserts.push(...(Array.isArray(rows) ? rows : [rows]));
        state.lastConflict = opts?.onConflict ?? null;
        return Promise.resolve({ data: null, error: null });
      };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.in = (_col: string, vals: any[]) => { state.lastIn = vals; ctx._isPhone = true; return ctx; };
      ctx.maybeSingle = async () => ({ data: state.byNumber, error: null });
      ctx.then = (resolve: any) => resolve({ data: state.byPhoneRows, error: null });
      return ctx;
    },
  },
}));

import { upsertBrandOrder, upsertBrandOrders, findBrandOrderByNumber, findBrandOrdersByPhone } from '@/lib/orders/brand-orders';
import type { NormalizedOrder } from '@/lib/orders/connectors/types';

const base: NormalizedOrder = {
  orderNumber: '1042', externalId: 'ord_123', status: 'open', financialStatus: 'paid', fulfillmentStatus: 'fulfilled',
  customerName: 'Dana', customerPhone: '0501234567', customerEmail: 'd@x.com',
  lineItems: [{ name: 'Argan Oil', sku: 'AO-1', quantity: 2, price: '49.50', total: '99.00', imageUrl: null }],
  trackingNumber: 'TN1', trackingUrl: 'https://t/1', total: '199.00', currency: 'ILS', placedAt: '2026-07-01T00:00:00Z', raw: {},
};

describe('brand-orders helpers', () => {
  beforeEach(() => { state.upserts = []; state.lastConflict = null; state.byNumber = null; state.byPhoneRows = []; state.lastIn = null; });

  it('upsertBrandOrder writes line_items and uses (account_id, order_number) conflict target', async () => {
    await upsertBrandOrder('acc-1', base, 'quickshop');
    expect(state.lastConflict).toBe('account_id,order_number');
    const row = state.upserts[0];
    expect(row.account_id).toBe('acc-1');
    expect(row.order_number).toBe('1042');
    expect(row.source_platform).toBe('quickshop');
    expect(row.line_items).toHaveLength(1);
  });

  it('upsertBrandOrders omits line_items (summary preserve) and returns count', async () => {
    const n = await upsertBrandOrders('acc-1', [base, { ...base, orderNumber: '1043' }], 'quickshop');
    expect(n).toBe(2);
    expect(state.upserts[0]).not.toHaveProperty('line_items');
    expect(state.lastConflict).toBe('account_id,order_number');
  });

  it('findBrandOrderByNumber returns the row', async () => {
    state.byNumber = { id: 'r1', account_id: 'acc-1', order_number: '1042' };
    const row = await findBrandOrderByNumber('acc-1', '1042');
    expect(row?.order_number).toBe('1042');
  });

  it('findBrandOrdersByPhone queries 0↔+972 variants', async () => {
    state.byPhoneRows = [{ id: 'r1', account_id: 'acc-1', customer_phone: '0501234567' }];
    const rows = await findBrandOrdersByPhone('acc-1', '972501234567');
    expect(rows).toHaveLength(1);
    expect(state.lastIn).toEqual(expect.arrayContaining(['972501234567', '0501234567']));
  });
});
```

- [ ] Step 2: Run the test to verify it fails:
`npx vitest run tests/unit/brand-orders.test.ts`
Expected FAIL: `Failed to resolve import "@/lib/orders/brand-orders"`.

- [ ] Step 3: Create `src/lib/orders/brand-orders.ts`:
```ts
// brand_orders store helpers — the unified internal order cache (spec §7.1, §10.2).
// EVERY query is scoped by account_id. Service-role client (bypasses RLS).
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import type { NormalizedLineItem, NormalizedOrder, StorePlatform } from './connectors/types';

export interface BrandOrderRow {
  id: string;
  account_id: string;
  external_id: string | null;
  order_number: string;            // NOT NULL in brand_orders (migration 068) — always present
  customer_phone: string | null;
  customer_email: string | null;
  customer_name: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  status: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  total: string | null;
  currency: string | null;
  line_items: NormalizedLineItem[] | null;
  placed_at: string | null;
  source_platform: StorePlatform | null;
  raw: unknown;
  created_at: string;
  updated_at: string;
}

// Upsert conflict target. order_number is NOT NULL in brand_orders (migration 068): every connector
// (QuickShop/Shopify) always produces a NormalizedOrder.orderNumber, so a row without one is never
// ingested — a NULL here would be distinct in the unique index and silently duplicate instead of upsert.
const CONFLICT = 'account_id,order_number';

function baseRow(accountId: string, o: NormalizedOrder, platform: StorePlatform): Record<string, unknown> {
  return {
    account_id: accountId,
    external_id: o.externalId,
    order_number: o.orderNumber,
    customer_phone: o.customerPhone,
    customer_email: o.customerEmail,
    customer_name: o.customerName,
    financial_status: o.financialStatus,
    fulfillment_status: o.fulfillmentStatus,
    status: o.status,
    tracking_number: o.trackingNumber,
    tracking_url: o.trackingUrl,
    total: o.total,
    currency: o.currency,
    placed_at: o.placedAt,
    source_platform: platform,
    raw: o.raw,
    updated_at: new Date().toISOString(),
  };
}

/** Detail upsert (live pull + webhook) — writes line_items. */
export async function upsertBrandOrder(accountId: string, order: NormalizedOrder, platform: StorePlatform): Promise<void> {
  const row = { ...baseRow(accountId, order, platform), line_items: order.lineItems ?? null };
  const { error } = await supabaseAdmin.from('brand_orders').upsert(row, { onConflict: CONFLICT });
  if (error) throw new Error(`upsertBrandOrder failed: ${error.message}`);
}

/** Summary batch upsert (backfill) — OMITS line_items so any previously fetched detail is preserved. */
export async function upsertBrandOrders(accountId: string, orders: NormalizedOrder[], platform: StorePlatform): Promise<number> {
  if (!orders.length) return 0;
  const rows = orders.map((o) => baseRow(accountId, o, platform)); // no line_items key
  const { error } = await supabaseAdmin.from('brand_orders').upsert(rows, { onConflict: CONFLICT });
  if (error) throw new Error(`upsertBrandOrders failed: ${error.message}`);
  return rows.length;
}

export async function findBrandOrderByNumber(accountId: string, orderNumber: string): Promise<BrandOrderRow | null> {
  const clean = orderNumber.trim().replace(/^#/, '');
  const { data, error } = await supabaseAdmin
    .from('brand_orders')
    .select('*')
    .eq('account_id', accountId)
    .eq('order_number', clean)
    .maybeSingle();
  if (error) throw new Error(`findBrandOrderByNumber failed: ${error.message}`);
  return (data as BrandOrderRow) || null;
}

/** Best-effort phone lookup tolerant of 0↔+972 (matches stored raw + normalized forms). */
export async function findBrandOrdersByPhone(accountId: string, senderWaId: string): Promise<BrandOrderRow[]> {
  const e164 = toWaId(senderWaId);                       // e.g. 972501234567
  const local = e164.startsWith('972') ? '0' + e164.slice(3) : e164;  // 0501234567
  const variants = Array.from(new Set([senderWaId, e164, local, '+' + e164]));
  const { data, error } = await supabaseAdmin
    .from('brand_orders')
    .select('*')
    .eq('account_id', accountId)
    .in('customer_phone', variants);
  if (error) throw new Error(`findBrandOrdersByPhone failed: ${error.message}`);
  return (data as BrandOrderRow[]) || [];
}
```

- [ ] Step 4: Run the test to verify it passes:
`npx vitest run tests/unit/brand-orders.test.ts`
Expected PASS: `4 passed`.

- [ ] Step 5: Commit:
```
git add src/lib/orders/brand-orders.ts tests/unit/brand-orders.test.ts
git commit -m "feat(orders): brand_orders upsert/query helpers (account-scoped)"
```

---

### Task B5: phone-verify

**Files:**
- Create `src/lib/orders/phone-verify.ts`
- Test `tests/unit/phone-verify.test.ts`

**Interfaces:**
Consumes: `toWaId` from `@/lib/whatsapp-cloud/client`.
Produces:
- `phoneMatches(orderPhone: string | null | undefined, senderWaId: string): boolean` — reveal-when-absent policy: no order phone → `true`; otherwise `toWaId(orderPhone) === toWaId(senderWaId)` (tolerant of `0`↔`+972`).

Steps:

- [ ] Step 1: Write the failing test at `tests/unit/phone-verify.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { phoneMatches } from '@/lib/orders/phone-verify';

describe('phoneMatches (best-effort, reveal-when-absent)', () => {
  it('reveals when the order has no phone', () => {
    expect(phoneMatches(null, '972501234567')).toBe(true);
    expect(phoneMatches(undefined, '972501234567')).toBe(true);
    expect(phoneMatches('', '972501234567')).toBe(true);
  });

  it('matches a local 0-prefixed order phone against an E.164 sender', () => {
    expect(phoneMatches('0501234567', '972501234567')).toBe(true);
  });

  it('matches with +972 and spaces/dashes in the order phone', () => {
    expect(phoneMatches('+972-50-123-4567', '972501234567')).toBe(true);
  });

  it('rejects a genuinely different number', () => {
    expect(phoneMatches('0509999999', '972501234567')).toBe(false);
  });
});
```

- [ ] Step 2: Run the test to verify it fails:
`npx vitest run tests/unit/phone-verify.test.ts`
Expected FAIL: `Failed to resolve import "@/lib/orders/phone-verify"`.

- [ ] Step 3: Create `src/lib/orders/phone-verify.ts`:
```ts
// Best-effort phone verification (spec §8, D4). Reveal-when-absent:
// no phone on the order → allow; phone present → require a normalized match.
import { toWaId } from '@/lib/whatsapp-cloud/client';

export function phoneMatches(orderPhone: string | null | undefined, senderWaId: string): boolean {
  if (!orderPhone || !orderPhone.trim()) return true; // guest checkout / no phone → reveal
  return toWaId(orderPhone) === toWaId(senderWaId);
}
```

- [ ] Step 4: Run the test to verify it passes:
`npx vitest run tests/unit/phone-verify.test.ts`
Expected PASS: `4 passed`.

- [ ] Step 5: Commit:
```
git add src/lib/orders/phone-verify.ts tests/unit/phone-verify.test.ts
git commit -m "feat(orders): best-effort phone-match verification (0↔+972)"
```

---

### Task B6: lookupOrder facade + lookupOrdersByPhone

**Files:**
- Create `src/lib/orders/lookup.ts`
- Test `tests/unit/lookup-order.test.ts`

**Interfaces:**
Consumes: `supabase as supabaseAdmin` from `@/lib/supabase`; `findBrandOrderByNumber`, `findBrandOrdersByPhone`, `upsertBrandOrder`, `BrandOrderRow` from `./brand-orders`; `getConnector` from `./connectors/registry`; side-effect imports `./connectors/quickshop` and `./connectors/shopify` (self-registration); `phoneMatches` from `./phone-verify`; `OrderLookupResult` from `@/lib/shopify/order-lookup`; `getFocusShipmentStatus`, `FocusCustomerStatusView` from `@/lib/shipment/focus-client` (`src/lib/shipment/focus-client.ts:89/25`); `StorePlatform`, `NormalizedOrder`, `OrderConnectorCreds` from `./connectors/types`.
Produces:
- `type OrderLookupOutcome = (OrderLookupResult & { kind:'found'; lineItems?; shipment? }) | {kind:'not_found'} | {kind:'ambiguous'} | {kind:'unverified'}` — `kind` is the discriminator; the real order status stays on `OrderLookupResult.status`
- `lookupOrder(accountId: string, orderNumber: string, senderPhone: string): Promise<OrderLookupOutcome>`
- `lookupOrdersByPhone(accountId: string, senderPhone: string): Promise<OrderLookupResult[]>`

Steps:

- [ ] Step 1: Write the failing test at `tests/unit/lookup-order.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = { row: null as any, pull: null as any, config: {} as any };

vi.mock('@/lib/orders/brand-orders', () => ({
  findBrandOrderByNumber: vi.fn(async () => H.row),
  findBrandOrdersByPhone: vi.fn(async () => (H.row ? [H.row] : [])),
  upsertBrandOrder: vi.fn(async () => {}),
}));
vi.mock('@/lib/orders/connectors/quickshop', () => ({}));
vi.mock('@/lib/orders/connectors/shopify', () => ({}));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({ platform: 'quickshop', supportsDirectLookup: false, pull: async () => H.pull }),
}));
vi.mock('@/lib/shipment/focus-client', () => ({ getFocusShipmentStatus: vi.fn(async () => ({ found: true, statusText: 'delivered' })) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: H.config }, error: null }) }) }) }) },
}));

import { lookupOrder } from '@/lib/orders/lookup';

const row = (over: any = {}) => ({
  id: 'r1', account_id: 'acc-1', external_id: 'ord_123', order_number: '1042',
  customer_phone: '0501234567', customer_name: 'Dana', total: '199.00', status: 'open',
  fulfillment_status: 'fulfilled', tracking_number: 'TN1', tracking_url: 'https://t/1',
  placed_at: '2026-07-01T00:00:00Z', source_platform: 'quickshop', line_items: null, ...over,
});
const pull = (over: any = {}) => ({
  orderNumber: '1042', externalId: 'ord_123', status: 'open', financialStatus: 'paid', fulfillmentStatus: 'fulfilled',
  customerName: 'Dana', customerPhone: '0501234567', customerEmail: null,
  lineItems: [{ name: 'Argan Oil', sku: 'AO-1', quantity: 2, price: '49.50', total: '99.00', imageUrl: null }],
  trackingNumber: 'TN1', trackingUrl: 'https://t/1', total: '199.00', currency: 'ILS', placedAt: '2026-07-01T00:00:00Z', raw: {}, ...over,
});

describe('lookupOrder', () => {
  beforeEach(() => { H.row = null; H.pull = null; H.config = {}; });

  it('returns not_found when no brand_orders row', async () => {
    H.row = null;
    expect(await lookupOrder('acc-1', '9999', '972501234567')).toEqual({ kind: 'not_found' });
  });

  it('returns found with line items and the REAL order status when phone matches', async () => {
    H.row = row(); H.pull = pull();
    const out = await lookupOrder('acc-1', '1042', '972501234567');
    expect(out.kind).toBe('found');
    expect((out as any).found).toBe(true);
    expect((out as any).lineItems).toHaveLength(1);
    expect((out as any).orderNumber).toBe('1042');
    // The real fulfillment status survives — it is NOT overwritten by the 'found' discriminator.
    expect((out as any).status).toBe('fulfilled');
  });

  it('returns unverified when the order phone does not match the sender', async () => {
    H.row = row(); H.pull = pull({ customerPhone: '0509999999' });
    expect(await lookupOrder('acc-1', '1042', '972501234567')).toEqual({ kind: 'unverified' });
  });

  it('reveals when the order has no phone (guest checkout)', async () => {
    H.row = row({ customer_phone: null }); H.pull = pull({ customerPhone: null });
    const out = await lookupOrder('acc-1', '1042', '972501234567');
    expect(out.kind).toBe('found');
  });

  it('adds Focus shipment enrichment when configured', async () => {
    H.row = row(); H.pull = pull();
    H.config = { shipment_provider: { type: 'focus', host: 'focus.example', enabled: true } };
    const out = await lookupOrder('acc-1', '1042', '972501234567');
    expect((out as any).shipment).toEqual({ found: true, statusText: 'delivered' });
  });
});
```

- [ ] Step 2: Run the test to verify it fails:
`npx vitest run tests/unit/lookup-order.test.ts`
Expected FAIL: `Failed to resolve import "@/lib/orders/lookup"`.

- [ ] Step 3a: Create `src/lib/orders/lookup.ts` with the imports, the `OrderLookupOutcome` type, and the internal helpers (`loadConfig`, `credsFor`, `itemSummary`, `toResult`, `focusEnrich`):
```ts
// lookupOrder facade (spec §7.1): brand_orders → connector.pull (live) → phone-verify → Focus enrich.
// Side-effect imports register the adapters so getConnector() can resolve them.
import './connectors/quickshop';
import './connectors/shopify';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getConnector } from './connectors/registry';
import { findBrandOrderByNumber, findBrandOrdersByPhone, upsertBrandOrder, type BrandOrderRow } from './brand-orders';
import { phoneMatches } from './phone-verify';
import type { NormalizedLineItem, NormalizedOrder, OrderConnectorCreds, StorePlatform } from './connectors/types';
import type { OrderLookupResult } from '@/lib/shopify/order-lookup';
import { getFocusShipmentStatus, type FocusCustomerStatusView } from '@/lib/shipment/focus-client';

export type OrderLookupOutcome =
  // `kind` is the discriminator; the REAL order status remains on OrderLookupResult.status.
  | (OrderLookupResult & { kind: 'found'; lineItems?: NormalizedLineItem[]; shipment?: FocusCustomerStatusView | null })
  | { kind: 'not_found' }
  | { kind: 'ambiguous' }
  | { kind: 'unverified' };

async function loadConfig(accountId: string): Promise<any> {
  const { data, error } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).single();
  if (error || !data) return {};
  return (data as any).config || {};
}

function credsFor(platform: StorePlatform, config: any): OrderConnectorCreds {
  const integrations = config?.integrations || {};
  if (platform === 'shopify') {
    const s = integrations.shopify || {};
    return { platform, shopDomain: s.shop_domain, adminApiToken: s.admin_api_token };
  }
  const q = integrations.quickshop || {};
  return { platform, apiKey: q.api_key, webhookSecret: q.webhook_secret };
}

function itemSummary(items: NormalizedLineItem[]): string | undefined {
  if (!items.length) return undefined;
  return items.slice(0, 4).map((i) => `${i.quantity}× ${i.name}`).join(', ')
    + (items.length > 4 ? `, +${items.length - 4} more` : '');
}

function toResult(o: NormalizedOrder): OrderLookupResult & { lineItems: NormalizedLineItem[] } {
  return {
    found: true,
    orderNumber: o.orderNumber,
    status: o.fulfillmentStatus || o.status || undefined,
    placedAt: o.placedAt || undefined,
    total: o.total || undefined,
    itemSummary: itemSummary(o.lineItems),
    trackingUrls: o.trackingUrl ? [o.trackingUrl] : undefined,
    trackingNumbers: o.trackingNumber ? [o.trackingNumber] : undefined,
    lineItems: o.lineItems,
  };
}

async function focusEnrich(config: any, trackingNumber: string | null): Promise<FocusCustomerStatusView | null> {
  const sp = config?.shipment_provider;
  if (!sp?.enabled || sp.type !== 'focus' || !sp.host || !trackingNumber) return null;
  try {
    return await getFocusShipmentStatus({
      host: sp.host,
      reference: trackingNumber,
      customerCode: sp.expected_master_customer_id,
      expectedMasterCustomerId: sp.expected_master_customer_id,
    });
  } catch (e) {
    console.warn('[lookupOrder] focus enrichment failed', (e as Error).message);
    return null;
  }
}
```
- [ ] Step 3b: Append `lookupOrder` (validated by the not_found / found / unverified / guest-checkout / Focus-enrichment cases):
```ts
export async function lookupOrder(accountId: string, orderNumber: string, senderPhone: string): Promise<OrderLookupOutcome> {
  const row = await findBrandOrderByNumber(accountId, orderNumber);
  if (!row || !row.source_platform) return { kind: 'not_found' };

  const config = await loadConfig(accountId);
  const platform = row.source_platform as StorePlatform;
  const connector = getConnector(platform);
  const creds = credsFor(platform, config);

  // Refresh live: one call, always current. Fall back to the cached row if the pull fails.
  let fresh: NormalizedOrder | null = null;
  try {
    fresh = await connector.pull(creds, { id: row.external_id || undefined, orderNumber: row.order_number || undefined });
  } catch (e) {
    console.warn('[lookupOrder] pull failed, using cached row', (e as Error).message);
  }
  if (fresh) {
    try { await upsertBrandOrder(accountId, fresh, platform); } catch { /* cache write best-effort */ }
  }

  const orderPhone = fresh?.customerPhone ?? row.customer_phone;
  if (!phoneMatches(orderPhone, senderPhone)) return { kind: 'unverified' };

  const normalized: NormalizedOrder = fresh ?? {
    orderNumber: row.order_number || orderNumber,
    externalId: row.external_id || '',
    status: row.status, financialStatus: row.financial_status, fulfillmentStatus: row.fulfillment_status,
    customerName: row.customer_name, customerPhone: row.customer_phone, customerEmail: row.customer_email,
    lineItems: row.line_items || [],
    trackingNumber: row.tracking_number, trackingUrl: row.tracking_url,
    total: row.total, currency: row.currency, placedAt: row.placed_at, raw: row.raw,
  };

  const result = toResult(normalized);
  const shipment = await focusEnrich(config, normalized.trackingNumber);
  // `kind:'found'` is the discriminator; `result.status` carries the REAL order status (from toResult).
  return { ...result, shipment, kind: 'found' };
}
```
- [ ] Step 3c: Append `lookupOrdersByPhone` (proactive-by-phone; consumed by the C4 `lookup_orders_by_phone` tool):
```ts
export async function lookupOrdersByPhone(accountId: string, senderPhone: string): Promise<OrderLookupResult[]> {
  const rows = await findBrandOrdersByPhone(accountId, senderPhone);
  return rows.map((r: BrandOrderRow) => ({
    found: true,
    orderNumber: r.order_number || undefined,
    status: r.fulfillment_status || r.status || undefined,
    placedAt: r.placed_at || undefined,
    total: r.total || undefined,
    itemSummary: r.line_items ? itemSummary(r.line_items) : undefined,
    trackingNumbers: r.tracking_number ? [r.tracking_number] : undefined,
    trackingUrls: r.tracking_url ? [r.tracking_url] : undefined,
  }));
}
```

- [ ] Step 4: Run the test to verify it passes:
`npx vitest run tests/unit/lookup-order.test.ts`
Expected PASS: `5 passed`.

- [ ] Step 5: Commit:
```
git add src/lib/orders/lookup.ts tests/unit/lookup-order.test.ts
git commit -m "feat(orders): lookupOrder facade with phone-verify + Focus enrichment"
```

---

### Task B7: QuickShop order webhook receiver

**Files:**
- Create `src/app/api/webhooks/quickshop/[accountToken]/route.ts`
- Test `tests/unit/quickshop-webhook.test.ts`

**Interfaces:**
Consumes: `supabase as supabaseAdmin` from `@/lib/supabase`; `getConnector` from `@/lib/orders/connectors/registry`; side-effect import `@/lib/orders/connectors/quickshop`; `upsertBrandOrder` from `@/lib/orders/brand-orders`; `createHmac`, `timingSafeEqual` from `crypto`.
Produces: `POST(req, ctx: { params: Promise<{ accountToken: string }> })`. Behavior mirrors the shipping webhook: resolve brand by `config.integrations.quickshop.webhook_token` (path token, JSONB equality), HMAC-verify raw body against `config.integrations.quickshop.webhook_secret` (`X-Webhook-Signature: sha256=<hex>`), `normalizeWebhook` → `upsertBrandOrder`. Bad token → 404, invalid signature → 401, no secret configured → skip verification, everything else → 200.

The route factors the exact `verifySignature` helper out of the shipping webhook (`src/app/api/webhooks/shipping/[accountToken]/route.ts:55`) so the HMAC contract stays identical. To make the handler unit-testable without HTTP, extract the core into a pure `handleQuickShopWebhook(rawBody, sigHeader, accountToken, deps)` function; the `POST` wrapper reads the request and calls it with real deps.

Steps:

- [ ] Step 1: Write the failing test at `tests/unit/quickshop-webhook.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

const H: any = { account: null, upserts: [] };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: H.account, error: null }) }) }) }),
  },
}));
vi.mock('@/lib/orders/connectors/quickshop', () => ({}));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({ normalizeWebhook: (b: any) => ({ orderNumber: String(b.data.order_number), externalId: String(b.data.id), lineItems: [] }) }),
}));
vi.mock('@/lib/orders/brand-orders', () => ({
  upsertBrandOrder: vi.fn(async (accId: string, o: any) => { H.upserts.push({ accId, o }); }),
}));

import { handleQuickShopWebhook } from '@/app/api/webhooks/quickshop/[accountToken]/route';

const body = JSON.stringify({ event: 'order.updated', timestamp: 't', data: { id: 'ord_9', order_number: '1042' } });
const sign = (b: string, secret: string) => 'sha256=' + createHmac('sha256', secret).update(b, 'utf8').digest('hex');

describe('handleQuickShopWebhook', () => {
  beforeEach(() => { H.account = null; H.upserts = []; });

  it('404s on an unknown token', async () => {
    H.account = null;
    const r = await handleQuickShopWebhook(body, null, 'nope');
    expect(r.status).toBe(404);
  });

  it('401s on an invalid signature when a secret is configured', async () => {
    H.account = { id: 'acc-1', config: { integrations: { quickshop: { webhook_token: 'tok', webhook_secret: 's3cret' } } } };
    const r = await handleQuickShopWebhook(body, 'sha256=deadbeef', 'tok');
    expect(r.status).toBe(401);
    expect(H.upserts).toHaveLength(0);
  });

  it('upserts and 200s on a valid signature', async () => {
    H.account = { id: 'acc-1', config: { integrations: { quickshop: { webhook_token: 'tok', webhook_secret: 's3cret' } } } };
    const r = await handleQuickShopWebhook(body, sign(body, 's3cret'), 'tok');
    expect(r.status).toBe(200);
    expect(H.upserts[0].accId).toBe('acc-1');
    expect(H.upserts[0].o.orderNumber).toBe('1042');
  });

  it('skips verification and 200s when no secret configured', async () => {
    H.account = { id: 'acc-1', config: { integrations: { quickshop: { webhook_token: 'tok' } } } };
    const r = await handleQuickShopWebhook(body, null, 'tok');
    expect(r.status).toBe(200);
    expect(H.upserts).toHaveLength(1);
  });
});
```

- [ ] Step 2: Run the test to verify it fails:
`npx vitest run tests/unit/quickshop-webhook.test.ts`
Expected FAIL: `Failed to resolve import "@/app/api/webhooks/quickshop/[accountToken]/route"`.

- [ ] Step 3: Create `src/app/api/webhooks/quickshop/[accountToken]/route.ts`:
```ts
/**
 * QuickShop order webhook — HMAC-verified, per-account. Mirrors the shipping webhook.
 * Body: { event, timestamp, data } (top field `event`). Signature: X-Webhook-Signature: sha256=<hmac(raw)>.
 * Resolve brand by config.integrations.quickshop.webhook_token. READ-ONLY store side: we only ingest.
 * Bad token → 404; invalid signature → 401; no secret → skip; else → 200.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getConnector } from '@/lib/orders/connectors/registry';
import '@/lib/orders/connectors/quickshop';
import { upsertBrandOrder } from '@/lib/orders/brand-orders';

export const runtime = 'nodejs';
export const maxDuration = 30;

function verifySignature(rawBody: string, header: string | null, secret: string | null): boolean | null {
  if (!secret) return null;              // not configured → skip
  if (!header) return false;
  const [algo, provided] = header.split('=');
  if (algo !== 'sha256' || !provided) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function handleQuickShopWebhook(
  rawBody: string,
  sigHeader: string | null,
  accountToken: string,
): Promise<{ status: number; body: unknown }> {
  let payload: any;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return { status: 400, body: { error: 'bad_json' } };
  }

  const { data: account } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .eq('config->integrations->quickshop->>webhook_token', accountToken)
    .maybeSingle();

  if (!account) return { status: 404, body: { error: 'unknown_token' } };

  const secret = (account as any).config?.integrations?.quickshop?.webhook_secret || null;
  const sig = verifySignature(rawBody, sigHeader, secret);
  if (sig === false) return { status: 401, body: { error: 'invalid_signature' } };

  try {
    const normalized = getConnector('quickshop').normalizeWebhook!(payload);
    await upsertBrandOrder((account as any).id, normalized, 'quickshop');
  } catch (e) {
    console.warn('[quickshop-webhook] ingest failed', (e as Error).message);
    // Still 200 — avoid provider retry storms; error is logged.
  }
  return { status: 200, body: { ok: true } };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ accountToken: string }> }) {
  const { accountToken } = await ctx.params;
  const rawBody = await req.text();
  const sigHeader = req.headers.get('x-webhook-signature');
  const { status, body } = await handleQuickShopWebhook(rawBody, sigHeader, accountToken);
  return NextResponse.json(body, { status });
}
```

- [ ] Step 4: Run the test to verify it passes:
`npx vitest run tests/unit/quickshop-webhook.test.ts`
Expected PASS: `4 passed`.

- [ ] Step 5: Commit:
```
git add "src/app/api/webhooks/quickshop/[accountToken]/route.ts" tests/unit/quickshop-webhook.test.ts
git commit -m "feat(orders): HMAC-verified QuickShop order webhook → brand_orders"
```

---

### Task B8: QuickShop backfill job + runner route

**Files:**
- Create `src/lib/orders/backfill.ts`
- Create `src/app/api/cs/orders-backfill/route.ts`
- Test `tests/unit/orders-backfill.test.ts`

**Interfaces:**
Consumes: `supabase as supabaseAdmin` from `@/lib/supabase`; `getConnector` from `./connectors/registry`; side-effect import `./connectors/quickshop`; `upsertBrandOrders` from `./brand-orders`; `StorePlatform`, `OrderConnectorCreds` from `./connectors/types`; in the route: `verifyQStashSignature` from `@/lib/pipeline/qstash` (`src/lib/pipeline/qstash.ts:24`).
Produces:
- `backfillAccountOrders(accountId: string, opts?: { maxPages?: number }): Promise<{ imported: number; pages: number }>` — reads creds from `accounts.config.integrations.quickshop`, paginates `connector.list`, upserts summaries via `upsertBrandOrders`, stops when `next` is undefined or `maxPages` reached. The adapter's `list` already backs off on `X-RateLimit-*`; backfill adds a small inter-page delay guard.
- `POST /api/cs/orders-backfill` — QStash-signature-verified; body `{ accountId }` → runs `backfillAccountOrders`.

Steps:

- [ ] Step 1: Write the failing test at `tests/unit/orders-backfill.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H: any = { config: {}, pages: [], upserted: 0 };

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: H.config }, error: null }) }) }) }) },
}));
vi.mock('@/lib/orders/connectors/quickshop', () => ({}));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({
    list: async (_creds: any, cursor?: string) => H.pages[cursor ? parseInt(cursor, 10) - 1 : 0],
  }),
}));
vi.mock('@/lib/orders/brand-orders', () => ({
  upsertBrandOrders: vi.fn(async (_acc: string, orders: any[]) => { H.upserted += orders.length; return orders.length; }),
}));
const verifyQStash = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({ verifyQStashSignature: (...a: any[]) => verifyQStash(...a) }));

import { backfillAccountOrders } from '@/lib/orders/backfill';

function req(body: any) {
  return { text: async () => JSON.stringify(body), headers: { get: () => 'sig' } } as any;
}

describe('backfillAccountOrders', () => {
  beforeEach(() => { H.config = { integrations: { quickshop: { api_key: 'qs_live_x', enabled: true } } }; H.pages = []; H.upserted = 0; });

  it('paginates all pages and upserts every summary', async () => {
    H.pages = [
      { orders: [{ orderNumber: '1' }, { orderNumber: '2' }], next: '2' },
      { orders: [{ orderNumber: '3' }], next: undefined },
    ];
    const r = await backfillAccountOrders('acc-1');
    expect(r.pages).toBe(2);
    expect(r.imported).toBe(3);
    expect(H.upserted).toBe(3);
  });

  it('honors maxPages', async () => {
    H.pages = [
      { orders: [{ orderNumber: '1' }], next: '2' },
      { orders: [{ orderNumber: '2' }], next: '3' },
      { orders: [{ orderNumber: '3' }], next: undefined },
    ];
    const r = await backfillAccountOrders('acc-1', { maxPages: 1 });
    expect(r.pages).toBe(1);
    expect(r.imported).toBe(1);
  });

  it('throws when quickshop is not configured', async () => {
    H.config = { integrations: {} };
    await expect(backfillAccountOrders('acc-1')).rejects.toThrow(/quickshop/i);
  });
});

describe('POST /api/cs/orders-backfill', () => {
  beforeEach(() => {
    H.config = { integrations: { quickshop: { api_key: 'qs_live_x', enabled: true } } };
    H.pages = [{ orders: [{ orderNumber: '1' }], next: undefined }];
    H.upserted = 0;
    verifyQStash.mockResolvedValue(true);
  });

  it('401s on a bad QStash signature (no backfill)', async () => {
    verifyQStash.mockResolvedValue(false);
    const { POST } = await import('@/app/api/cs/orders-backfill/route');
    const res = await POST(req({ accountId: 'acc-1' }));
    expect(res.status).toBe(401);
    expect(H.upserted).toBe(0);
  });

  it('400s when accountId is missing', async () => {
    const { POST } = await import('@/app/api/cs/orders-backfill/route');
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('200s and runs the backfill when signed with an accountId', async () => {
    const { POST } = await import('@/app/api/cs/orders-backfill/route');
    const res = await POST(req({ accountId: 'acc-1' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.imported).toBe(1);
  });
});
```

- [ ] Step 2: Run the test to verify it fails:
`npx vitest run tests/unit/orders-backfill.test.ts`
Expected FAIL: `Failed to resolve import "@/lib/orders/backfill"` (and `.../orders-backfill/route`).

- [ ] Step 3: Create `src/lib/orders/backfill.ts`:
```ts
// One-off QuickShop backfill: paginate GET /orders summaries into brand_orders (spec §7.3).
// Line items are NOT backfilled (lazy-filled on live pull). Rate limit honored by the adapter's list().
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getConnector } from './connectors/registry';
import './connectors/quickshop';
import { upsertBrandOrders } from './brand-orders';
import type { OrderConnectorCreds } from './connectors/types';

const INTER_PAGE_DELAY_MS = 200; // gentle guard on top of the adapter's X-RateLimit-* backoff

export async function backfillAccountOrders(
  accountId: string,
  opts: { maxPages?: number } = {},
): Promise<{ imported: number; pages: number }> {
  const { data, error } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).single();
  if (error || !data) throw new Error(`account not found: ${accountId}`);
  const qs = ((data as any).config?.integrations?.quickshop) || null;
  if (!qs?.api_key) throw new Error('quickshop integration not configured (missing api_key)');

  const creds: OrderConnectorCreds = { platform: 'quickshop', apiKey: qs.api_key, webhookSecret: qs.webhook_secret };
  const connector = getConnector('quickshop');
  if (!connector.list) throw new Error('quickshop connector has no list()');

  const maxPages = opts.maxPages ?? Infinity;
  let cursor: string | undefined = undefined;
  let imported = 0;
  let pages = 0;

  do {
    const { orders, next } = await connector.list(creds, cursor);
    imported += await upsertBrandOrders(accountId, orders, 'quickshop');
    pages += 1;
    cursor = next;
    if (cursor && pages < maxPages) await new Promise((r) => setTimeout(r, INTER_PAGE_DELAY_MS));
  } while (cursor && pages < maxPages);

  return { imported, pages };
}
```
Then create `src/app/api/cs/orders-backfill/route.ts`:
```ts
// QStash-triggered (or admin) backfill runner. Body: { accountId }.
import { NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/pipeline/qstash';
import { backfillAccountOrders } from '@/lib/orders/backfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }
  const accountId = String(body?.accountId || '');
  if (!accountId) return NextResponse.json({ error: 'missing accountId' }, { status: 400 });

  try {
    const result = await backfillAccountOrders(accountId);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] Step 4: Run the test to verify it passes:
`npx vitest run tests/unit/orders-backfill.test.ts`
Expected PASS: `6 passed` (3 `backfillAccountOrders` + 3 route: 401 / 400 / 200).

- [ ] Step 5: Commit:
```
git add src/lib/orders/backfill.ts src/app/api/cs/orders-backfill/route.ts tests/unit/orders-backfill.test.ts
git commit -m "feat(orders): QuickShop backfill job + QStash-verified runner route"
```

---

### Task B9: Admin integrations route — QuickShop platform + Shopify field reconcile

**Files:**
- Modify `src/app/api/admin/accounts/[accountId]/integrations/route.ts` (PUT handler at lines 65–129; token merge at 100–109; GET masking at 52–62)
- Test `tests/unit/admin-integrations.test.ts`

**Interfaces:**
Consumes: existing `requireAdminAuth`, `createClient` (from `@/lib/supabase/server`). No new exports; behavior change only.
Produces (behavioral contract the CS order layer relies on):
- Shopify writes MUST land on `admin_api_token` (the field `lookupShopifyOrder` reads), reconciling the current `api_token` mismatch. The route continues to accept `api_token` in the request body but persists it as `admin_api_token` for `platform === 'shopify'`.
- QuickShop writes accept `api_key`, `webhook_secret`, and `webhook_token` (the path token the webhook resolves on) and persist them under `config.integrations.quickshop`. These secret fields are masked on GET.

Scope note (see the "PROVISIONING (v1, manual)" Global Constraint): this route intentionally covers ONLY the `config.integrations.{quickshop,shopify}` credentials. The CS-enablement blocks — `config.whatsapp_cs.{enabled,aliases,order_source,greeting}` and `config.escalation.{recipients,triggers,...}` — are set by manual SQL for v1; there is no endpoint for them here, by design.

To keep this testable, extract the config-merge logic into a pure, exported `buildIntegrationPatch(platform, existing, body)` and have `PUT` call it. The test targets the pure function; the HTTP wrapper is unchanged glue.

Steps:

- [ ] Step 1: Write the failing test at `tests/unit/admin-integrations.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildIntegrationPatch } from '@/app/api/admin/accounts/[accountId]/integrations/route';

describe('buildIntegrationPatch', () => {
  it('persists a Shopify token as admin_api_token (reconciles the mismatch)', () => {
    const next = buildIntegrationPatch('shopify', {}, { shop_domain: 'x.myshopify.com', api_token: 'shpat_ABC', enabled: true });
    expect(next.admin_api_token).toBe('shpat_ABC');
    expect(next.shop_domain).toBe('x.myshopify.com');
    expect(next.enabled).toBe(true);
  });

  it('does not overwrite a stored Shopify token when a masked value is sent', () => {
    const next = buildIntegrationPatch('shopify', { admin_api_token: 'shpat_OLD' }, { api_token: '••••ABC', enabled: true });
    expect(next.admin_api_token).toBe('shpat_OLD');
  });

  it('persists QuickShop api_key, webhook_secret and webhook_token', () => {
    const next = buildIntegrationPatch('quickshop', {}, { api_key: 'qs_live_X', webhook_secret: 'whs', webhook_token: 'tok', enabled: true });
    expect(next.api_key).toBe('qs_live_X');
    expect(next.webhook_secret).toBe('whs');
    expect(next.webhook_token).toBe('tok');
    expect(next.enabled).toBe(true);
  });

  it('leaves QuickShop secrets untouched when omitted', () => {
    const next = buildIntegrationPatch('quickshop', { api_key: 'qs_live_OLD', webhook_secret: 'oldwhs' }, { enabled: false });
    expect(next.api_key).toBe('qs_live_OLD');
    expect(next.webhook_secret).toBe('oldwhs');
    expect(next.enabled).toBe(false);
  });
});
```

- [ ] Step 2: Run the test to verify it fails:
`npx vitest run tests/unit/admin-integrations.test.ts`
Expected FAIL: `buildIntegrationPatch is not a function` (or import resolution error — the function does not exist yet).

- [ ] Step 3: Edit `src/app/api/admin/accounts/[accountId]/integrations/route.ts`. First, add the exported pure helper directly above the `PUT` export (after the `maskToken` function, around line 31):
```ts
/**
 * Build the merged integration config for a platform.
 * - Shopify: writes admin_api_token (the field lookupShopifyOrder reads) from the UI's api_token.
 * - QuickShop: writes api_key / webhook_secret / webhook_token.
 * Secret fields are only overwritten when a fresh, non-masked value is provided.
 */
export function buildIntegrationPatch(
  platform: Platform,
  existing: Record<string, any>,
  body: Record<string, any>,
): Record<string, any> {
  const fresh = (v: unknown): v is string =>
    typeof v === 'string' && v.trim() !== '' && !v.startsWith('••••');

  const next: Record<string, any> = {
    ...existing,
    shop_domain: typeof body.shop_domain === 'string' ? body.shop_domain.trim() : existing.shop_domain || '',
    enabled: body.enabled === true,
  };

  if (platform === 'shopify') {
    // Reconcile: the admin UI sends `api_token`; the lookup reads `admin_api_token`.
    if (fresh(body.api_token)) next.admin_api_token = body.api_token.trim();
    else if (fresh(body.admin_api_token)) next.admin_api_token = body.admin_api_token.trim();
  } else if (platform === 'quickshop') {
    if (fresh(body.api_key)) next.api_key = body.api_key.trim();
    if (fresh(body.webhook_secret)) next.webhook_secret = body.webhook_secret.trim();
    if (typeof body.webhook_token === 'string' && body.webhook_token.trim()) next.webhook_token = body.webhook_token.trim();
  } else {
    if (fresh(body.api_token)) next.api_token = body.api_token.trim();
  }

  return next;
}
```
Then replace the inline `next` construction inside `PUT` (current lines 100–109) with a call to the helper:
```ts
  const next = buildIntegrationPatch(platform, existing, body);
```
Finally, extend the GET masking loop (lines 54–61) so QuickShop / Shopify secrets are masked too — replace the loop body with:
```ts
  for (const [platform, cfg] of Object.entries(integrations)) {
    const c = (cfg || {}) as any;
    safe[platform] = {
      ...c,
      api_token: maskToken(c.api_token),
      admin_api_token: maskToken(c.admin_api_token),
      api_key: maskToken(c.api_key),
      webhook_secret: maskToken(c.webhook_secret),
      has_token: !!(c.api_token || c.admin_api_token || c.api_key),
    };
  }
```

- [ ] Step 4: Run the test to verify it passes:
`npx vitest run tests/unit/admin-integrations.test.ts`
Expected PASS: `4 passed`. Then run a type-check to confirm the route still compiles: `npm run type-check` (no new errors from this file).

- [ ] Step 5: Commit:
```
git add "src/app/api/admin/accounts/[accountId]/integrations/route.ts" tests/unit/admin-integrations.test.ts
git commit -m "fix(admin): persist Shopify admin_api_token + QuickShop keys in integrations"
```

---

### Phase B exit check

Run the full Phase B suite to confirm every order-layer unit is green before Phase C consumes `lookupOrder`:
```
npx vitest run tests/unit/order-registry.test.ts tests/unit/quickshop-adapter.test.ts tests/unit/shopify-adapter.test.ts tests/unit/brand-orders.test.ts tests/unit/phone-verify.test.ts tests/unit/lookup-order.test.ts tests/unit/quickshop-webhook.test.ts tests/unit/orders-backfill.test.ts tests/unit/admin-integrations.test.ts
```
Expected: all files pass. The order layer is now complete: `getConnector('quickshop'|'shopify')` resolves read-only adapters, `brand_orders` is fed by webhook + backfill, `lookupOrder(accountId, orderNumber, senderPhone)` returns `{kind:'found'|'not_found'|'unverified'|'ambiguous'}` (the `found` variant keeps the real order status on `.status`) with line items and optional Focus shipment, and admin-saved credentials land on the field names the runtime actually reads. **Operational note (spec §13):** rotate the Argania `qs_live_…` key after wiring — it was live during design.

---

Now I have everything needed. Here is the complete Phase C plan.

## Phase C: Brain — the brain-led tool-calling loop

This phase turns the queued CS inbound (Phase A) and the order layer (Phase B) into an actual conversation, run **entirely by Bestie's LLM as a tool-calling loop** (spec D8 — NOT a scripted FSM). It teaches the brain a `'whatsapp'` mode (C3), builds the brand-grounded system prompt (persona + RAG + re-entry digest, C5), exposes the **CS tool set** with code-enforced gates (C4), and runs the loop (`runCsTurn`, C6) that lets the model converse in its own voice and call tools — dispatching the resulting reply (text or WhatsApp interactive) back through the worker (C7). The deterministic operations + security gates live in the tools; the *conversation* lives in the brain.

**Phase C consumes from earlier phases** (treat as already-built, importable):
- Phase A — `src/lib/cs/cs-session.ts`: `loadCsSession`, `createCsSession`, `saveCsSession`, `isWarm`, `WARM_WINDOW_MS`, types `CsSessionRow`, `CsPhase`, `CsSessionContext`. `src/lib/cs/wa-cs-worker.ts`: `processOneCsInbound` (already a FULL implementation from Task A8 — done-guard, dynamic `runCsTurn`, kind dispatch, 3× send-retry, ✅/⚠️ reaction; C7 only finalizes its body: static `runCsTurn` import + `wa_message_id` return). `src/lib/whatsapp-cloud/client.ts`: `sendText`, `sendInteractiveButtons`, `sendInteractiveList`, `sendReaction`, `toWaId`, types `WhatsAppSendResult`, `InteractiveButton`, `InteractiveRow`, `InteractiveSection`. Type `CsJob` from `src/lib/cs/wa-cs-queue.ts`.
- Phase B — `src/lib/orders/lookup.ts`: `lookupOrder(accountId, orderNumber, senderPhone)`, `lookupOrdersByPhone(accountId, senderPhone)`, type `OrderLookupOutcome`, `OrderLookupResultLike`.

**PHASE ORDERING NOTE (forward-deps on Phase D):** the CS tools (C4) and the loop (C6) call Phase-D **mechanics** — `openOrAttachCsTicket` (D1), `detectHandoff` (D2), `pauseBot`/`isBotPaused` (D3), `runCsHandoffCheck` (D4). To keep the DAG honest they are **dynamically imported** inside the handlers/loop and **mocked in the C4/C6 unit tests** — exactly mirroring how Phase A's worker consumes this Phase-C loop (A8 dynamic-imports `runCsTurn`). Phase D builds the real mechanics; **build Phase D before end-to-end/deploy.**

**Grounding facts (verified this session):**
- `mode` union lives in three places: `src/lib/chatbot/sandwichBot.ts:54`, `src/lib/chatbot/archetypes/index.ts:131`, `src/lib/chatbot/archetypes/types.ts:111`. `baseArchetype.ts:726` branches on `input.mode === 'dm'`; we map `'whatsapp'`→`'dm'` at the `archetype.process` call so `baseArchetype.ts` needs no edit.
- Only in-brain `mode` branch is `sandwichBot.ts:189` (`if (input.mode === 'dm')`).
- Service-role client: `import { supabase as supabaseAdmin } from '@/lib/supabase'`.
- `chat_sessions.id` is UUID → `randomUUID()` for new sessions (a string id silently fails to persist).
- `SandwichBotOutput.response` ALWAYS ends with `<<SUGGESTIONS>>…<</SUGGESTIONS>>` — stripping is mandatory before WhatsApp.
- `sendText({ to, body, contextMessageId? })`; `buildPersonalityFromDB(accountId)` from `personality-wrapper.ts`; `shouldUpdateSummary(count)` + `updateRollingSummary(sessionId, msgs)` from `conversation-memory.ts`.
- Tests: Vitest, jsdom, `@`→`./src`, `global.fetch` already a `vi.fn()` from `tests/setup.ts`. Run one file: `npx vitest run tests/unit/<file>.test.ts`. Declare `vi.mock()` before `await import()`.

---

### Task C1: Brand Resolver (`src/lib/cs/brand-resolver.ts`)

**Files:**
- Create: `src/lib/cs/brand-resolver.ts`
- Test: `tests/unit/cs-brand-resolver.test.ts`

**Interfaces:**
Consumes: `import { supabase as supabaseAdmin } from '@/lib/supabase'` (query `accounts` where `config.whatsapp_cs.enabled = true`).
Produces:
- `interface BrandCandidate { accountId: string; displayName: string; username: string; domain: string | null; score: number }`
- `interface BrandResolution { kind: 'none' | 'single' | 'multi'; candidates: BrandCandidate[] }`
- `function listCsEnabledBrands(): Promise<BrandCandidate[]>` (score always 0 here; it's the vocabulary source)
- `function resolveBrand(query: string, opts?: { preferAccountIds?: string[] }): Promise<BrandResolution>`
- Exported pure helper `function trigramSimilarity(a: string, b: string): number` (0..1) for reuse + testing.

Steps:

- [ ] Step 1: Write the failing test. Create `tests/unit/cs-brand-resolver.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Two CS-enabled brands, one CS-disabled (must be excluded).
const ROWS = [
  { id: 'acc-argania', config: {
    username: 'argania', display_name: 'Argania',
    whatsapp_cs: { enabled: true, aliases: ['ארגניה', 'argan'] },
    widget: { domain: 'argania-oil.co.il' },
  } },
  { id: 'acc-labeaute', config: {
    username: 'labeaute', display_name: 'LA BEAUTÉ',
    whatsapp_cs: { enabled: true, aliases: ['לה בוטה'] },
    domain: 'labeaute.co.il',
  } },
  { id: 'acc-off', config: {
    username: 'studiopasha', display_name: 'Studio Pasha',
    whatsapp_cs: { enabled: false },
  } },
];

// Hand-rolled chainable Supabase fake. The resolver fetches CS-enabled rows
// via a JSONB filter; our fake returns only the two enabled rows.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const ctx: any = {};
      ctx.select = () => ctx;
      ctx.filter = () => ctx;
      ctx.eq = () => ctx;
      ctx.then = (resolve: any) =>
        resolve({ data: ROWS.filter((r) => r.config?.whatsapp_cs?.enabled === true), error: null });
      return ctx;
    },
  },
}));

describe('brand-resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('trigramSimilarity is 1 for identical, 0 for disjoint', async () => {
    const { trigramSimilarity } = await import('@/lib/cs/brand-resolver');
    expect(trigramSimilarity('argania', 'argania')).toBe(1);
    expect(trigramSimilarity('argania', 'zzzzzz')).toBe(0);
  });

  it('listCsEnabledBrands returns only enabled brands', async () => {
    const { listCsEnabledBrands } = await import('@/lib/cs/brand-resolver');
    const brands = await listCsEnabledBrands();
    expect(brands.map((b) => b.accountId).sort()).toEqual(['acc-argania', 'acc-labeaute']);
  });

  it('exact English match → single, high score', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('argania');
    expect(r.kind).toBe('single');
    expect(r.candidates[0].accountId).toBe('acc-argania');
    expect(r.candidates[0].score).toBeGreaterThan(0.8);
  });

  it('Hebrew alias match resolves to the right brand', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('ארגניה');
    expect(r.kind).toBe('single');
    expect(r.candidates[0].accountId).toBe('acc-argania');
  });

  it('misspelling still matches above threshold', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    // A genuine typo (transposed letters), NOT the exact spelling — proves the trigram matcher's
    // fuzzy tolerance, its core value.
    const r = await resolveBrand('argnaia');
    expect(r.candidates[0].accountId).toBe('acc-argania');
    expect(r.candidates[0].score).toBeGreaterThan(0.34); // > MATCH_THRESHOLD
  });

  it('no similarity → none', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('qwertyphone');
    expect(r.kind).toBe('none');
    expect(r.candidates).toEqual([]);
  });

  it('preferAccountIds pulls a returning brand to the front on a tie', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    // Ambiguous-ish query touching both; preference decides ordering.
    const r = await resolveBrand('la', { preferAccountIds: ['acc-labeaute'] });
    expect(r.candidates[0].accountId).toBe('acc-labeaute');
  });
});
```

- [ ] Step 2: Run test to verify it fails: `npx vitest run tests/unit/cs-brand-resolver.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/brand-resolver'`.

- [ ] Step 3: Write minimal implementation. Create `src/lib/cs/brand-resolver.ts`:
```ts
import { supabase as supabaseAdmin } from '@/lib/supabase';

export interface BrandCandidate {
  accountId: string;
  displayName: string;
  username: string;
  domain: string | null;
  score: number; // 0..1 fuzzy similarity
}

export interface BrandResolution {
  kind: 'none' | 'single' | 'multi';
  candidates: BrandCandidate[];
}

// Confidence cut-offs for the disambiguation policy (§6.3).
const MATCH_THRESHOLD = 0.34; // below this a term is not a candidate at all
const SINGLE_THRESHOLD = 0.62; // one candidate this strong AND clear of #2 → confirm directly
const MAX_MULTI = 5; // interactive list cap

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function trigrams(s: string): Set<string> {
  const t = ` ${normalize(s)} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

// Dice coefficient over character trigrams: language-agnostic (works for Hebrew + English).
export function trigramSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

function toCandidate(row: any): BrandCandidate {
  const cfg = row.config || {};
  const cs = cfg.whatsapp_cs || {};
  const domain = cfg.widget?.domain || cfg.domain || null;
  return {
    accountId: row.id,
    displayName: cfg.display_name || cfg.username || row.id,
    username: cfg.username || '',
    domain,
    score: 0,
  };
}

// Vocabulary strings a query is matched against for one brand.
function vocabularyOf(row: any): string[] {
  const cfg = row.config || {};
  const cs = cfg.whatsapp_cs || {};
  const vocab: string[] = [];
  if (cfg.display_name) vocab.push(cfg.display_name);
  if (cfg.username) vocab.push(cfg.username);
  if (Array.isArray(cs.aliases)) vocab.push(...cs.aliases);
  const domain = cfg.widget?.domain || cfg.domain;
  if (domain) vocab.push(String(domain).replace(/\.[a-z.]+$/i, '')); // strip TLD
  return vocab.filter(Boolean);
}

async function fetchCsEnabledRows(): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .filter('config->whatsapp_cs->>enabled', 'eq', 'true');
  if (error) {
    console.warn('[brand-resolver] fetch failed', error);
    return [];
  }
  return (data as any[]) || [];
}

export async function listCsEnabledBrands(): Promise<BrandCandidate[]> {
  const rows = await fetchCsEnabledRows();
  return rows.map(toCandidate);
}

export async function resolveBrand(
  query: string,
  opts?: { preferAccountIds?: string[] },
): Promise<BrandResolution> {
  const q = normalize(query);
  if (!q) return { kind: 'none', candidates: [] };

  const rows = await fetchCsEnabledRows();
  const prefer = new Set(opts?.preferAccountIds || []);

  const scored: BrandCandidate[] = rows
    .map((row) => {
      const best = Math.max(0, ...vocabularyOf(row).map((v) => trigramSimilarity(q, v)));
      const c = toCandidate(row);
      c.score = best;
      return c;
    })
    .filter((c) => c.score >= MATCH_THRESHOLD)
    .sort((a, b) => {
      // Returning-memory preference wins ties (and near-ties within 0.05).
      const ap = prefer.has(a.accountId) ? 1 : 0;
      const bp = prefer.has(b.accountId) ? 1 : 0;
      if (Math.abs(a.score - b.score) < 0.05 && ap !== bp) return bp - ap;
      return b.score - a.score;
    })
    .slice(0, MAX_MULTI);

  if (scored.length === 0) return { kind: 'none', candidates: [] };

  const top = scored[0];
  const second = scored[1];
  const clearLead = !second || top.score - second.score >= 0.12;
  if (scored.length === 1 || (top.score >= SINGLE_THRESHOLD && clearLead)) {
    return { kind: 'single', candidates: [top] };
  }
  return { kind: 'multi', candidates: scored };
}
```

- [ ] Step 4: Run test to verify it passes: `npx vitest run tests/unit/cs-brand-resolver.test.ts`. Expected PASS: 7 passed.

- [ ] Step 5: Commit:
```bash
git add src/lib/cs/brand-resolver.ts tests/unit/cs-brand-resolver.test.ts
git commit -m "feat(cs): brand resolver — fuzzy 0/1/N over CS-enabled brands"
```

---

### Task C2: Interactive Payload Builders (`src/lib/cs/interactive.ts`)

> **Role in the brain-led model:** the LIVE interactive path is the `show_buttons` / `show_list` tools (C4), which the brain calls with its own content. These named builders (`buildBrandConfirmButtons`, `buildBrandDisambiguationList`, `buildThreadReentryList`, `buildSingleThreadButtons`) remain as **optional convenience constructors** for the common CS shapes (brand-confirm, disambiguation, thread re-entry) — a brand can pre-format these, or a future refactor can have the tools reuse them. Building + testing them here keeps the shapes (WhatsApp title/desc limits, row-id conventions like `brand_<accountId>` / `thread_<ticketId>`) documented and validated; they are not on the critical path.

**Files:**
- Create: `src/lib/cs/interactive.ts`
- Test: `tests/unit/cs-interactive.test.ts`

**Interfaces:**
Consumes: `BrandCandidate` from `@/lib/cs/brand-resolver` (C1); interactive send param shapes from Phase A client (`InteractiveButton`, `InteractiveRow`, `InteractiveSection`). `CsReply` mirrors the `WaInteractive` variants the `show_*` tools emit (contract §8).
Produces:
- `type CsReply` (mirrors the `show_*` tool / loop reply variants): `{ kind:'text'; body:string } | { kind:'buttons'; body:string; buttons:InteractiveButton[]; header?:string; footer?:string } | { kind:'list'; body:string; buttonLabel:string; sections:InteractiveSection[]; header?:string; footer?:string } | { kind:'none' }`
- `function buildBrandDisambiguationList(candidates: BrandCandidate[], body?: string): CsReply` (kind 'list', row ids `brand_<accountId>`, plus a trailing `➕ פנייה חדשה`-less variant — see below)
- `function buildBrandConfirmButtons(candidate: BrandCandidate): CsReply` (kind 'buttons', ids `confirm_yes` / `confirm_no`)
- `function buildThreadReentryList(threads: Array<{ ticketId: string; brandName: string; topic: string }>): CsReply` (kind 'list', row ids `thread_<ticketId>`, plus `➕ פנייה חדשה` row id `thread_new`)
- `function buildSingleThreadButtons(brandName: string, topic: string): CsReply` (ids `reentry_continue` / `reentry_other`)

Steps:

- [ ] Step 1: Write the failing test. Create `tests/unit/cs-interactive.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  buildBrandDisambiguationList,
  buildBrandConfirmButtons,
  buildThreadReentryList,
  buildSingleThreadButtons,
} from '@/lib/cs/interactive';

describe('cs interactive builders', () => {
  it('disambiguation list encodes accountId into row ids and truncates titles', () => {
    const r = buildBrandDisambiguationList([
      { accountId: 'acc-1', displayName: 'Argania', username: 'argania', domain: 'argania-oil.co.il', score: 0.9 },
      { accountId: 'acc-2', displayName: 'A Very Long Brand Name That Exceeds Limit', username: 'x', domain: null, score: 0.7 },
    ]);
    expect(r.kind).toBe('list');
    if (r.kind !== 'list') return;
    const rows = r.sections.flatMap((s) => s.rows);
    expect(rows[0].id).toBe('brand_acc-1');
    expect(rows[1].title.length).toBeLessThanOrEqual(24);
    expect(r.buttonLabel.length).toBeLessThanOrEqual(20);
  });

  it('confirm buttons carry yes/no ids and brand name + domain in body', () => {
    const r = buildBrandConfirmButtons({
      accountId: 'acc-1', displayName: 'Argania', username: 'argania', domain: 'argania-oil.co.il', score: 0.9,
    });
    expect(r.kind).toBe('buttons');
    if (r.kind !== 'buttons') return;
    expect(r.buttons.map((b) => b.id)).toEqual(['confirm_yes', 'confirm_no']);
    expect(r.body).toContain('Argania');
    expect(r.body).toContain('argania-oil.co.il');
    expect(r.buttons.length).toBeLessThanOrEqual(3);
  });

  it('reentry list appends a "new inquiry" row', () => {
    const r = buildThreadReentryList([
      { ticketId: 't1', brandName: 'Argania', topic: 'שאלה על מוצר' },
      { ticketId: 't2', brandName: 'LA BEAUTÉ', topic: 'מוצר פגום' },
    ]);
    expect(r.kind).toBe('list');
    if (r.kind !== 'list') return;
    const rows = r.sections.flatMap((s) => s.rows);
    expect(rows.map((x) => x.id)).toContain('thread_new');
    expect(rows[0].id).toBe('thread_t1');
  });

  it('single-thread buttons use continue/other ids', () => {
    const r = buildSingleThreadButtons('LA BEAUTÉ', 'מוצר פגום');
    expect(r.kind).toBe('buttons');
    if (r.kind !== 'buttons') return;
    expect(r.buttons.map((b) => b.id)).toEqual(['reentry_continue', 'reentry_other']);
  });
});
```

- [ ] Step 2: Run test to verify it fails: `npx vitest run tests/unit/cs-interactive.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/interactive'`.

- [ ] Step 3: Write minimal implementation. Create `src/lib/cs/interactive.ts`:
```ts
import type { BrandCandidate } from '@/lib/cs/brand-resolver';
import type { InteractiveButton, InteractiveRow, InteractiveSection } from '@/lib/whatsapp-cloud/client';

// The reply shape the show_* tools emit / the loop returns; the worker sends it by kind (C7).
export type CsReply =
  | { kind: 'text'; body: string }
  | { kind: 'buttons'; body: string; buttons: InteractiveButton[]; header?: string; footer?: string }
  | { kind: 'list'; body: string; buttonLabel: string; sections: InteractiveSection[]; header?: string; footer?: string }
  | { kind: 'none' };

// WhatsApp hard limits (recon): row.title<=24, row.desc<=72, button.title<=20, list buttonLabel<=20.
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + '…');

export function buildBrandDisambiguationList(candidates: BrandCandidate[], body?: string): CsReply {
  const rows: InteractiveRow[] = candidates.slice(0, 10).map((c) => ({
    id: `brand_${c.accountId}`,
    title: clip(c.displayName, 24),
    description: c.domain ? clip(c.domain, 72) : undefined,
  }));
  return {
    kind: 'list',
    body: body || 'לאיזה מותג לפנות?',
    buttonLabel: clip('בחירת מותג', 20),
    sections: [{ title: 'מותגים', rows }],
  };
}

export function buildBrandConfirmButtons(candidate: BrandCandidate): CsReply {
  const label = candidate.domain ? `${candidate.displayName} (${candidate.domain})` : candidate.displayName;
  return {
    kind: 'buttons',
    body: `מדובר ב-${label}?`,
    buttons: [
      { id: 'confirm_yes', title: clip('כן', 20) },
      { id: 'confirm_no', title: clip('לא, מותג אחר', 20) },
    ],
  };
}

export function buildThreadReentryList(
  threads: Array<{ ticketId: string; brandName: string; topic: string }>,
): CsReply {
  const rows: InteractiveRow[] = threads.slice(0, 9).map((t) => ({
    id: `thread_${t.ticketId}`,
    title: clip(t.brandName, 24),
    description: clip(t.topic, 72),
  }));
  rows.push({ id: 'thread_new', title: clip('➕ פנייה חדשה', 24) });
  return {
    kind: 'list',
    body: 'במה נמשיך?',
    buttonLabel: clip('המשך שיחה', 20),
    sections: [{ title: 'הפניות שלך', rows }],
  };
}

export function buildSingleThreadButtons(brandName: string, topic: string): CsReply {
  return {
    kind: 'buttons',
    body: `ממשיכים עם ${brandName} – ${topic}?`,
    buttons: [
      { id: 'reentry_continue', title: clip('כן, ממשיכים', 20) },
      { id: 'reentry_other', title: clip('משהו אחר', 20) },
    ],
  };
}
```

- [ ] Step 4: Run test to verify it passes: `npx vitest run tests/unit/cs-interactive.test.ts`. Expected PASS: 4 passed.

- [ ] Step 5: Commit:
```bash
git add src/lib/cs/interactive.ts tests/unit/cs-interactive.test.ts
git commit -m "feat(cs): interactive builders for brand disambiguation, confirm, re-entry"
```

---

### Task C3: Teach SandwichBot the `'whatsapp'` mode

> **Role in the brain-led model:** the CS agent loop (C6) runs its OWN OpenAI tool-calling loop and injects persona+RAG via `cs-context` (C5) — it does not call `processSandwichMessage`. This task keeps the widget/DM brain (`SandwichBot`) capable of a first-class `'whatsapp'` mode so any CS answer that DOES route through SandwichBot (or a future refactor that delegates a pure-Q&A turn to it) gets DM-parity RAG + prompts. It is a small, harmless forward-compat capability the spec's reuse-map calls for — not on the loop's critical path.

**Files:**
- Modify: `src/lib/chatbot/sandwichBot.ts` (line 54 union; line 189 enrichment branch)
- Modify: `src/lib/chatbot/archetypes/index.ts` (line 131 union; line 182 forward)
- Modify: `src/lib/chatbot/archetypes/types.ts` (line 111 union)
- Test: `tests/unit/sandwichbot-whatsapp-mode.test.ts`

**Interfaces:**
Consumes: existing `SandwichBotInput.mode`. Produces: `mode` union now includes `'whatsapp'`; `'whatsapp'` follows `'dm'` RAG-enrichment ordering and produces DM-style archetype prompts. No signature changes visible to callers.

Steps:

- [ ] Step 1: Write the failing test. Create `tests/unit/sandwichbot-whatsapp-mode.test.ts`. This is a **behavioral** test: rather than grep the source (brittle; passes on a genuine regression and breaks on harmless reformatting), it asserts the two runtime dm-parity DECISIONS via small exported pure helpers that the brain actually calls — `modeUsesDmEnrichment` (the `sandwichBot.ts:189` RAG-enrichment branch) and `resolveArchetypeMode` (the `archetypes/index.ts:182` mode collapse). If `'whatsapp'` stops behaving like `'dm'`, these assertions fail:
```ts
import { describe, it, expect } from 'vitest';
import { modeUsesDmEnrichment } from '@/lib/chatbot/sandwichBot';
import { resolveArchetypeMode } from '@/lib/chatbot/archetypes';

describe("SandwichBot 'whatsapp' mode behavior (dm parity)", () => {
  it("takes the DM RAG-enrichment path for 'whatsapp' exactly as for 'dm'", () => {
    expect(modeUsesDmEnrichment('whatsapp')).toBe(true);
    expect(modeUsesDmEnrichment('dm')).toBe(true);
    // and NOT for the widget/social sales/engagement modes:
    expect(modeUsesDmEnrichment('widget')).toBe(false);
    expect(modeUsesDmEnrichment('social')).toBe(false);
    expect(modeUsesDmEnrichment(undefined)).toBe(false);
  });

  it("collapses 'whatsapp' → 'dm' before archetype prompt assembly (baseArchetype only branches on 'dm')", () => {
    expect(resolveArchetypeMode('whatsapp')).toBe('dm');
    expect(resolveArchetypeMode('dm')).toBe('dm');
    // other modes pass through untouched:
    expect(resolveArchetypeMode('widget')).toBe('widget');
    expect(resolveArchetypeMode('social')).toBe('social');
  });
});
```

- [ ] Step 2: Run test to verify it fails: `npx vitest run tests/unit/sandwichbot-whatsapp-mode.test.ts`. Expected FAIL: `does not provide an export named 'modeUsesDmEnrichment'` / `'resolveArchetypeMode'` (helpers do not exist yet).

- [ ] Step 3a: Edit `src/lib/chatbot/sandwichBot.ts` line 54:
```ts
  mode?: 'widget' | 'social' | 'dm' | 'whatsapp'; // Widget = sales, Social = engagement, DM = IG direct, WhatsApp = CS (DM-like 1:1)
```

- [ ] Step 3b: Edit `src/lib/chatbot/sandwichBot.ts`. First add the exported dm-parity helper near the top of the module (below the imports) — this is the seam the behavioral test asserts:
```ts
// A WhatsApp CS thread is a 1:1 DM-style conversation, so it takes the SAME RAG-enrichment ordering
// as an Instagram DM. Exported so the dm-parity decision is unit-testable (no source grep).
export function modeUsesDmEnrichment(mode?: 'widget' | 'social' | 'dm' | 'whatsapp'): boolean {
  return mode === 'dm' || mode === 'whatsapp';
}
```
Then replace the RAG-enrichment branch condition at line 189 so WhatsApp gets DM ordering:
```ts
        if (modeUsesDmEnrichment(input.mode)) {
```

- [ ] Step 3c: Edit `src/lib/chatbot/archetypes/index.ts` line 131 union:
```ts
    mode?: 'widget' | 'social' | 'dm' | 'whatsapp';
```

- [ ] Step 3d: Edit `src/lib/chatbot/archetypes/index.ts`. First add the exported mode-collapse helper (below the imports) — the seam the behavioral test asserts:
```ts
// Collapse the WhatsApp CS mode to 'dm' for archetype prompt assembly. baseArchetype.ts:726 only
// branches on 'dm', so mapping here applies DM 1:1 prompt behaviour WITHOUT editing baseArchetype.
export function resolveArchetypeMode(
  mode?: 'widget' | 'social' | 'dm' | 'whatsapp',
): 'widget' | 'social' | 'dm' | undefined {
  return mode === 'whatsapp' ? 'dm' : mode;
}
```
Then replace the `mode:` forward at line 182 (inside `archetype.process({…})`):
```ts
    mode: resolveArchetypeMode(context.mode),
```

- [ ] Step 3e: Edit `src/lib/chatbot/archetypes/types.ts` line 111 union:
```ts
  mode?: 'widget' | 'social' | 'dm' | 'whatsapp'; // Widget = sales, Social = engagement, DM = IG, WhatsApp = CS
```

- [ ] Step 4: Run test to verify it passes: `npx vitest run tests/unit/sandwichbot-whatsapp-mode.test.ts` (expected PASS: 2 passed). Then confirm no type break: `npm run type-check`.

- [ ] Step 5: Commit:
```bash
git add src/lib/chatbot/sandwichBot.ts src/lib/chatbot/archetypes/index.ts src/lib/chatbot/archetypes/types.ts tests/unit/sandwichbot-whatsapp-mode.test.ts
git commit -m "feat(cs): add 'whatsapp' mode to SandwichBot (dm-parity RAG + prompts)"
```

---

### Task C4: CS tool contract — types + the tool set (defs + gated handlers)

**Files:**
- Create: `src/lib/cs/tools/types.ts`
- Create: `src/lib/cs/tools/index.ts`
- Test: `tests/unit/cs-tools.test.ts`

**Interfaces:** Produces the CS tool set the brain calls (contract §8): `CsToolCtx`, `CsToolResult`, `WaInteractive`, `CsTool`, `OpenAIFunctionDef` (types.ts); `getCsTools(): CsTool[]` + `CS_TOOL_DEFS: OpenAIFunctionDef[]` (index.ts). Each handler enforces its OWN code-level GATE — the brain never gates.
Consumes: `resolveBrand` (C1), `lookupOrder`/`lookupOrdersByPhone` (Phase B), `supabaseAdmin`, `toWaId` (client). **Forward-deps (built in Phase D, mocked in this task's unit test — mirrors how Phase A's worker consumes the Phase C loop):** `openOrAttachCsTicket` (`@/lib/cs/cs-ticket`, D1), `pauseBot` (`@/lib/handoff/bot-pause`, D3), `runCsHandoffCheck` (`@/engines/escalation/dispatch`, D4). These are **dynamically imported** inside the handlers so this module has no static load-time dependency on unbuilt Phase-D files (same pattern as A8). Build Phase D before end-to-end/deploy.

Steps:

- [ ] Step 1: Write the failing test. Create `tests/unit/cs-tools.test.ts` (focuses on each handler's GATE + side-effect signal):
```ts
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

  it('CS_TOOL_DEFS exposes all 9 tools as OpenAI function defs', async () => {
    const { CS_TOOL_DEFS } = await import('@/lib/cs/tools');
    const names = CS_TOOL_DEFS.map((d) => d.function.name).sort();
    expect(names).toEqual(['bind_brand', 'escalate_to_human', 'list_open_threads', 'lookup_order', 'lookup_orders_by_phone', 'open_or_attach_ticket', 'resolve_brand', 'show_buttons', 'show_list']);
    expect(CS_TOOL_DEFS.every((d) => d.type === 'function')).toBe(true);
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

  it('show_buttons returns an interactive reply (≤3 buttons, titles clipped)', async () => {
    const r = await (await tool('show_buttons')).handler({ body: 'מדובר ב-Argania?', buttons: [{ id: 'yes', title: 'כן' }, { id: 'no', title: 'לא' }] }, ctx());
    expect(r.interactive?.kind).toBe('buttons');
    if (r.interactive?.kind === 'buttons') expect(r.interactive.buttons).toHaveLength(2);
  });
});
```

- [ ] Step 2: Run test to verify it fails: `npx vitest run tests/unit/cs-tools.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/tools'`.

- [ ] Step 3a: Create `src/lib/cs/tools/types.ts`:
```ts
import type { InteractiveButton, InteractiveSection } from '@/lib/whatsapp-cloud/client';

export type WaInteractive =
  | { kind: 'buttons'; body: string; buttons: InteractiveButton[]; header?: string; footer?: string }
  | { kind: 'list'; body: string; buttonLabel: string; sections: InteractiveSection[]; header?: string; footer?: string };

// Structural mirror of the OpenAI chat-completions function-tool schema (no hard SDK type dep).
export interface OpenAIFunctionDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

// Per-turn tool execution context. Handlers READ + SCOPE on it; the loop APPLIES the returned signals.
export interface CsToolCtx {
  waId: string;
  accountId: string | null;      // bound brand (null until bind_brand); scopes EVERY read
  chatSessionId: string | null;
  ticketId: string | null;
  customerName: string | null;
  senderPhone: string;           // = waId (E.164)
}

export interface CsToolResult {
  ok: boolean;
  data?: unknown;                                  // structured payload fed back to the model
  bind?: { accountId: string; ticketId?: string | null }; // bind_brand / open_or_attach_ticket
  learnedName?: string;                            // brain-learned name → loop persists + ctx
  interactive?: WaInteractive;                     // show_buttons/show_list → the turn reply
  escalated?: boolean;                             // escalate_to_human → loop returns { kind:'none' }
}

export interface CsTool {
  def: OpenAIFunctionDef;
  handler(args: any, ctx: CsToolCtx): Promise<CsToolResult>;
}
```

- [ ] Step 3b: Create `src/lib/cs/tools/index.ts` with the shared helpers + the A/B/C-only tools (`resolve_brand`, `lookup_order`, `lookup_orders_by_phone`, `list_open_threads`, `show_buttons`, `show_list`):
```ts
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
```

- [ ] Step 3c: Append the Phase-D-backed tools (`bind_brand`, `open_or_attach_ticket`, `escalate_to_human`) + `getCsTools`/`CS_TOOL_DEFS` to `src/lib/cs/tools/index.ts`. Each dynamically imports its Phase-D mechanic so this module loads with no static dependency on unbuilt files:
```ts
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
```

- [ ] Step 4: Run test to verify it passes: `npx vitest run tests/unit/cs-tools.test.ts`. Expected PASS: 7 passed. Then `npm run type-check` (the dynamic Phase-D imports resolve once D1/D3/D4 land — a "cannot find module" here is the expected forward-dep, cleared in Phase D).

- [ ] Step 5: Commit:
```bash
git add src/lib/cs/tools/types.ts src/lib/cs/tools/index.ts tests/unit/cs-tools.test.ts
git commit -m "feat(cs): CS tool set (defs + gated handlers) for the brain-led loop"
```

---

### Task C5: CS system-context builder (`src/lib/cs/cs-context.ts`)

**Files:**
- Create: `src/lib/cs/cs-context.ts`
- Test: `tests/unit/cs-context.test.ts`

**Interfaces:** Builds the brand-grounded system prompt the agent loop feeds the model + the envelope stripper.
Consumes: `buildPersonalityFromDB` (`@/lib/chatbot/personality-wrapper`), `searchContentByQuery` + `formatMetadataForAI` (`@/lib/chatbot/hybrid-retrieval` — the RAG-injection helpers, verified in recon), `isWarm` + `CsSessionRow` (`@/lib/cs/cs-session`, A9), `supabaseAdmin`.
Produces:
- `interface CsContextDigest { knownName: string | null; boundBrand: string | null; warm: boolean; openThreads: Array<{ ticketId: string; brand: string; topic: string }> }`
- `function buildContextDigest(session: CsSessionRow, openThreads): Promise<CsContextDigest>`
- `function buildCsSystemPrompt(input: { accountId: string | null; userMessage: string; digest: CsContextDigest }): Promise<string>` — generic-CS persona when unbound; brand persona + retrieved RAG when bound. The digest is injected so the brain greets / re-enters correctly (§6) with NO scripted menu.
- `function stripSuggestions(text: string): string` — mandatory before WhatsApp send (the brain always appends `<<SUGGESTIONS>>…`).

Steps:

- [ ] Step 1: Write the failing test. Create `tests/unit/cs-context.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const buildPersonalityFromDB = vi.fn().mockResolvedValue({ signatureStyle: 'warm', commonPhrases: ['היי'], emojiUsage: 'minimal', boundaries: [] });
vi.mock('@/lib/chatbot/personality-wrapper', () => ({ buildPersonalityFromDB: (...a: any[]) => buildPersonalityFromDB(...a) }));
const searchContentByQuery = vi.fn().mockResolvedValue([{ id: 'x' }]);
const formatMetadataForAI = vi.fn().mockReturnValue('שמן ארגן — 100 מ״ל, לשיער יבש');
vi.mock('@/lib/chatbot/hybrid-retrieval', () => ({
  searchContentByQuery: (...a: any[]) => searchContentByQuery(...a),
  formatMetadataForAI: (...a: any[]) => formatMetadataForAI(...a),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: { display_name: 'Argania' } } }) }) }) }) },
}));

const digest = (over: any = {}) => ({ knownName: null, boundBrand: null, warm: false, openThreads: [], ...over });

describe('cs-context', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stripSuggestions removes the <<SUGGESTIONS>> envelope', async () => {
    const { stripSuggestions } = await import('@/lib/cs/cs-context');
    expect(stripSuggestions('שלום\n<<SUGGESTIONS>>a|b<</SUGGESTIONS>>')).toBe('שלום');
  });

  it('unbound prompt: asks for a brand, injects NO RAG', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({ accountId: null, userMessage: 'היי', digest: digest() });
    expect(p).toMatch(/resolve_brand/);
    expect(p).toMatch(/מותג/);
    expect(searchContentByQuery).not.toHaveBeenCalled();
    expect(buildPersonalityFromDB).not.toHaveBeenCalled();
  });

  it('bound prompt: injects brand persona + RAG (searchContentByQuery scoped to the account)', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({ accountId: 'acc-1', userMessage: 'איך משתמשים בשמן?', digest: digest({ boundBrand: 'Argania' }) });
    expect(searchContentByQuery).toHaveBeenCalledWith('acc-1', 'איך משתמשים בשמן?');
    expect(buildPersonalityFromDB).toHaveBeenCalledWith('acc-1');
    expect(p).toContain('שמן ארגן'); // RAG snippet injected
  });

  it('digest drives greeting/re-entry hints (known name, warm, ≥2 threads → show_list)', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({ accountId: null, userMessage: 'היי', digest: digest({ knownName: 'דנה', warm: true, openThreads: [{ ticketId: 't1', brand: 'Argania', topic: 'x' }, { ticketId: 't2', brand: 'LA BEAUTÉ', topic: 'y' }] }) });
    expect(p).toContain('דנה');
    expect(p).toMatch(/חמה|warm|45/);
    expect(p).toMatch(/show_list/);
  });
});
```

- [ ] Step 2: Run test to verify it fails: `npx vitest run tests/unit/cs-context.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/cs-context'`.

- [ ] Step 3: Write the implementation. Create `src/lib/cs/cs-context.ts`:
```ts
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { buildPersonalityFromDB } from '@/lib/chatbot/personality-wrapper';
import { searchContentByQuery, formatMetadataForAI } from '@/lib/chatbot/hybrid-retrieval';
import { isWarm, type CsSessionRow } from '@/lib/cs/cs-session';

// The brain always appends <<SUGGESTIONS>>…; a WhatsApp channel MUST strip it before sending.
export function stripSuggestions(text: string): string {
  return (text || '').replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
}

export interface CsContextDigest {
  knownName: string | null;
  boundBrand: string | null; // brand display name, or null when unbound
  warm: boolean;             // last activity < 45 min
  openThreads: Array<{ ticketId: string; brand: string; topic: string }>;
}

export async function buildContextDigest(
  session: CsSessionRow,
  openThreads: Array<{ ticketId: string; brand: string; topic: string }>,
): Promise<CsContextDigest> {
  let boundBrand: string | null = null;
  if (session.active_account_id) {
    const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', session.active_account_id).single();
    const cfg = (data as any)?.config || {};
    boundBrand = cfg.display_name || cfg.username || null;
  }
  return { knownName: session.customer_name, boundBrand, warm: isWarm(session), openThreads };
}

/**
 * The system prompt. When unbound → a generic Bestie-CS persona that steers toward brand selection.
 * When bound → the brand's persona + freshly retrieved RAG grounding. The digest is injected so the
 * brain produces the §6 re-entry behaviours FROM CONTEXT (no scripted menu, no FSM).
 */
export async function buildCsSystemPrompt(input: {
  accountId: string | null;
  userMessage: string;
  digest: CsContextDigest;
}): Promise<string> {
  const { accountId, userMessage, digest } = input;
  const lines: string[] = [];
  lines.push('את/ה Bestie — שירות הלקוחות של המותגים בוואטסאפ. דבר/י בעברית, בגובה העיניים, קצר וברור, בקול המותג.');
  lines.push('כללי ליבה: אל תמציא/י פרטי הזמנה או מדיניות — השתמש/י בכלים (tools). אל תחשוף/י פרטי הזמנה לפני אימות טלפון (הכלי lookup_order עושה זאת). אם אינך יכול/ה לעזור או שהלקוח/ה מבקש/ת אדם — הפעל/י escalate_to_human.');

  if (digest.knownName) lines.push(`שם הלקוח/ה: ${digest.knownName}. אל תשאל/י שוב לשם.`);
  else lines.push('שם הלקוח/ה עדיין לא ידוע — אפשר לשאול פעם אחת, בטבעיות.');

  if (digest.boundBrand) lines.push(`מותג פעיל: ${digest.boundBrand} — כל הכלים מכוונים אליו.`);
  else lines.push('טרם נבחר מותג — שאל/י לאיזה מותג לפנות, קרא/י ל-resolve_brand, ובאישור הלקוח/ה ל-bind_brand.');

  if (digest.warm) lines.push('שיחה חמה (פחות מ-45 דק׳) — המשך/י ברצף בלי לחזור על שאלות פתיחה.');
  if (digest.openThreads.length === 1) {
    const t = digest.openThreads[0];
    lines.push(`פנייה פתוחה אחת: ${t.brand} · ${t.topic}. הצע/י בעדינות להמשיך אותה (show_buttons: "כן, ממשיכים" / "משהו אחר").`);
  } else if (digest.openThreads.length >= 2) {
    lines.push(`יש ${digest.openThreads.length} פניות פתוחות — הצג/י אותן עם show_list כדי לבחור (כולל שורת "➕ פנייה חדשה").`);
  }

  if (accountId) {
    try {
      const persona = await buildPersonalityFromDB(accountId);
      const slim = { signatureStyle: persona.signatureStyle, commonPhrases: persona.commonPhrases, emojiUsage: persona.emojiUsage, boundaries: persona.boundaries };
      lines.push(`\n--- קול המותג ---\n${JSON.stringify(slim).slice(0, 1500)}`);
    } catch { /* persona optional */ }
    try {
      const hits = await searchContentByQuery(accountId, userMessage);
      const rag = formatMetadataForAI(hits).slice(0, 4000);
      if (rag.trim()) lines.push(`\n--- ידע רלוונטי מהמותג (RAG) ---\n${rag}`);
    } catch { /* RAG optional */ }
  }
  return lines.join('\n');
}
```

- [ ] Step 4: Run test to verify it passes: `npx vitest run tests/unit/cs-context.test.ts`. Expected PASS: 4 passed.

- [ ] Step 5: Commit:
```bash
git add src/lib/cs/cs-context.ts tests/unit/cs-context.test.ts
git commit -m "feat(cs): brand-grounded CS system-prompt builder (persona + RAG + re-entry digest)"
```

---

### Task C6: CS agent — the brain-led tool-calling loop (`src/lib/cs/cs-agent.ts`)

**Files:**
- Create: `src/lib/cs/cs-agent.ts`
- Test: `tests/unit/cs-agent.test.ts`

**Interfaces:**
Consumes: `loadCsSession`/`createCsSession`/`saveCsSession` + `CsSessionRow`/`CsPhase` (`@/lib/cs/cs-session`, A9); `getCsTools`/`CS_TOOL_DEFS` + `CsToolCtx`/`CsToolResult`/`OpenAIFunctionDef`/`WaInteractive` (`@/lib/cs/tools`, C4); `buildCsSystemPrompt`/`buildContextDigest`/`stripSuggestions` (`@/lib/cs/cs-context`, C5); `laneModel` (`@/lib/llm/config`); `supabaseAdmin`; `randomUUID` (`node:crypto`); `OpenAI` (`openai`). **Forward-deps (Phase D, dynamically imported + mocked here — same pattern as A8→loop):** `isBotPaused` (D3), `detectHandoff` (D2), `runCsHandoffCheck` (D4).
Produces:
- `interface CsTurnResult { reply: {kind:'text';body} | {kind:'buttons';…} | {kind:'list';…} | {kind:'none'}; phase: CsPhase }`
- `interface CsAgentDeps { callModel(params): Promise<CsModelTurn> }` (injectable LLM caller; default = OpenAI `chat.completions` with the CS tools — mirrors `sandwich-bot-hybrid.ts`)
- `function runCsTurn(job: CsJob, depsOverride?: Partial<CsAgentDeps>): Promise<CsTurnResult>`

**There is NO FSM.** The whole conversation runs as ONE tool-calling loop (spec §4/§6): 1) load lightweight state (+ chat_session); 2) `isBotPaused` → `{kind:'none'}`; 3) **code backstop** `detectHandoff(userMessage)` → if it fires, `runCsHandoffCheck` (pause+notify) and return a short handoff ack — guaranteeing escalation even if the brain misses the cue; 4) build the brand-grounded system prompt (persona + RAG + name/brand/open-threads/warm-cold digest); 5) the tool loop (≤5 iters): the model emits `tool_calls` → dispatch each handler → feed `CsToolResult.data` back → repeat until final text OR an interactive tool supplies the reply; 6) apply side-effects (`bind`→accountId+chat_session+phase='serving'; `learnedName`→whatsapp_contacts; `escalated`→`{kind:'none'}`) and persist user+assistant `chat_messages`; 7) `stripSuggestions`, return. `depsOverride.callModel` makes the loop deterministic in tests.

Steps:

- [ ] Step 1: Write the failing test. Create `tests/unit/cs-agent.test.ts`:
```ts
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
  supabase: { from: () => { const c: any = {}; c.select = () => c; c.eq = () => c; c.order = () => c; c.limit = () => c; c.single = async () => ({ data: null }); c.maybeSingle = async () => ({ data: null }); c.insert = async () => ({ data: null }); c.update = () => ({ eq: async () => ({ data: null }) }); c.then = (r: any) => r({ data: [] }); return c; } },
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
```

- [ ] Step 2: Run test to verify it fails: `npx vitest run tests/unit/cs-agent.test.ts`. Expected FAIL: `Cannot find module '@/lib/cs/cs-agent'`.

The loop is built in two slices: **3a** = imports + types + the default OpenAI tool-calling caller + the read-helpers; **3b** = `runCsTurn` (guards → system prompt → tool loop → persist) + the side-effect helpers.

- [ ] Step 3a: Create `src/lib/cs/cs-agent.ts` with the imports, types, the default LLM caller, and the read-helpers:
```ts
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { loadCsSession, createCsSession, saveCsSession, type CsSessionRow, type CsPhase } from '@/lib/cs/cs-session';
import { getCsTools, CS_TOOL_DEFS } from '@/lib/cs/tools';
import type { CsToolCtx, CsToolResult, OpenAIFunctionDef, WaInteractive } from '@/lib/cs/tools/types';
import { buildCsSystemPrompt, buildContextDigest, stripSuggestions } from '@/lib/cs/cs-context';
import { laneModel } from '@/lib/llm/config';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import type { CsJob } from '@/lib/cs/wa-cs-queue';

export interface CsTurnResult {
  reply:
    | { kind: 'text'; body: string }
    | { kind: 'buttons'; body: string; buttons: any[]; header?: string; footer?: string }
    | { kind: 'list'; body: string; buttonLabel: string; sections: any[]; header?: string; footer?: string }
    | { kind: 'none' };
  phase: CsPhase;
}

interface CsChatMessage { role: 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: any[]; tool_call_id?: string; }
interface CsModelTurn { toolCalls: Array<{ id: string; name: string; args: any }>; text: string | null; }
export interface CsAgentDeps {
  callModel(params: { system: string; messages: CsChatMessage[]; tools: OpenAIFunctionDef[] }): Promise<CsModelTurn>;
}

const MAX_ITERS = 5;
const TERMINAL_TICKET = new Set(['resolved', 'closed', 'cancelled']);
function safeJson(s: any): any { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch { return {}; } }
function phoneVariants(waId: string): string[] {
  const wa = toWaId(waId);
  const local = wa.startsWith('972') ? '0' + wa.slice(3) : wa;
  return Array.from(new Set([waId, wa, local, '+' + wa]));
}

// Default LLM caller — native OpenAI function-calling (mirrors src/lib/chatbot/sandwich-bot-hybrid.ts).
async function defaultCallModel(params: { system: string; messages: CsChatMessage[]; tools: OpenAIFunctionDef[] }): Promise<CsModelTurn> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
    model: laneModel('money'),
    messages: [{ role: 'system', content: params.system }, ...(params.messages as any)],
    tools: params.tools as any,
    tool_choice: 'auto',
  });
  const msg: any = res.choices?.[0]?.message;
  const toolCalls = (msg?.tool_calls || []).map((tc: any) => ({ id: tc.id, name: tc.function?.name, args: safeJson(tc.function?.arguments) }));
  return { toolCalls, text: msg?.content ?? null };
}

// --- read-helpers used to build the turn context ---
async function loadHistory(chatSessionId: string): Promise<CsChatMessage[]> {
  const { data } = await supabaseAdmin.from('chat_messages').select('role, content').eq('session_id', chatSessionId).order('created_at', { ascending: false }).limit(10);
  return ((data as any[]) || []).reverse().map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
}
async function priorUserTexts(chatSessionId: string | null): Promise<string[]> {
  if (!chatSessionId) return [];
  const { data } = await supabaseAdmin.from('chat_messages').select('role, content').eq('session_id', chatSessionId).order('created_at', { ascending: false }).limit(8);
  return ((data as any[]) || []).reverse().filter((m) => m.role === 'user').map((m) => m.content);
}
async function escalationConfig(accountId: string | null): Promise<any> {
  if (!accountId) return null;
  const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).single();
  return (data as any)?.config?.escalation || null;
}
async function loadOpenThreads(waId: string): Promise<Array<{ ticketId: string; brand: string; topic: string }>> {
  const { data } = await supabaseAdmin
    .from('support_requests').select('id, account_id, status, message, metadata, accounts(config)')
    .eq('source', 'whatsapp_cs').in('customer_phone', phoneVariants(waId)).order('updated_at', { ascending: false }).limit(10);
  return ((data as any[]) || []).filter((r) => !TERMINAL_TICKET.has(r.status)).map((r) => ({
    ticketId: r.id, brand: r.accounts?.config?.display_name || r.accounts?.config?.username || 'המותג', topic: r.metadata?.topic || r.message || 'פנייה',
  }));
}
```
- [ ] Step 3b: Append `runCsTurn` (the loop) + the side-effect helpers to the same file:
```ts
// Apply a bind side-effect: create/reuse the chat_session, set ctx + session (phase='serving').
async function applyBind(session: CsSessionRow, ctx: CsToolCtx, bind: { accountId: string; ticketId?: string | null }): Promise<CsSessionRow> {
  let chatSessionId = session.active_chat_session_id;
  if (!chatSessionId || session.active_account_id !== bind.accountId) {
    chatSessionId = randomUUID();
    await supabaseAdmin.from('chat_sessions').insert({ id: chatSessionId, account_id: bind.accountId, message_count: 0, anon_id: `wa_${session.wa_id}_${bind.accountId}` });
  }
  const patch = { active_account_id: bind.accountId, active_ticket_id: bind.ticketId ?? session.active_ticket_id, active_chat_session_id: chatSessionId, phase: 'serving' as CsPhase, last_activity_at: new Date().toISOString() };
  await saveCsSession(session, patch);
  ctx.accountId = bind.accountId; ctx.ticketId = patch.active_ticket_id; ctx.chatSessionId = chatSessionId;
  return { ...session, ...patch, version: session.version + 1 };
}

// Apply a learned-name side-effect (name is learned ONCE, stored on whatsapp_contacts).
async function applyLearnedName(session: CsSessionRow, ctx: CsToolCtx, name: string): Promise<CsSessionRow> {
  const clean = name.trim().slice(0, 60);
  await saveCsSession(session, { customer_name: clean, last_activity_at: new Date().toISOString() });
  if (session.contact_id) await supabaseAdmin.from('whatsapp_contacts').update({ profile_name: clean }).eq('id', session.contact_id);
  ctx.customerName = clean;
  return { ...session, customer_name: clean, version: session.version + 1 };
}

// Persist the turn to chat_messages + bump message_count (mirror widget-chat-handler.ts).
async function persistTurn(chatSessionId: string, userMessage: string, assistantText: string): Promise<void> {
  const { data: sess } = await supabaseAdmin.from('chat_sessions').select('message_count').eq('id', chatSessionId).single();
  const msgCount = (((sess as any)?.message_count) || 0) + 2;
  await Promise.all([
    supabaseAdmin.from('chat_messages').insert({ session_id: chatSessionId, role: 'user', content: userMessage }),
    supabaseAdmin.from('chat_messages').insert({ session_id: chatSessionId, role: 'assistant', content: assistantText }),
    supabaseAdmin.from('chat_sessions').update({ message_count: msgCount }).eq('id', chatSessionId),
  ]);
}

export async function runCsTurn(job: CsJob, depsOverride?: Partial<CsAgentDeps>): Promise<CsTurnResult> {
  const deps: CsAgentDeps = { callModel: depsOverride?.callModel ?? defaultCallModel };
  const waId = job.waId;
  const userMessage = (job.textBody || '').trim();
  let session = (await loadCsSession(waId)) || (await createCsSession(waId, job.contactId ?? null));

  // 2) Pause guard — a human owns this thread; the bot stays silent until manual resume.
  if (session.active_chat_session_id) {
    const { isBotPaused } = await import('@/lib/handoff/bot-pause'); // Phase D (D3)
    if (await isBotPaused(session.active_chat_session_id)) return { reply: { kind: 'none' }, phase: session.phase };
  }

  // 3) Code backstop — guarantee escalation even if the brain misses the cue.
  try {
    const { detectHandoff } = await import('@/engines/escalation/detect'); // Phase D (D2)
    const cfg = await escalationConfig(session.active_account_id);
    const d = detectHandoff(userMessage, await priorUserTexts(session.active_chat_session_id), { enabledTriggers: cfg?.triggers, lowConfidenceThreshold: cfg?.lowConfidenceThreshold });
    if (d.triggered && session.active_account_id && session.active_chat_session_id) {
      const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch'); // Phase D (D4)
      await runCsHandoffCheck({ accountId: session.active_account_id, chatSessionId: session.active_chat_session_id, ticketId: session.active_ticket_id, waId, userMessage, force: true });
      await saveCsSession(session, { last_activity_at: new Date().toISOString() });
      return { reply: { kind: 'text', body: 'אני מעבירה אותך לנציג/ה אנושי/ת שיחזרו אליך בהקדם 🙏' }, phase: session.phase };
    }
  } catch (e) { console.warn('[cs-agent] handoff backstop failed', e); }

  // 4) Build the brand-grounded system prompt (persona + RAG + re-entry digest — NO scripted menu).
  const openThreads = await loadOpenThreads(waId);
  const digest = await buildContextDigest(session, openThreads);
  const system = await buildCsSystemPrompt({ accountId: session.active_account_id, userMessage, digest });

  // 5) Tool-calling loop.
  const ctx: CsToolCtx = { waId, accountId: session.active_account_id, chatSessionId: session.active_chat_session_id, ticketId: session.active_ticket_id, customerName: session.customer_name, senderPhone: waId };
  const toolMap = new Map(getCsTools().map((t) => [t.def.function.name, t]));
  const history = session.active_chat_session_id ? await loadHistory(session.active_chat_session_id) : [];
  const messages: CsChatMessage[] = [...history, { role: 'user', content: userMessage }];
  let finalText: string | null = null;
  let interactive: WaInteractive | null = null;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const turn = await deps.callModel({ system, messages, tools: CS_TOOL_DEFS });
    if (!turn.toolCalls?.length) { finalText = turn.text; break; }
    messages.push({ role: 'assistant', content: turn.text, tool_calls: turn.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })) });

    let escalated = false;
    for (const tc of turn.toolCalls) {
      const tool = toolMap.get(tc.name);
      let result: CsToolResult = { ok: false, data: { reason: 'unknown_tool' } };
      if (tool) { try { result = await tool.handler(tc.args, ctx); } catch (e) { result = { ok: false, data: { reason: 'tool_error' } }; console.warn('[cs-agent] tool threw', tc.name, e); } }
      if (result.bind) session = await applyBind(session, ctx, result.bind);
      if (result.learnedName) session = await applyLearnedName(session, ctx, result.learnedName);
      if (result.interactive) interactive = result.interactive;
      if (result.escalated) escalated = true;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result.data ?? { ok: result.ok }) });
    }
    if (escalated) return { reply: { kind: 'none' }, phase: session.phase };
    if (interactive) break; // an interactive tool supplied the reply
  }

  // 6/7) Persist + reply.
  await saveCsSession(session, { last_activity_at: new Date().toISOString() });
  if (interactive) return { reply: interactive, phase: session.phase };
  const body = stripSuggestions(finalText || 'סליחה, אפשר לנסח שוב? 🙏');
  if (session.active_chat_session_id) await persistTurn(session.active_chat_session_id, userMessage, body);
  return { reply: { kind: 'text', body }, phase: session.phase };
}
```

- [ ] Step 4: Run test to verify it passes: `npx vitest run tests/unit/cs-agent.test.ts` (expected PASS: 7 passed). Then `npm run type-check` (the dynamic Phase-D imports — `isBotPaused`/`detectHandoff`/`runCsHandoffCheck` — resolve once D2/D3/D4 land; a "cannot find module/export" here is the expected forward-dep, cleared in Phase D).

- [ ] Step 5: Commit:
```bash
git add src/lib/cs/cs-agent.ts tests/unit/cs-agent.test.ts
git commit -m "feat(cs): brain-led CS tool-calling loop (runCsTurn) — guards, tools, persist"
```

---

### Task C7: Wire the worker to the turn + dispatch by reply kind

**Files:**
- Modify: `src/lib/cs/wa-cs-worker.ts` (small DIFF against A8's `processOneCsInbound`: static `runCsTurn` import replacing the dynamic one + `wa_message_id` return semantics)
- Test: `tests/unit/cs-worker-dispatch.test.ts`
- Re-run (regression, not re-created): `tests/unit/cs-worker.test.ts` (A8's suite — its SUT is edited here)

**Interfaces:**
Consumes: `runCsTurn` + `CsTurnResult` (`@/lib/cs/cs-agent`, C6). Produces: the **finalized** `processOneCsInbound(job: CsJob): Promise<string | null>` — returns the outbound **wa_message_id** on a confirmed send (or `null` when `reply.kind==='none'` or all sends fail). It keeps EXACTLY ONE done-guard, set only AFTER a confirmed send (the Global-Constraint "reply-before-guard" invariant), and retries a failed send 3×.

**This task is a small DIFF against Task A8's already-complete `processOneCsInbound` — NOT a second full-file body.** A8 already ships: the done-guard (`redisGet` READ at top for the short-circuit + `redisSetNx` WRITE after a confirmed send), a dynamic `runCsTurn` import (from `@/lib/cs/cs-agent`), kind-based send dispatch, the 3× send-retry, and the ✅/⚠️ reaction stamping (a clean `if (sent.success) {…✅} else {…⚠️}` — no operator-precedence hazard). A8 also already imports `sendText`/`sendInteractiveButtons`/`sendInteractiveList`/`sendReaction`, `redisGet`/`redisSetNx`, and `type CsJob`. C7 therefore does **only two things**: (1) add a static `runCsTurn`/`CsTurnResult` import (from `@/lib/cs/cs-agent`) and delete A8's dynamic `import()`; (2) change the return value from `turn.phase` to the outbound `wa_message_id`. The done-guard, dispatch, retry, and reaction logic are left untouched. Do NOT re-import any binding A8 already declared (a duplicate `const`/`import` is a `SyntaxError` that breaks module load).

Steps:

- [ ] Step 1: Write the failing test. Create `tests/unit/cs-worker-dispatch.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendText = vi.fn();
const sendButtons = vi.fn();
const sendList = vi.fn();
const sendReaction = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendText: (...a: any[]) => sendText(...a),
  sendInteractiveButtons: (...a: any[]) => sendButtons(...a),
  sendInteractiveList: (...a: any[]) => sendList(...a),
  sendReaction: (...a: any[]) => sendReaction(...a),
  toWaId: (s: string) => s,
}));

const runCsTurn = vi.fn();
vi.mock('@/lib/cs/cs-agent', () => ({ runCsTurn: (...a: any[]) => runCsTurn(...a) }));

// Redis: done-guard fresh by default.
vi.mock('@/lib/redis', () => ({
  redisSetNx: vi.fn().mockResolvedValue(true),
  redisGet: vi.fn().mockResolvedValue(null),
  redisExists: vi.fn().mockResolvedValue(false),
}));

const job = { waId: '972500000000', msg: { id: 'wamid-1' }, textBody: 'שלום', contactId: 'c1' } as any;

describe('processOneCsInbound dispatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('kind:text → sendText, returns wa_message_id, stamps ✅', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'text', body: 'שלום דנה' }, phase: 'serving' });
    sendText.mockResolvedValue({ success: true, wa_message_id: 'out-1' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const id = await processOneCsInbound(job);
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ to: '972500000000', body: 'שלום דנה' }));
    expect(id).toBe('out-1');
    // a confirmed send flips the 👀 to ✅
    expect(sendReaction).toHaveBeenCalledWith(expect.objectContaining({ to: '972500000000', messageId: 'wamid-1', emoji: '✅' }));
  });

  it('kind:buttons → sendInteractiveButtons', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'buttons', body: 'מדובר ב-Argania?', buttons: [{ id: 'confirm_yes', title: 'כן' }] }, phase: 'onboarding' });
    sendButtons.mockResolvedValue({ success: true, wa_message_id: 'out-2' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    await processOneCsInbound(job);
    expect(sendButtons).toHaveBeenCalledWith(expect.objectContaining({ to: '972500000000', body: 'מדובר ב-Argania?' }));
  });

  it('kind:list → sendInteractiveList', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'list', body: 'לאיזה מותג?', buttonLabel: 'בחירה', sections: [{ rows: [{ id: 'brand_a', title: 'A' }] }] }, phase: 'onboarding' });
    sendList.mockResolvedValue({ success: true, wa_message_id: 'out-3' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    await processOneCsInbound(job);
    expect(sendList).toHaveBeenCalled();
  });

  it('kind:none → sends nothing, returns null', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'none' }, phase: 'serving' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const id = await processOneCsInbound(job);
    expect(sendText).not.toHaveBeenCalled();
    expect(id).toBeNull();
  });

  it('retries a failed send up to 3 times', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'text', body: 'x' }, phase: 'serving' });
    sendText.mockResolvedValueOnce({ success: false, error: { code: 429, type: 'rate', message: 'slow' } })
            .mockResolvedValueOnce({ success: false, error: { code: 503, type: 'unavail', message: 'busy' } })
            .mockResolvedValueOnce({ success: true, wa_message_id: 'out-final' });
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const id = await processOneCsInbound(job);
    expect(sendText).toHaveBeenCalledTimes(3);
    expect(id).toBe('out-final');
    expect(sendReaction).toHaveBeenCalledWith(expect.objectContaining({ emoji: '✅' }));
  });

  it('all 3 sends fail → returns null and stamps ⚠️ (no done-guard write)', async () => {
    runCsTurn.mockResolvedValue({ reply: { kind: 'text', body: 'x' }, phase: 'serving' });
    sendText.mockResolvedValue({ success: false, error: { code: 500, type: 'x', message: 'down' } });
    const { redisSetNx } = await import('@/lib/redis');
    const { processOneCsInbound } = await import('@/lib/cs/wa-cs-worker');
    const id = await processOneCsInbound(job);
    expect(sendText).toHaveBeenCalledTimes(3);
    expect(id).toBeNull();
    expect(sendReaction).toHaveBeenCalledWith(expect.objectContaining({ emoji: '⚠️' }));
    // done-guard is written ONLY after a confirmed send — never on a total failure (so it re-processes).
    expect(redisSetNx).not.toHaveBeenCalledWith('cs:wa:wamid-1:done', expect.anything(), expect.anything());
  });
});
```

- [ ] Step 2: Run test to verify it fails: `npx vitest run tests/unit/cs-worker-dispatch.test.ts`. Expected FAIL: A8's `processOneCsInbound` already calls `runCsTurn` and dispatches the send correctly, but it returns `turn.phase` (e.g. `'serving'`), not the outbound `wa_message_id` — so `expect(id).toBe('out-1')` (and the `null` / `'out-final'` return assertions) fail. This is a return-semantics mismatch, not a missing stub — A8's function is already complete.

- [ ] Step 3a — add ONE import, delete the dynamic import. At the top of `src/lib/cs/wa-cs-worker.ts`, next to A8's existing imports, add:
```ts
import { runCsTurn, type CsTurnResult } from '@/lib/cs/cs-agent';
```
Then DELETE A8's dynamic import line from inside `processOneCsInbound`:
```ts
  const { runCsTurn } = await import('@/lib/cs/cs-agent');   // ← remove this line (now a static import)
```
Do NOT add any other import — `sendText`, `sendInteractiveButtons`, `sendInteractiveList`, `sendReaction`, `redisGet`, `redisSetNx`, and `type CsJob` are ALL already imported by A8. A duplicate `import`/`const` for any of them is an ES `SyntaxError: Identifier '…' has already been declared` that stops the module (and every cs-worker test) from loading.

- [ ] Step 3b — change the return from `turn.phase` to the outbound `wa_message_id`. Make exactly these three in-place edits inside `processOneCsInbound`. Everything else A8 wrote stays byte-for-byte: the top-of-function `redisGet('cs:wa:<wamid>:done')` done-guard READ, the kind dispatch, the 3× send-retry loop, the single `redisSetNx('cs:wa:<wamid>:done','1',900)` done-guard WRITE that fires only after a confirmed send, and the `if (sent.success) {…✅} else {…⚠️}` reaction stamping.

  1. Widen `sent` so the outbound id is reachable — change:
```ts
  let sent = { success: false } as { success: boolean };
```
  to:
```ts
  let sent: { success: boolean; wa_message_id?: string } = { success: false };
```
  2. `kind:'none'` returns `null` (not the stage) — change:
```ts
  if (!reply || reply.kind === 'none') return turn.phase;
```
  to:
```ts
  if (!reply || reply.kind === 'none') return null;
```
  3. The final return yields the outbound id on a confirmed send, else `null` — change:
```ts
  return turn.phase;
```
  to:
```ts
  return sent.success ? (sent.wa_message_id ?? null) : null;
```

**Done-guard decision (settled here — no "reconcile at wiring time"):** there is EXACTLY ONE done-guard, and it is A8's. A `redisGet('cs:wa:<wamid>:done')` READ at the top short-circuits an already-handled inbound; a single `redisSetNx('cs:wa:<wamid>:done','1',900)` WRITE fires ONLY after a confirmed send — honoring the Global-Constraint "reply sent BEFORE the done-guard SETNX" invariant (a crash before the send re-processes, so no reply is ever lost). C7 does NOT add a second guard and does NOT move the SETNX ahead of the send. The reaction stays A8's `if (sent.success) {…✅} else {…⚠️}` (a plain branch — no operator-precedence hazard).

- [ ] Step 4: Run test to verify it passes: `npx vitest run tests/unit/cs-worker-dispatch.test.ts` (expected PASS: 6 passed). **Then re-run A8's worker test to confirm no regression from editing its SUT: `npx vitest run tests/unit/cs-worker.test.ts` (expected PASS — unchanged).** A8's assertions still hold: the done-guard READ is still `redisGet` at the top (so "done-guard short-circuits" with `redisGet='1'` still returns `null` and skips `runCsTurn`), the drain/dispatch/none cases don't assert the return value, and the only return-value assertion (`out).toBeNull()`) is satisfied by both the short-circuit and the `kind:'none'` paths — so no A8 assertion needs changing. Then run the whole CS suite: `npx vitest run tests/unit/cs-brand-resolver.test.ts tests/unit/cs-interactive.test.ts tests/unit/cs-context.test.ts tests/unit/cs-tools.test.ts tests/unit/cs-agent.test.ts tests/unit/cs-worker.test.ts tests/unit/cs-worker-dispatch.test.ts` and `npm run type-check`.

- [ ] Step 5: Commit:
```bash
git add src/lib/cs/wa-cs-worker.ts tests/unit/cs-worker-dispatch.test.ts
git commit -m "feat(cs): wire worker → runCsTurn → send dispatch by reply kind (text/buttons/list)"
```

---

**Phase C exit criteria:** all CS unit files green (`cs-brand-resolver`, `cs-interactive`, `cs-context`, `cs-tools`, `cs-agent`, `cs-worker-dispatch`); `npm run type-check` clean **except the intentional forward-deps** on Phase-D mechanics (`cs-ticket`, `bot-pause`, `escalation/detect#detectHandoff`, `escalation/dispatch#runCsHandoffCheck`) — dynamically imported and mocked in the C4/C6 tests, resolved once Phase D lands. A shopper message now flows unknown-sender → queue/worker (Phase A) → `runCsTurn` (the **brain-led tool loop**): `isBotPaused` guard → `detectHandoff` backstop → brand-grounded system prompt (persona + RAG + re-entry digest) → OpenAI tool-calling loop (`resolve_brand`/`bind_brand`/`lookup_order`/…/`show_buttons`/`escalate_to_human`) → side-effects applied → `<<SUGGESTIONS>>` stripped → reply dispatched by kind. **Phase D** builds the mechanics the tools/loop already call (tickets, bot-pause, `detectHandoff`, `runCsHandoffCheck` + the `force` path) and the human-handoff UI, then the cross-phase regression suite — **build Phase D before end-to-end/deploy.**

---

# Phase D: Tickets & Handoff

Phase D builds the **mechanics the Phase-C tools + loop already call** (they dynamically import + mock these): the ticket store (D1), `detectHandoff` (D2), bot-pause (D3), and the handoff dispatch `runCsHandoffCheck` + the `force` path (D4) — plus the human-handoff UI (D5 bot-toggle, D6 Bestie-inbox reply) and the cross-phase regression suite (D7). It builds on the tables from Phase A (migration `068`/`069`), the CS state store (`src/lib/cs/cs-session.ts`), the order layer from Phase B, and the brain-led loop from Phase C. **Once Phase D lands, the CS feature is end-to-end** (the forward-deps from Phase C resolve).

Everything here uses the **service-role** client (`import { supabase } from '@/lib/supabase'`) on server paths, and the bot stays **read-only** — no store writes anywhere in this phase. Handoff is gated behind `ESCALATION_ENABLED` + `config.escalation.enabled` exactly like the existing escalation engine.

Ground truth used throughout (verified in recon):
- `support_requests` has **no** `channel`/`topic` column — the discriminator is the `source` text column; CS tickets use `source='whatsapp_cs'` and mirror `channel:'whatsapp_cs'` inside `metadata`. Terminal statuses: `resolved`/`closed`/`cancelled`. `customer_name` and `message` are **NOT NULL**.
- `support_ticket_history.actor` is free text (not an enum).
- `chat_sessions.bot_paused / bot_paused_at / bot_paused_reason` are added by migration `069` (Phase A).
- Escalation reuse surface: `runEscalationCheck` + `EscalationOutcome` (`dispatch.ts`), `detectEscalation` (`detect.ts` — its `LEGAL`/`ABUSE`/`HUMAN_STRONG`/… word lists + `hasAny` are **module-local, NOT exported**, so `detectHandoff` is appended to the same file to reach them), `resolveRecipients` (`./recipients`), `buildEscalationEmail` (`./email-template`), `sendEmail`/`sendAdminAlert` (`@/lib/email`).

---

## Phase D: Tickets & Handoff

### Task D1: CS Ticket store (`openOrAttachCsTicket` + `appendCsTicketHistory`)

**Files:**
- Create: `src/lib/cs/cs-ticket.ts`
- Test: `tests/unit/cs-ticket.test.ts`

**Interfaces:**
- Consumes: `import { supabase } from '@/lib/supabase'` (service-role, bypasses RLS); `toWaId(phone: string): string` from `@/lib/whatsapp-cloud/client`.
- Produces:
  - `openOrAttachCsTicket(input: { accountId: string; waId: string; customerPhone: string; customerName: string | null; topic?: string }): Promise<{ ticketId: string }>` — returns the latest non-terminal `whatsapp_cs` ticket for `(account_id, phone)` or inserts a new `status:'new'`, `source:'whatsapp_cs'`, `metadata.channel:'whatsapp_cs'` row.
  - `appendCsTicketHistory(input: { ticketId: string; accountId: string; action: string; actor: string; note?: string; body_text?: string; whatsapp_message_id?: string | null }): Promise<void>` — inserts one `support_ticket_history` row.

Consumed by the **C4 `bind_brand` / `open_or_attach_ticket` tools** (which dynamically import + mock it), Task D4 (flag ticket), and Task D6 (`/api/cs/reply` agent_message history).

- [ ] Step 1: Write the failing test — create `tests/unit/cs-ticket.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Query-shape-agnostic chainable Supabase fake (mirrors escalation-dispatch.test.ts).
function makeSupabase(opts: { existing?: any[] } = {}) {
  const inserts: any[] = [];
  const api: any = {
    inserts,
    from(table: string) {
      const ctx: any = { table, _op: 'select' };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.order = () => ctx;
      ctx.limit = () => ctx;
      ctx.single = async () => ({ data: inserts[inserts.length - 1]?.row ?? null, error: null });
      ctx.insert = (row: any) => {
        inserts.push({ table, row: { id: 'ticket-new-1', ...row } });
        return {
          select: () => ({ single: async () => ({ data: { id: 'ticket-new-1' }, error: null }) }),
        };
      };
      // awaiting a select query returns the "existing" list
      ctx.then = (resolve: any) => resolve({ data: opts.existing ?? [], error: null });
      return ctx;
    },
  };
  return api;
}

vi.mock('@/lib/whatsapp-cloud/client', () => ({
  toWaId: (p: string) => p.replace(/\D/g, '').replace(/^0/, '972'),
}));

describe('cs-ticket', () => {
  beforeEach(() => vi.resetModules());

  it('attaches to an existing non-terminal whatsapp_cs ticket for the same phone', async () => {
    const sb = makeSupabase({
      existing: [{ id: 't-open', status: 'in_progress', customer_phone: '972501234567' }],
    });
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket');
    const r = await openOrAttachCsTicket({
      accountId: 'acc-1', waId: '972501234567', customerPhone: '0501234567',
      customerName: 'דנה', topic: 'מוצר פגום',
    });
    expect(r.ticketId).toBe('t-open');
    expect(sb.inserts.length).toBe(0); // reused, not inserted
  });

  it('opens a new ticket when no open thread exists (source=whatsapp_cs)', async () => {
    const sb = makeSupabase({ existing: [{ id: 't-closed', status: 'closed', customer_phone: '972501234567' }] });
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { openOrAttachCsTicket } = await import('@/lib/cs/cs-ticket');
    const r = await openOrAttachCsTicket({
      accountId: 'acc-1', waId: '972501234567', customerPhone: '0501234567',
      customerName: null, topic: undefined,
    });
    expect(r.ticketId).toBe('ticket-new-1');
    const row = sb.inserts[0].row;
    expect(row.source).toBe('whatsapp_cs');
    expect(row.metadata.channel).toBe('whatsapp_cs');
    expect(row.status).toBe('new');
    expect(row.customer_name).toBeTruthy(); // NOT NULL fallback
    expect(row.message).toBeTruthy();       // NOT NULL fallback
  });

  it('appendCsTicketHistory inserts one history row', async () => {
    const sb = makeSupabase({});
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { appendCsTicketHistory } = await import('@/lib/cs/cs-ticket');
    await appendCsTicketHistory({
      ticketId: 't1', accountId: 'acc-1', action: 'agent_message',
      actor: 'bestie_inbox', body_text: 'שלום', whatsapp_message_id: 'wamid.1',
    });
    expect(sb.inserts[0].table).toBe('support_ticket_history');
    expect(sb.inserts[0].row.action).toBe('agent_message');
  });
});
```

- [ ] Step 2: Run the test to verify it fails — `npx vitest run tests/unit/cs-ticket.test.ts`. Expected FAIL: `Failed to resolve import "@/lib/cs/cs-ticket"` (module does not exist yet).

- [ ] Step 3: Write the minimal implementation — create `src/lib/cs/cs-ticket.ts`:
```ts
import { supabase } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';

const TERMINAL = new Set(['resolved', 'closed', 'cancelled']);

/**
 * Every bound CS conversation opens (or re-attaches to) a support_request thread.
 * Discriminator is `source='whatsapp_cs'` (support_requests has no channel/topic column).
 */
export async function openOrAttachCsTicket(input: {
  accountId: string;
  waId: string;
  customerPhone: string;
  customerName: string | null;
  topic?: string;
}): Promise<{ ticketId: string }> {
  const wa = toWaId(input.customerPhone || input.waId);

  const { data: rows } = await supabase
    .from('support_requests')
    .select('id, status, customer_phone')
    .eq('account_id', input.accountId)
    .eq('source', 'whatsapp_cs')
    .order('updated_at', { ascending: false })
    .limit(20);

  const match = (rows || []).find(
    (t: any) => t.customer_phone && toWaId(t.customer_phone) === wa && !TERMINAL.has(t.status),
  );
  if (match) return { ticketId: match.id };

  const { data: inserted, error } = await supabase
    .from('support_requests')
    .insert({
      account_id: input.accountId,
      customer_name: input.customerName || 'לקוח/ה',      // NOT NULL
      customer_phone: input.customerPhone,
      message: input.topic || 'פנייה בוואטסאפ',            // NOT NULL
      status: 'new',
      source: 'whatsapp_cs',
      metadata: { channel: 'whatsapp_cs', topic: input.topic || null },
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error(`openOrAttachCsTicket failed: ${error?.message || 'no row returned'}`);
  }
  return { ticketId: inserted.id };
}

export async function appendCsTicketHistory(input: {
  ticketId: string;
  accountId: string;
  action: string;
  actor: string;
  note?: string;
  body_text?: string;
  whatsapp_message_id?: string | null;
}): Promise<void> {
  await supabase.from('support_ticket_history').insert({
    ticket_id: input.ticketId,
    account_id: input.accountId,
    action: input.action,
    actor: input.actor,
    note: input.note ?? null,
    body_text: input.body_text ?? null,
    whatsapp_message_id: input.whatsapp_message_id ?? null,
  });
}
```

- [ ] Step 4: Run the test to verify it passes — `npx vitest run tests/unit/cs-ticket.test.ts`. Expected PASS: `3 passed`.

- [ ] Step 5: Commit —
```bash
git add src/lib/cs/cs-ticket.ts tests/unit/cs-ticket.test.ts
git commit -m "feat(cs): support_request thread store for WhatsApp CS (source=whatsapp_cs)"
```

---

### Task D2: Extend escalation types + `detectHandoff`

**Files:**
- Modify: `src/engines/escalation/types.ts` (append `HandoffTrigger`, `HandoffDetection`; extend `EscalationConfig` lines 17-21 with `triggers` + `lowConfidenceThreshold`)
- Modify: `src/engines/escalation/detect.ts` (append `detectHandoff`, reusing module-scoped `LEGAL`/`ABUSE`/`HUMAN_STRONG`/`HUMAN_MANAGER`/`REQUEST_CUE`/`NEGATIVE`/`hasAny`)
- Test: `tests/unit/detect-handoff.test.ts`

**Interfaces:**
- Consumes: existing module-scoped consts + `hasAny(text, words)` in `detect.ts` (unicode word-boundary safe).
- Produces:
  - Type `HandoffTrigger = 'human_demand'|'refund_return'|'defective_product'|'frustration'|'legal'|'abuse'|'repeated_failure'|'low_confidence'`.
  - `interface HandoffDetection { triggered: boolean; triggers: HandoffTrigger[]; severity: 'low'|'medium'|'high'; reason: string }`.
  - `detectHandoff(message: string, priorUserTexts: string[], opts?: { enabledTriggers?: Partial<Record<HandoffTrigger, boolean>>; lowConfidenceThreshold?: number; confidence?: number }): HandoffDetection`.
  - Extended `EscalationConfig` with `triggers?: Partial<Record<HandoffTrigger, boolean>>` and `lowConfidenceThreshold?: number`.

Consumed by Task D4 (dispatch wiring) + the C6 agent loop's `detectHandoff` backstop. `EscalationConfig` is extended **in place** (contract §12) — there is no separate `EscalationConfigExtended` type; D4 imports/casts `EscalationConfig`. Note: `EscalationOutcome` already lives in `dispatch.ts` and already carries `skipped?/deduped?/recipientsNotified?` (verified) — **no widening needed**. Note: `detectHandoff` reuses the module-local `LEGAL`/`ABUSE`/`HUMAN_STRONG`/`HUMAN_MANAGER`/`REQUEST_CUE`/`NEGATIVE`/`hasAny` in `detect.ts` (they are NOT exported — appending `detectHandoff` to the same module is exactly why it can reach them).

- [ ] Step 1: Write the failing test — create `tests/unit/detect-handoff.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectHandoff } from '@/engines/escalation/detect';

describe('detectHandoff', () => {
  it('flags refund/return intent', () => {
    const d = detectHandoff('אני רוצה החזר כספי על ההזמנה', []);
    expect(d.triggered).toBe(true);
    expect(d.triggers).toContain('refund_return');
    expect(d.severity).toBe('medium');
  });

  it('flags defective product', () => {
    const d = detectHandoff('המוצר הגיע שבור לגמרי', []);
    expect(d.triggers).toContain('defective_product');
  });

  it('keeps legal at high severity', () => {
    const d = detectHandoff('אני אתבע אתכם, מדבר עם עו"ד', []);
    expect(d.triggers).toEqual(expect.arrayContaining(['legal']));
    expect(d.severity).toBe('high');
  });

  it('is word-boundary safe — "בעוד" and "issue" do not fire legal', () => {
    const d1 = detectHandoff('נדבר בעוד שבוע על המשלוח', []);
    expect(d1.triggers).not.toContain('legal');
    const d2 = detectHandoff('I have an issue with sizing', []);
    expect(d2.triggers).not.toContain('legal'); // "issue" ⊃ "sue" must NOT match
  });

  it('respects the enabledTriggers toggle', () => {
    const d = detectHandoff('אני רוצה החזר כספי', [], { enabledTriggers: { refund_return: false } });
    expect(d.triggers).not.toContain('refund_return');
    expect(d.triggered).toBe(false);
  });

  it('fires low_confidence only when confidence < threshold', () => {
    const under = detectHandoff('שאלה כללית', [], { confidence: 0.2, lowConfidenceThreshold: 0.4 });
    expect(under.triggers).toContain('low_confidence');
    const over = detectHandoff('שאלה כללית', [], { confidence: 0.9, lowConfidenceThreshold: 0.4 });
    expect(over.triggered).toBe(false);
  });

  it('fires frustration only when current AND a prior message are negative', () => {
    const d = detectHandoff('זה נורא, נמאס לי', ['אתם גרועים']);
    expect(d.triggers).toContain('frustration');
    const single = detectHandoff('זה נורא', []);
    expect(single.triggers).not.toContain('frustration');
  });

  it('returns triggered=false / empty on a benign message', () => {
    const d = detectHandoff('מתי המוצר יגיע?', []);
    expect(d).toEqual({ triggered: false, triggers: [], severity: 'low', reason: '' });
  });
});
```

- [ ] Step 2: Run the test to verify it fails — `npx vitest run tests/unit/detect-handoff.test.ts`. Expected FAIL: `detectHandoff is not a function` / `does not provide an export named 'detectHandoff'`.

- [ ] Step 3a: Extend the types — edit `src/engines/escalation/types.ts`, replacing the `EscalationConfig` interface (lines 17-21) in place and appending the handoff types. (`EscalationOutcome` lives in `dispatch.ts` and already has the fields D4 returns — do NOT touch it here.)
```ts
export type HandoffTrigger =
  | 'human_demand'
  | 'refund_return'
  | 'defective_product'
  | 'frustration'
  | 'legal'
  | 'abuse'
  | 'repeated_failure'
  | 'low_confidence';

export interface HandoffDetection {
  triggered: boolean;
  triggers: HandoffTrigger[];
  severity: 'low' | 'medium' | 'high';
  reason: string; // Hebrew, human-readable
}

// Extended IN PLACE (no separate EscalationConfigExtended type). D4 imports/casts this name.
export interface EscalationConfig {
  enabled?: boolean;
  recipients?: EscalationRecipient[];
  dedupeMinutes?: number;
  triggers?: Partial<Record<HandoffTrigger, boolean>>; // per-trigger toggle
  lowConfidenceThreshold?: number;                     // 0..1; fires low_confidence below it
}
```

- [ ] Step 3b: Add `detectHandoff` — append to `src/engines/escalation/detect.ts` (after `detectEscalation`, reusing the existing `LEGAL`, `ABUSE`, `HUMAN_STRONG`, `HUMAN_MANAGER`, `REQUEST_CUE`, `NEGATIVE`, `hasAny`):
```ts
import type { HandoffTrigger, HandoffDetection } from './types';

const REFUND_RETURN = [
  'החזר', 'החזר כספי', 'זיכוי', 'להחזיר', 'החזרה', 'ביטול הזמנה', 'לבטל הזמנה',
  'כסף בחזרה', 'refund', 'return', 'money back', 'chargeback', 'cancel order',
];
const DEFECTIVE = [
  'פגום', 'פגומה', 'שבור', 'שבורה', 'מקולקל', 'מקולקלת', 'התקלקל', 'לא עובד',
  'לא עובדת', 'לא תקין', 'defective', 'broken', 'damaged', 'not working', 'faulty',
];
const REPEATED_FAILURE = [
  'עוד פעם', 'פעם שלישית', 'שוב אותה', 'שוב אותו', 'עדיין לא', 'כמה פעמים',
  'again and again', 'third time', 'still not', 'still broken', 'still waiting',
];

const HANDOFF_LABEL: Record<HandoffTrigger, string> = {
  human_demand: 'דרישה מפורשת לנציג אנושי',
  refund_return: 'בקשת החזר / החזרה',
  defective_product: 'מוצר פגום',
  frustration: 'תסכול / כעס',
  legal: 'איום בתביעה / פנייה משפטית',
  abuse: 'התנהגות פוגענית / קללות',
  repeated_failure: 'כשל חוזר בטיפול',
  low_confidence: 'הבוט אינו בטוח בתשובה',
};

const SEV_RANK: Record<'low' | 'medium' | 'high', number> = { low: 1, medium: 2, high: 3 };
const TRIGGER_SEVERITY: Record<HandoffTrigger, 'low' | 'medium' | 'high'> = {
  legal: 'high',
  abuse: 'high',
  human_demand: 'high',
  refund_return: 'medium',
  defective_product: 'medium',
  repeated_failure: 'medium',
  frustration: 'low',
  low_confidence: 'low',
};

export function detectHandoff(
  message: string,
  priorUserTexts: string[] = [],
  opts?: {
    enabledTriggers?: Partial<Record<HandoffTrigger, boolean>>;
    lowConfidenceThreshold?: number;
    confidence?: number;
  },
): HandoffDetection {
  const msg = message || '';
  const on = (t: HandoffTrigger) => opts?.enabledTriggers?.[t] !== false;
  const found: HandoffTrigger[] = [];

  if (on('legal') && hasAny(msg, LEGAL)) found.push('legal');
  if (on('abuse') && hasAny(msg, ABUSE)) found.push('abuse');
  const humanDemand =
    hasAny(msg, HUMAN_STRONG) || (hasAny(msg, HUMAN_MANAGER) && hasAny(msg, REQUEST_CUE));
  if (on('human_demand') && humanDemand) found.push('human_demand');
  if (on('refund_return') && hasAny(msg, REFUND_RETURN)) found.push('refund_return');
  if (on('defective_product') && hasAny(msg, DEFECTIVE)) found.push('defective_product');
  if (on('repeated_failure') && hasAny(msg, REPEATED_FAILURE)) found.push('repeated_failure');

  const currentNegative = hasAny(msg, NEGATIVE);
  const priorNegative = priorUserTexts.some((m) => hasAny(m, NEGATIVE));
  if (on('frustration') && currentNegative && priorNegative) found.push('frustration');

  if (
    on('low_confidence') &&
    typeof opts?.confidence === 'number' &&
    typeof opts?.lowConfidenceThreshold === 'number' &&
    opts.confidence < opts.lowConfidenceThreshold
  ) {
    found.push('low_confidence');
  }

  let severity: 'low' | 'medium' | 'high' = 'low';
  for (const t of found) {
    if (SEV_RANK[TRIGGER_SEVERITY[t]] > SEV_RANK[severity]) severity = TRIGGER_SEVERITY[t];
  }

  return {
    triggered: found.length > 0,
    triggers: found,
    severity,
    reason: found.map((t) => HANDOFF_LABEL[t]).join(' + '),
  };
}
```

- [ ] Step 4: Run the test to verify it passes — `npx vitest run tests/unit/detect-handoff.test.ts`. Expected PASS: `8 passed`.

- [ ] Step 5: Commit —
```bash
git add src/engines/escalation/types.ts src/engines/escalation/detect.ts tests/unit/detect-handoff.test.ts
git commit -m "feat(handoff): detectHandoff triggers + toggleable EscalationConfig (word-boundary safe)"
```

---

### Task D3: Bot-pause module (`isBotPaused`/`pauseBot`/`resumeBot`)

**Files:**
- Create: `src/lib/handoff/bot-pause.ts`
- Test: `tests/unit/bot-pause.test.ts`

**Interfaces:**
- Consumes: `import { supabase } from '@/lib/supabase'`; migration `069` columns `chat_sessions.bot_paused / bot_paused_at / bot_paused_reason`.
- Produces:
  - `isBotPaused(chatSessionId: string): Promise<boolean>`
  - `pauseBot(chatSessionId: string, reason: string): Promise<void>` (sets `bot_paused=true`, `bot_paused_at=now()`, `bot_paused_reason=reason`)
  - `resumeBot(chatSessionId: string): Promise<void>` (clears all three)

Consumed by Task D4 (`pauseBot`), Task D5 (`pauseBot`/`resumeBot`), Task D6 (`pauseBot('human_reply')`), the **C6 agent loop** (`isBotPaused` guard — step 2 of `runCsTurn`, already tested in `cs-agent.test.ts`), and the **C4 `escalate_to_human` tool** (`pauseBot`, tested in `cs-tools.test.ts`). This task builds ONLY the module; the guard/pause call sites already exist in Phase C (they dynamically import + mock this module).

- [ ] Step 1: Write the failing test — create `tests/unit/bot-pause.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeSupabase(row: any) {
  const updates: any[] = [];
  const api: any = {
    updates,
    from() {
      const ctx: any = {};
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.maybeSingle = async () => ({ data: row, error: null });
      ctx.update = (patch: any) => {
        updates.push(patch);
        return { eq: async () => ({ data: null, error: null }) };
      };
      return ctx;
    },
  };
  return api;
}

describe('bot-pause', () => {
  beforeEach(() => vi.resetModules());

  it('isBotPaused reads chat_sessions.bot_paused', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSupabase({ bot_paused: true }) }));
    const { isBotPaused } = await import('@/lib/handoff/bot-pause');
    expect(await isBotPaused('cs-1')).toBe(true);
  });

  it('isBotPaused returns false for empty id (no query)', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSupabase(null) }));
    const { isBotPaused } = await import('@/lib/handoff/bot-pause');
    expect(await isBotPaused('')).toBe(false);
  });

  it('pauseBot sets all three columns', async () => {
    const sb = makeSupabase(null);
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { pauseBot } = await import('@/lib/handoff/bot-pause');
    await pauseBot('cs-1', 'human_reply');
    expect(sb.updates[0].bot_paused).toBe(true);
    expect(sb.updates[0].bot_paused_reason).toBe('human_reply');
    expect(sb.updates[0].bot_paused_at).toBeTruthy();
  });

  it('resumeBot clears all three columns', async () => {
    const sb = makeSupabase(null);
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }));
    const { resumeBot } = await import('@/lib/handoff/bot-pause');
    await resumeBot('cs-1');
    expect(sb.updates[0]).toEqual({ bot_paused: false, bot_paused_at: null, bot_paused_reason: null });
  });
});
```

- [ ] Step 2: Run the test to verify it fails — `npx vitest run tests/unit/bot-pause.test.ts`. Expected FAIL: `Failed to resolve import "@/lib/handoff/bot-pause"`. (The orchestrator-level pause GUARD behaviour — paused thread → `{kind:'none'}` — is already covered by `cs-agent.test.ts` in Phase C, which mocks this module; this task ships only the module.)

- [ ] Step 3: Write the implementation — create `src/lib/handoff/bot-pause.ts`:
```ts
import { supabase } from '@/lib/supabase';

/** Per-conversation bot pause state, stored on chat_sessions (migration 069). */
export async function isBotPaused(chatSessionId: string): Promise<boolean> {
  if (!chatSessionId) return false;
  const { data } = await supabase
    .from('chat_sessions')
    .select('bot_paused')
    .eq('id', chatSessionId)
    .maybeSingle();
  return Boolean(data?.bot_paused);
}

export async function pauseBot(chatSessionId: string, reason: string): Promise<void> {
  if (!chatSessionId) return;
  await supabase
    .from('chat_sessions')
    .update({
      bot_paused: true,
      bot_paused_at: new Date().toISOString(),
      bot_paused_reason: reason,
    })
    .eq('id', chatSessionId);
}

export async function resumeBot(chatSessionId: string): Promise<void> {
  if (!chatSessionId) return;
  await supabase
    .from('chat_sessions')
    .update({ bot_paused: false, bot_paused_at: null, bot_paused_reason: null })
    .eq('id', chatSessionId);
}
```

- [ ] Step 4: Run the test to verify it passes — `npx vitest run tests/unit/bot-pause.test.ts`. Expected PASS: `4 passed`. Then re-run the Phase-C loop test that consumes this module to confirm the guard wiring is now real: `npx vitest run tests/unit/cs-agent.test.ts` (still green). Then `npm run type-check`.

- [ ] Step 5: Commit —
```bash
git add src/lib/handoff/bot-pause.ts tests/unit/bot-pause.test.ts
git commit -m "feat(handoff): bot-pause read/write over chat_sessions (consumed by the CS loop guard)"
```

---

### Task D4: Wire handoff into dispatch (`runCsHandoffCheck`)

**Files:**
- Modify: `src/engines/escalation/dispatch.ts` (add `runCsHandoffCheck`, reusing `resolveRecipients`, `buildEscalationEmail`, `sendEmail`, `sendAdminAlert`, and the audit/dedup pattern from `runEscalationCheck` lines 36-146)
- Test: `tests/unit/cs-handoff-dispatch.test.ts`

**Interfaces:**
- Consumes: `detectHandoff` (Task D2), `pauseBot` (Task D3), `appendCsTicketHistory` (Task D1), `resolveRecipients`, `buildEscalationEmail`, `sendEmail`, `sendAdminAlert`, `EscalationConfig` (extended), `EscalationOutcome`; `import { supabase as supabaseAdmin } from '@/lib/supabase'`.
- Produces:
  - `interface CsHandoffInput { accountId: string; chatSessionId: string; ticketId: string | null; waId: string; userMessage: string; confidence?: number }`
  - `runCsHandoffCheck(input: CsHandoffInput, depsOverride?: Partial<{ supabase: any; sendEmail: typeof sendEmail; pauseBot: typeof pauseBot; now: () => number }>): Promise<EscalationOutcome>` — gated on `ESCALATION_ENABLED` + `config.escalation.enabled`; on trigger (or `input.force`): `pauseBot`, flag ticket, notify recipients (email + admin fallback), insert `source='auto_escalation'` audit row (in-app surface + dedup). `EscalationOutcome` is the EXISTING return type in `dispatch.ts` (already carries `escalated/reason/recipientsNotified/deduped/skipped` — no widening needed).

Called by the **C6 agent loop** as the `detectHandoff` code backstop (no `force`), and by the **C4 `escalate_to_human` tool** with `force: true` (the brain already decided). Both dynamically import it and mock it in their Phase-C tests; this task ships the real function.

- [ ] Step 1: Write the failing test — create `tests/unit/cs-handoff-dispatch.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeSupabase(opts: { config?: any; recent?: any[] } = {}) {
  const inserts: any[] = [];
  const api: any = {
    inserts,
    from(table: string) {
      const ctx: any = { table };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.gte = () => ctx;
      ctx.order = () => ctx;
      ctx.limit = () => ctx;
      ctx.single = async () =>
        table === 'accounts' ? { data: { config: opts.config ?? {} }, error: null } : { data: null, error: null };
      ctx.insert = async (row: any) => { inserts.push({ table, row }); return { data: null, error: null }; };
      ctx.then = (resolve: any) =>
        resolve({ data: table === 'support_requests' ? (opts.recent ?? []) : [], error: null });
      return ctx;
    },
  };
  return api;
}

describe('runCsHandoffCheck', () => {
  beforeEach(() => { vi.resetModules(); process.env.ESCALATION_ENABLED = 'true'; });

  it('is a no-op when the flag is off', async () => {
    process.env.ESCALATION_ENABLED = 'false';
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'החזר כספי' },
      { supabase: makeSupabase() as any, sendEmail: vi.fn() as any, pauseBot: vi.fn() as any, now: () => 0 },
    );
    expect(r).toEqual({ escalated: false, skipped: 'flag_off' });
  });

  it('does nothing when no trigger fires', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const pauseBot = vi.fn();
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'מתי יגיע?' },
      { supabase: makeSupabase({ config: { escalation: { enabled: true } } }) as any, sendEmail: vi.fn() as any, pauseBot: pauseBot as any, now: () => 0 },
    );
    expect(r.escalated).toBe(false);
    expect(pauseBot).not.toHaveBeenCalled();
  });

  it('on trigger: pauses bot, emails a recipient, and writes an audit row', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const pauseBot = vi.fn();
    const sendEmail = vi.fn().mockResolvedValue({ success: true });
    const sb = makeSupabase({
      config: { escalation: { enabled: true, recipients: [{ name: 'Rep', email: 'rep@brand.co' }] } },
    });
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'המוצר הגיע שבור, אני רוצה החזר כספי' },
      { supabase: sb as any, sendEmail: sendEmail as any, pauseBot: pauseBot as any, now: () => 0 },
    );
    expect(r.escalated).toBe(true);
    expect(pauseBot).toHaveBeenCalledWith('cs1', expect.stringContaining('handoff'));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const audit = sb.inserts.find((i: any) => i.table === 'support_requests');
    expect(audit.row.source).toBe('auto_escalation');
    expect(audit.row.metadata.escalation.origin).toBe('whatsapp_cs');
  });

  it('dedups a second alert inside the window', async () => {
    const { runCsHandoffCheck } = await import('@/engines/escalation/dispatch');
    const sb = makeSupabase({ config: { escalation: { enabled: true } }, recent: [{ id: 'x' }] });
    const r = await runCsHandoffCheck(
      { accountId: 'a1', chatSessionId: 'cs1', ticketId: 't1', waId: '972501234567', userMessage: 'החזר כספי' },
      { supabase: sb as any, sendEmail: vi.fn() as any, pauseBot: vi.fn() as any, now: () => 0 },
    );
    expect(r).toEqual({ escalated: false, deduped: true });
  });
});
```

- [ ] Step 2: Run the test to verify it fails — `npx vitest run tests/unit/cs-handoff-dispatch.test.ts`. Expected FAIL: `dispatch.ts does not provide an export named 'runCsHandoffCheck'`.

- [ ] Step 3: Add the function — append to `src/engines/escalation/dispatch.ts` (imports at top, function at end):
```ts
// add to the existing import block:
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { detectHandoff } from './detect';
import { pauseBot as pauseBotDefault } from '@/lib/handoff/bot-pause';
import { appendCsTicketHistory } from '@/lib/cs/cs-ticket';

export interface CsHandoffInput {
  accountId: string;
  chatSessionId: string;
  ticketId: string | null;
  waId: string;
  userMessage: string;
  confidence?: number;
  force?: boolean; // brain-initiated escalate_to_human → skip detection, always escalate (still flag/dedup gated)
}

export interface CsHandoffDeps {
  supabase: any;
  sendEmail: typeof sendEmail;
  pauseBot: typeof pauseBotDefault;
  now: () => number;
}

/**
 * WhatsApp CS handoff. Reuses the escalation audit/dedup/notify path but drives
 * detectHandoff (richer trigger set) and pauses the bound thread's chat_session.
 * Read-only for the store — a human takes over via /api/cs/reply.
 */
export async function runCsHandoffCheck(
  input: CsHandoffInput,
  depsOverride?: Partial<CsHandoffDeps>,
): Promise<EscalationOutcome> {
  if (process.env.ESCALATION_ENABLED !== 'true') return { escalated: false, skipped: 'flag_off' };

  const deps: CsHandoffDeps = {
    supabase: depsOverride?.supabase ?? supabaseAdmin,
    sendEmail: depsOverride?.sendEmail ?? sendEmail,
    pauseBot: depsOverride?.pauseBot ?? pauseBotDefault,
    now: depsOverride?.now ?? (() => Date.now()),
  };
  const { supabase } = deps;

  const { data: acct } = await supabase.from('accounts').select('config').eq('id', input.accountId).single();
  const config = (acct?.config || {}) as Record<string, any>;
  const escalationConfig = (config.escalation || {}) as EscalationConfig;
  if (escalationConfig.enabled === false) return { escalated: false, skipped: 'disabled' };

  // prior user texts from the bound thread (frustration needs history)
  let priorUserTexts: string[] = [];
  if (input.chatSessionId) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', input.chatSessionId)
      .order('created_at', { ascending: false })
      .limit(8);
    priorUserTexts = (msgs || []).reverse().filter((m: any) => m.role === 'user').map((m: any) => m.content);
  }

  // force (from the escalate_to_human tool — the brain already decided) → skip detection, always escalate.
  const detection = input.force
    ? { triggered: true, triggers: ['human_demand'] as any[], severity: 'high' as const, reason: input.userMessage }
    : detectHandoff(input.userMessage, priorUserTexts, {
        enabledTriggers: escalationConfig.triggers,
        lowConfidenceThreshold: escalationConfig.lowConfidenceThreshold,
        confidence: input.confidence,
      });
  if (!detection.triggered) return { escalated: false };

  // dedup: one alert per chat session per window
  const dedupeMin = escalationConfig.dedupeMinutes ?? 15;
  const sinceIso = new Date(deps.now() - dedupeMin * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('support_requests')
    .select('id')
    .eq('session_id', input.chatSessionId)
    .eq('source', 'auto_escalation')
    .gte('created_at', sinceIso)
    .limit(1);
  if (recent && recent.length > 0) return { escalated: false, deduped: true };

  // 1) pause the bot for this thread
  await deps.pauseBot(input.chatSessionId, `handoff:${detection.triggers.join(',')}`);

  // 2) flag the ticket
  if (input.ticketId) {
    await appendCsTicketHistory({
      ticketId: input.ticketId,
      accountId: input.accountId,
      action: 'status_change',
      actor: 'system',
      note: `handoff — ${detection.reason}`,
    });
  }

  // 3) notify configured recipients (email) + never-silent fallback
  const recipients = await resolveRecipients(supabase, input.accountId, escalationConfig);
  const brandName = config.brandName || config.username || 'Account';
  const emailTargets = recipients.flatMap((r) => (r.email ? [r.email] : []));
  let notified = 0;
  const channels: any[] = [];
  if (emailTargets.length > 0) {
    const { subject, html } = buildEscalationEmail({
      brandName,
      reason: detection.reason,
      severity: detection.severity === 'high' ? 'critical' : 'high',
      customerPhone: input.waId,
      userMessage: input.userMessage,
      lastMessages: [],
      sessionId: input.chatSessionId,
    });
    const res = await deps.sendEmail({ to: emailTargets, subject, html });
    if (res.success) notified = emailTargets.length;
    channels.push({ channel: 'email', success: res.success, error: res.error });
  }
  if (recipients.length === 0) {
    const { sendAdminAlert } = await import('@/lib/email');
    await sendAdminAlert({
      level: 'critical',
      subject: `Handoff ללא נמען — ${brandName}`,
      message: detection.reason,
      details: input.userMessage,
    });
    channels.push({ channel: 'admin_fallback', success: true });
  }

  // 4) audit row — also the in-app surface (shows in the support inbox) + powers dedup
  await supabase.from('support_requests').insert({
    account_id: input.accountId,
    customer_name: null,
    customer_phone: input.waId,
    message: input.userMessage,
    session_id: input.chatSessionId,
    status: 'new',
    source: 'auto_escalation',
    metadata: {
      escalation: {
        severity: detection.severity,
        reason: detection.reason,
        triggers: detection.triggers,
        detected_at: new Date(deps.now()).toISOString(),
        recipients_notified: notified,
        channels,
        origin: 'whatsapp_cs',
        ticket_id: input.ticketId,
      },
    },
  });

  return { escalated: true, reason: detection.reason, recipientsNotified: notified };
}
```

- [ ] Step 4: Run the test to verify it passes — `npx vitest run tests/unit/cs-handoff-dispatch.test.ts`. Expected PASS: `4 passed`.

- [ ] Step 5: Commit —
```bash
git add src/engines/escalation/dispatch.ts tests/unit/cs-handoff-dispatch.test.ts
git commit -m "feat(handoff): runCsHandoffCheck — pause + flag ticket + notify recipients (audit/dedup reuse)"
```

---

### Task D5: Manual bot-toggle endpoint (`/api/influencer/conversations/bot-toggle`)

**Files:**
- Create: `src/app/api/influencer/conversations/bot-toggle/route.ts`
- Test: `tests/unit/bot-toggle-route.test.ts`

**Interfaces:**
- Consumes: `pauseBot`/`resumeBot` (Task D3); `import { supabase } from '@/lib/supabase'`; `requireAdminAuth` from `@/lib/auth/admin-auth`; `checkInfluencerAuth` from `@/lib/auth/influencer-auth`.
- Produces: `POST` handler accepting `{ chatSessionId: string; action: 'pause' | 'resume' }` → `{ ok: true, chatSessionId, action }`. Manual resume only — no auto-resume timer.

- [ ] Step 1: Write the failing test — create `tests/unit/bot-toggle-route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pauseBot = vi.fn();
const resumeBot = vi.fn();
vi.mock('@/lib/handoff/bot-pause', () => ({ pauseBot, resumeBot, isBotPaused: vi.fn() }));
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: vi.fn(async () => null) })); // null === admin OK
vi.mock('@/lib/auth/influencer-auth', () => ({ checkInfluencerAuth: vi.fn(async () => false) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            t === 'chat_sessions'
              ? { data: { id: 'cs1', account_id: 'a1' } }
              : { data: { config: { username: 'argania' } } },
        }),
      }),
    }),
  },
  getInfluencerByUsername: vi.fn(),
}));

function req(body: any) {
  return new Request('http://x/api/influencer/conversations/bot-toggle', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as any;
}

describe('POST /api/influencer/conversations/bot-toggle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a bad action with 400', async () => {
    const { POST } = await import('@/app/api/influencer/conversations/bot-toggle/route');
    const res = await POST(req({ chatSessionId: 'cs1', action: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('pauses when action=pause', async () => {
    const { POST } = await import('@/app/api/influencer/conversations/bot-toggle/route');
    const res = await POST(req({ chatSessionId: 'cs1', action: 'pause' }));
    expect(res.status).toBe(200);
    expect(pauseBot).toHaveBeenCalledWith('cs1', 'manual');
  });

  it('resumes when action=resume', async () => {
    const { POST } = await import('@/app/api/influencer/conversations/bot-toggle/route');
    const res = await POST(req({ chatSessionId: 'cs1', action: 'resume' }));
    expect(res.status).toBe(200);
    expect(resumeBot).toHaveBeenCalledWith('cs1');
  });
});
```

- [ ] Step 2: Run the test to verify it fails — `npx vitest run tests/unit/bot-toggle-route.test.ts`. Expected FAIL: `Failed to resolve import "@/app/api/influencer/conversations/bot-toggle/route"`.

- [ ] Step 3: Write the route — create `src/app/api/influencer/conversations/bot-toggle/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { pauseBot, resumeBot } from '@/lib/handoff/bot-pause';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const chatSessionId = (body?.chatSessionId || '').toString().trim();
  const action = (body?.action || '').toString();
  if (!chatSessionId || (action !== 'pause' && action !== 'resume')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // resolve the owning account so we can authorize the influencer
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, account_id')
    .eq('id', chatSessionId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', session.account_id)
    .maybeSingle();
  const username = account?.config?.username || '';

  const isAdmin = (await requireAdminAuth()) === null;
  const isInfluencer = username ? await checkInfluencerAuth(username) : false;
  if (!isAdmin && !isInfluencer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (action === 'pause') await pauseBot(chatSessionId, 'manual');
  else await resumeBot(chatSessionId); // manual resume only — no auto-resume

  return NextResponse.json({ ok: true, chatSessionId, action });
}
```

- [ ] Step 4: Run the test to verify it passes — `npx vitest run tests/unit/bot-toggle-route.test.ts`. Expected PASS: `3 passed`.

- [ ] Step 5: Commit —
```bash
git add src/app/api/influencer/conversations/bot-toggle/route.ts tests/unit/bot-toggle-route.test.ts
git commit -m "feat(handoff): manual per-conversation bot pause/resume endpoint"
```

---

### Task D6: Bestie-inbox human reply (`/api/cs/reply`)

**Files:**
- Create: `src/app/api/cs/reply/route.ts`
- Test: `tests/unit/cs-reply-route.test.ts`

**Interfaces:**
- Consumes: `loadCsSession(waId): Promise<CsSessionRow | null>` from `@/lib/cs/cs-session` (Phase A); `sendText` from `@/lib/whatsapp-cloud/client`; `pauseBot` (Task D3); `appendCsTicketHistory` (Task D1); `requireAdminAuth` from `@/lib/auth/admin-auth`.
- Produces: `POST` handler accepting `{ waId: string; body: string }` → sends `sendText` out the shared Bestie number, auto-sets `bot_paused_reason='human_reply'` on the bound `chat_session`, appends an `agent_message` history row. Returns `{ ok, wa_message_id, error }`.

- [ ] Step 1: Write the failing test — create `tests/unit/cs-reply-route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendText = vi.fn(async () => ({ success: true, wa_message_id: 'wamid.out.1' }));
const pauseBot = vi.fn();
const appendCsTicketHistory = vi.fn();
const loadCsSession = vi.fn();

vi.mock('@/lib/whatsapp-cloud/client', () => ({ sendText }));
vi.mock('@/lib/handoff/bot-pause', () => ({ pauseBot, isBotPaused: vi.fn(), resumeBot: vi.fn() }));
vi.mock('@/lib/cs/cs-ticket', () => ({ appendCsTicketHistory, openOrAttachCsTicket: vi.fn() }));
vi.mock('@/lib/cs/cs-session', () => ({ loadCsSession }));
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: vi.fn(async () => null) }));

function req(body: any) {
  return new Request('http://x/api/cs/reply', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as any;
}

describe('POST /api/cs/reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadCsSession.mockResolvedValue({
      wa_id: '972501234567',
      active_account_id: 'a1',
      active_chat_session_id: 'cs1',
      active_ticket_id: 't1',
    });
  });

  it('400 on empty body', async () => {
    const { POST } = await import('@/app/api/cs/reply/route');
    const res = await POST(req({ waId: '972501234567', body: '' }));
    expect(res.status).toBe(400);
  });

  it('404 when no active CS thread', async () => {
    loadCsSession.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/cs/reply/route');
    const res = await POST(req({ waId: '972501234567', body: 'hi' }));
    expect(res.status).toBe(404);
  });

  it('sends the reply, pauses the bot as human_reply, and logs agent_message', async () => {
    const { POST } = await import('@/app/api/cs/reply/route');
    const res = await POST(req({ waId: '972501234567', body: 'שלחנו לך שוב' }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(sendText).toHaveBeenCalledWith({ to: '972501234567', body: 'שלחנו לך שוב' });
    expect(pauseBot).toHaveBeenCalledWith('cs1', 'human_reply');
    expect(appendCsTicketHistory).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 't1', action: 'agent_message', actor: 'bestie_inbox' }),
    );
  });
});
```

- [ ] Step 2: Run the test to verify it fails — `npx vitest run tests/unit/cs-reply-route.test.ts`. Expected FAIL: `Failed to resolve import "@/app/api/cs/reply/route"`.

- [ ] Step 3: Write the route — create `src/app/api/cs/reply/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { sendText } from '@/lib/whatsapp-cloud/client';
import { loadCsSession } from '@/lib/cs/cs-session';
import { pauseBot } from '@/lib/handoff/bot-pause';
import { appendCsTicketHistory } from '@/lib/cs/cs-ticket';

export const runtime = 'nodejs';

const MAX_BODY = 4000; // WhatsApp text body cap is 4096

/** Bestie-inbox human reply: out the shared Bestie number, auto-pauses the bot for this thread. */
export async function POST(req: NextRequest) {
  if ((await requireAdminAuth()) !== null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const waId = (body?.waId || '').toString().trim();
  const messageBody = (body?.body || '').toString().trim();
  if (!waId || !messageBody) {
    return NextResponse.json({ error: 'bad_request', message: 'waId ו-body נדרשים' }, { status: 400 });
  }
  if (messageBody.length > MAX_BODY) {
    return NextResponse.json({ error: 'too_long', limit: MAX_BODY }, { status: 400 });
  }

  const cs = await loadCsSession(waId);
  if (!cs || !cs.active_account_id) {
    return NextResponse.json({ error: 'no_active_thread' }, { status: 404 });
  }

  // customer-initiated CS conversations → free-form text is valid inside the 24h window.
  const result = await sendText({ to: waId, body: messageBody });

  // a human message takes over — pause the bot until manual resume.
  if (cs.active_chat_session_id) {
    await pauseBot(cs.active_chat_session_id, 'human_reply');
  }

  if (cs.active_ticket_id) {
    await appendCsTicketHistory({
      ticketId: cs.active_ticket_id,
      accountId: cs.active_account_id,
      action: 'agent_message',
      actor: 'bestie_inbox',
      body_text: messageBody,
      whatsapp_message_id: result.wa_message_id || null,
      note: result.success ? undefined : `Send failed: ${result.error?.message || 'unknown'}`,
    });
  }

  return NextResponse.json({
    ok: result.success,
    wa_message_id: result.wa_message_id || null,
    error: result.success ? null : result.error?.message || 'send_failed',
  });
}
```

- [ ] Step 4: Run the test to verify it passes — `npx vitest run tests/unit/cs-reply-route.test.ts`. Expected PASS: `3 passed`.

- [ ] Step 5: Commit —
```bash
git add src/app/api/cs/reply/route.ts tests/unit/cs-reply-route.test.ts
git commit -m "feat(handoff): Bestie-inbox human reply → same number, auto human_reply pause"
```

---

### Task D7: Cross-phase test suite (brand resolver, QuickShop adapter, lookupOrder, session store, QuickShop webhook)

These five files add **cross-phase characterization / regression** coverage over code shipped in Phases A/B/C. **This is explicitly NOT a TDD red→green task** — the SUT already exists, so these tests are expected to PASS on first run; a failure means a real defect in the prior-phase module that must be fixed (in the module, not the test) before committing. They live at **distinct `xphase-*` paths** so they never overwrite the phase-owned suites — the Phase-A/B/C tasks own `tests/unit/cs-brand-resolver.test.ts` (C1), `tests/unit/quickshop-adapter.test.ts` (B2), `tests/unit/lookup-order.test.ts` (B6), `tests/unit/cs-agent.test.ts` (C6, the brain-led loop) and `tests/unit/cs-session-store.test.ts` (A9), and `tests/unit/quickshop-webhook.test.ts` (B7); this task must not clobber any of them. All follow the established Vitest conventions (jsdom, `global.fetch` is already a `vi.fn()`, top-level `vi.mock()` before `await import()`).

**Files:**
- Create (distinct paths — no collision with the phase-owned suites above): `tests/unit/xphase-cs-brand-resolver.test.ts`, `tests/unit/xphase-quickshop-adapter.test.ts`, `tests/unit/xphase-lookup-order.test.ts`, `tests/unit/xphase-cs-session-store.test.ts`, `tests/unit/xphase-quickshop-webhook.test.ts`

**Interfaces:**
- Consumes (all from the contract): `resolveBrand`/`listCsEnabledBrands` (`@/lib/cs/brand-resolver`); QuickShop connector via `getConnector('quickshop')` (`@/lib/orders/connectors/registry`); `lookupOrder` (`@/lib/orders/lookup`); `phoneMatches` (`@/lib/orders/phone-verify`); `isWarm`/`WARM_WINDOW_MS`/`saveCsSession` (`@/lib/cs/cs-session`); QuickShop webhook `POST` route (`@/app/api/webhooks/quickshop/[accountToken]/route`); `upsertBrandOrder` (`@/lib/orders/brand-orders`).
- Produces: no runtime exports — verification artifacts only.

- [ ] Step 1a: Write `tests/unit/xphase-cs-brand-resolver.test.ts` (fuzzy 0/1/N over CS-enabled vocabulary, aliases, Hebrew/English/misspelling):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Query-shape-agnostic accounts fake: returns two CS-enabled brands for any select/rpc chain.
const BRANDS = [
  { id: 'acc-argania', config: { username: 'argania', display_name: 'Argania',
    whatsapp_cs: { enabled: true, aliases: ['ארגניה', 'argan'] }, widget: { domain: 'argania-oil.co.il' } } },
  { id: 'acc-labeaute', config: { username: 'labeaute', display_name: 'LA BEAUTÉ',
    whatsapp_cs: { enabled: true, aliases: ['לה בוטה'] }, widget: { domain: 'labeaute.co.il' } } },
];
function makeSupabase() {
  const api: any = {
    from() {
      const ctx: any = {};
      ctx.select = () => ctx; ctx.eq = () => ctx; ctx.filter = () => ctx; ctx.limit = () => ctx;
      ctx.then = (resolve: any) => resolve({ data: BRANDS, error: null });
      return ctx;
    },
    rpc: async () => ({ data: BRANDS, error: null }),
  };
  return api;
}
vi.mock('@/lib/supabase', () => ({ supabase: makeSupabase() }));

describe('brand-resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listCsEnabledBrands returns only CS-enabled brands', async () => {
    const { listCsEnabledBrands } = await import('@/lib/cs/brand-resolver');
    const brands = await listCsEnabledBrands();
    expect(brands.map((b) => b.accountId).sort()).toEqual(['acc-argania', 'acc-labeaute']);
  });

  it('exact alias → single', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('ארגניה');
    expect(r.kind).toBe('single');
    expect(r.candidates[0].accountId).toBe('acc-argania');
  });

  it('English name + a small misspelling still resolves argania', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('argani');
    expect(['single', 'multi']).toContain(r.kind);
    expect(r.candidates.map((c) => c.accountId)).toContain('acc-argania');
  });

  it('gibberish → none', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('zzzzqqq-not-a-brand');
    expect(r.kind).toBe('none');
    expect(r.candidates).toEqual([]);
  });
});
```

- [ ] Step 1b: Write `tests/unit/xphase-quickshop-adapter.test.ts` (`normalizeWebhook` + `pull` mapping → `NormalizedOrder`; `global.fetch` mocked):
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConnector } from '@/lib/orders/connectors/registry';

const DETAIL = {
  id: 'qs_9001', order_number: '1042',
  customer_name: 'דנה', customer_email: 'dana@x.co', customer_phone: '0501234567',
  financial_status: 'paid', fulfillment_status: 'fulfilled', status: 'open',
  line_items: [{ id: 'li1', name: 'שמן ארגן', sku: 'ARG-01', quantity: 2, price: '99.00', total: '198.00', image_url: 'https://img/x.jpg' }],
  tracking_number: 'RR123', tracking_url: 'https://track/RR123',
  total: '198.00', currency: 'ILS', created_at: '2026-07-01T10:00:00Z',
};

describe('quickshop connector', () => {
  beforeEach(() => (global.fetch as any).mockReset?.());

  it('normalizeWebhook maps { event, data } → NormalizedOrder', () => {
    const c = getConnector('quickshop');
    const n = c.normalizeWebhook!({ event: 'order.updated', timestamp: 't', data: DETAIL });
    expect(n.orderNumber).toBe('1042');
    expect(n.externalId).toBe('qs_9001');
    expect(n.customerPhone).toBe('0501234567');
    expect(n.lineItems).toHaveLength(1);
    expect(n.lineItems[0]).toMatchObject({ name: 'שמן ארגן', sku: 'ARG-01', quantity: 2 });
    expect(n.trackingNumber).toBe('RR123');
  });

  it('pull fetches GET /orders/{id} and maps to NormalizedOrder', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      text: async () => JSON.stringify(DETAIL),
      json: async () => DETAIL,
    });
    const c = getConnector('quickshop');
    const n = await c.pull({ platform: 'quickshop', apiKey: 'qs_live_x' }, { id: 'qs_9001' });
    expect(n?.orderNumber).toBe('1042');
    expect(n?.fulfillmentStatus).toBe('fulfilled');
    const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/orders/qs_9001');
  });
});
```

- [ ] Step 1c: Write `tests/unit/xphase-lookup-order.test.ts` (phone-verify branches: present/match/mismatch/absent + not_found):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findBrandOrderByNumber = vi.fn();
const pull = vi.fn();
vi.mock('@/lib/orders/brand-orders', () => ({
  findBrandOrderByNumber,
  findBrandOrdersByPhone: vi.fn(),
  upsertBrandOrder: vi.fn(),
  upsertBrandOrders: vi.fn(),
}));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({ platform: 'quickshop', supportsDirectLookup: false, pull }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: {} } }) }) }) }) },
}));

describe('lookupOrder phone-verify', () => {
  beforeEach(() => { vi.clearAllMocks(); findBrandOrderByNumber.mockResolvedValue({ id: 'b1', external_id: 'qs1', source_platform: 'quickshop' }); });

  it('returns not_found when brand_orders has no row', async () => {
    findBrandOrderByNumber.mockResolvedValueOnce(null);
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const r = await lookupOrder('a1', '1042', '972501234567');
    expect(r.kind).toBe('not_found');
  });

  it('found when order phone matches the sender', async () => {
    pull.mockResolvedValue({ orderNumber: '1042', customerPhone: '0501234567', lineItems: [], status: 'open' });
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const r = await lookupOrder('a1', '1042', '972501234567');
    expect(r.kind).toBe('found');
  });

  it('unverified when order phone does NOT match the sender', async () => {
    pull.mockResolvedValue({ orderNumber: '1042', customerPhone: '0509999999', lineItems: [], status: 'open' });
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const r = await lookupOrder('a1', '1042', '972501234567');
    expect(r.kind).toBe('unverified');
  });

  it('found (revealed) when the order carries no phone', async () => {
    pull.mockResolvedValue({ orderNumber: '1042', customerPhone: null, lineItems: [], status: 'open' });
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const r = await lookupOrder('a1', '1042', '972501234567');
    expect(r.kind).toBe('found');
  });
});
```

- [ ] Step 1d: Write `tests/unit/xphase-cs-session-store.test.ts` (`isWarm` 45-min window + optimistic `saveCsSession` version conflict — the cs-session STORE, distinct from A9's `cs-session-store.test.ts` and C6's brain-loop `cs-agent.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeSupabase(affected: number) {
  const api: any = {
    from() {
      const ctx: any = {};
      ctx.update = () => ctx; ctx.eq = () => ctx;
      // final eq resolves the update; select().then simulates rows-affected
      ctx.select = () => ({ then: (resolve: any) => resolve({ data: new Array(affected).fill({}), error: null }) });
      ctx.then = (resolve: any) => resolve({ data: new Array(affected).fill({}), error: null });
      return ctx;
    },
  };
  return api;
}

describe('cs-session store (isWarm + optimistic version)', () => {
  beforeEach(() => vi.resetModules());

  it('isWarm is true within WARM_WINDOW_MS and false after', async () => {
    const { isWarm, WARM_WINDOW_MS } = await import('@/lib/cs/cs-session');
    const now = Date.parse('2026-07-21T12:00:00Z');
    const warm: any = { last_activity_at: new Date(now - 10 * 60 * 1000).toISOString() };
    const cold: any = { last_activity_at: new Date(now - (WARM_WINDOW_MS + 1000)).toISOString() };
    expect(isWarm(warm, now)).toBe(true);
    expect(isWarm(cold, now)).toBe(false);
  });

  it('saveCsSession succeeds when the version row is updated', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSupabase(1) }));
    const { saveCsSession } = await import('@/lib/cs/cs-session');
    const prev: any = { wa_id: '972501234567', version: 3, phase: 'onboarding' };
    const ok = await saveCsSession(prev, { phase: 'serving' });
    expect(ok).toBe(true);
  });

  it('saveCsSession returns false on a version conflict (0 rows updated)', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSupabase(0) }));
    const { saveCsSession } = await import('@/lib/cs/cs-session');
    const prev: any = { wa_id: '972501234567', version: 3, phase: 'onboarding' };
    const ok = await saveCsSession(prev, { phase: 'serving' });
    expect(ok).toBe(false);
  });
});
```

- [ ] Step 1e: Write `tests/unit/xphase-quickshop-webhook.test.ts` (HMAC verify raw body → `upsertBrandOrder`; bad token 404, bad sig 401, good 200):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

const upsertBrandOrder = vi.fn();
vi.mock('@/lib/orders/brand-orders', () => ({ upsertBrandOrder, upsertBrandOrders: vi.fn() }));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({
    platform: 'quickshop',
    normalizeWebhook: (p: any) => ({ orderNumber: p.data.order_number, externalId: p.data.id, lineItems: [] }),
  }),
}));

// resolve account by config token; carry the webhook_secret for HMAC
const SECRET = 'whsec_test';
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () =>
            val === 'good-token'
              ? { data: { id: 'a1', config: { integrations: { quickshop: { webhook_secret: SECRET } } } } }
              : { data: null },
        }),
      }),
    }),
  },
}));

const BODY = JSON.stringify({ event: 'order.updated', timestamp: 't', data: { id: 'qs1', order_number: '1042' } });
function sign(body: string) {
  return 'sha256=' + createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}
function makeReq(sig?: string) {
  return new Request('http://x/api/webhooks/quickshop/good-token', {
    method: 'POST',
    body: BODY,
    headers: { 'content-type': 'application/json', ...(sig ? { 'x-webhook-signature': sig } : {}) },
  }) as any;
}
const ctx = (token: string) => ({ params: Promise.resolve({ accountToken: token }) });

describe('POST /api/webhooks/quickshop/[accountToken]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('404 on an unknown account token', async () => {
    const { POST } = await import('@/app/api/webhooks/quickshop/[accountToken]/route');
    const res = await POST(makeReq(sign(BODY)), ctx('bad-token') as any);
    expect(res.status).toBe(404);
    expect(upsertBrandOrder).not.toHaveBeenCalled();
  });

  it('401 on an invalid signature', async () => {
    const { POST } = await import('@/app/api/webhooks/quickshop/[accountToken]/route');
    const res = await POST(makeReq('sha256=deadbeef'), ctx('good-token') as any);
    expect(res.status).toBe(401);
    expect(upsertBrandOrder).not.toHaveBeenCalled();
  });

  it('200 + upsert on a valid signature', async () => {
    const { POST } = await import('@/app/api/webhooks/quickshop/[accountToken]/route');
    const res = await POST(makeReq(sign(BODY)), ctx('good-token') as any);
    expect(res.status).toBe(200);
    expect(upsertBrandOrder).toHaveBeenCalledWith('a1', expect.objectContaining({ orderNumber: '1042' }), 'quickshop');
  });
});
```

- [ ] Step 2: Run the whole new suite. Because these are **characterization/regression** tests over already-shipped code (NOT TDD), the expected outcome is PASS on first run:
```bash
npx vitest run tests/unit/xphase-cs-brand-resolver.test.ts tests/unit/xphase-quickshop-adapter.test.ts tests/unit/xphase-lookup-order.test.ts tests/unit/xphase-cs-session-store.test.ts tests/unit/xphase-quickshop-webhook.test.ts
```
Expected PASS: `5 test files, all passed`. If any assertion fails, it is a genuine defect in the corresponding prior-phase module (brand-resolver / quickshop adapter / lookup facade / cs-session / quickshop webhook route) — fix that module (not the test), re-run, then continue. (To sanity-check that an assertion is meaningful and not vacuous, you may temporarily invert one expectation and confirm it fails, then restore it — but do not leave a failing assertion in place.)

- [ ] Step 3: Run the full unit suite to confirm no regression across the CS feature —
```bash
npx vitest run tests/unit
```
Expected PASS: all Phase A–D CS test files green (including `cs-ticket`, `detect-handoff`, `bot-pause`, `cs-handoff-dispatch`, `bot-toggle-route`, `cs-reply-route`).

- [ ] Step 4: Type-check the feature — `npm run type-check`. Expected: no new errors introduced by Phase D files (tsconfig `strict:false`; pre-existing repo errors, if any, are unrelated).

- [ ] Step 5: Commit —
```bash
git add tests/unit/xphase-cs-brand-resolver.test.ts tests/unit/xphase-quickshop-adapter.test.ts tests/unit/xphase-lookup-order.test.ts tests/unit/xphase-cs-session-store.test.ts tests/unit/xphase-quickshop-webhook.test.ts
git commit -m "test(cs): cross-phase regression coverage (resolver, quickshop, lookup, session store, webhook)"
```

---

**Phase D done.** After the final commit, push per project rule (`git push` to `main`). The handoff layer ships **dark** by default — it activates only when `ESCALATION_ENABLED='true'` and a brand sets `config.escalation.enabled` with `recipients` + optional per-`triggers` toggles. Per the spec, **rotate the Argania `qs_live_…` key** once the QuickShop wiring from Phase B is live in production.