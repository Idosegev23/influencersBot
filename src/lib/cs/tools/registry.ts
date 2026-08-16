// Archetype-aware tool availability (CS-engine spec 2026-08-12 §4). Availability is cut HERE,
// at registry build, in code — an account without an orders provider NEVER has order tools in
// its definition list, so the prompt cannot be talked into calling what isn't there.
import { getCsTools } from './index';
import type { CsTool, OpenAIFunctionDef } from './types';
import type { CsChannel } from '@/lib/cs/identity';

export interface CsToolsetOpts {
  channel: CsChannel;
  // null = pre-bind on WhatsApp's shared number (brand unknown) → the full set, today's behavior.
  account: { archetype?: string | null; config?: any } | null;
  /**
   * Set when the TENANT WAS DECIDED BY THE ADDRESS, not by the conversation — i.e. a customer's
   * own WhatsApp number (whatsapp_channels), or a web channel. Distinct from `account`, which is
   * also set once the shopper binds a brand mid-conversation on the shared number.
   */
  preBoundAccountId?: string | null;
}

const WHATSAPP_ONLY = new Set(['resolve_brand', 'bind_brand']); // shared-number problem; elsewhere the account IS the brand
const ORDER_TOOLS = new Set(['lookup_order', 'lookup_orders_by_phone']);
const PRODUCT_TOOLS = new Set(['search_products', 'show_products']);
const GOV_ALLOWED = new Set(['remember_name', 'escalate_to_human']); // RAG answers come from the system prompt, not a tool
const NON_BRAND_ALLOWED = new Set(['remember_name', 'list_open_threads', 'open_or_attach_ticket', 'escalate_to_human']);

function hasOrdersProvider(config: any): boolean {
  const i = config?.integrations || {};
  return Boolean(i?.shopify?.admin_api_token || i?.quickshop?.api_key);
}

export function buildCsToolset(opts: CsToolsetOpts): { tools: CsTool[]; defs: OpenAIFunctionDef[] } {
  const all = getCsTools();
  const tools = all.filter((t) => {
    const name = t.def.function.name;
    // Brand-switching tools exist ONLY to solve the shared-number problem. Where the address
    // already names the tenant, offering them would let the conversation be rebound to another
    // account — the leak is closed by never offering the tool, not by validating its arguments.
    if (WHATSAPP_ONLY.has(name) && (opts.channel !== 'whatsapp' || opts.preBoundAccountId)) return false;
    if (!opts.account) return true;
    const archetype = opts.account.archetype || 'brand';
    if (archetype === 'government_ministry') return GOV_ALLOWED.has(name);
    if (archetype !== 'brand') return NON_BRAND_ALLOWED.has(name) || WHATSAPP_ONLY.has(name);
    if (ORDER_TOOLS.has(name)) return hasOrdersProvider(opts.account.config);
    if (PRODUCT_TOOLS.has(name)) return true; // brand — the runtime products_enabled gate inside the tools still applies
    return true;
  });
  return { tools, defs: tools.map((t) => t.def) };
}
