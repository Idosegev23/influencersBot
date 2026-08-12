// Structural mirror of the OpenAI chat-completions function-tool schema (no hard SDK type dep).
export interface OpenAIFunctionDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

// A product the brain chose to show as a WhatsApp card (image header + prose + a link button).
// Built by show_products from the candidates search_products found earlier IN THE SAME TURN.
export interface CsProductCard {
  productId: string;
  name: string;            // Hebrew display name preferred (nameHe ?? name)
  price: number | null;    // null → the card simply omits its price line
  originalPrice: number | null;
  isOnSale: boolean;
  productUrl: string;      // deep link — already passed isValidProductUrl
  imageUrl: string;        // original (usually .webp); the send path routes it through the JPEG proxy
}

import type { CsIdentity } from '@/lib/cs/identity';

// Per-turn tool execution context. Handlers READ + SCOPE on it; the loop APPLIES the returned signals.
export interface CsToolCtx {
  waId: string;                  // channel_user_id (WhatsApp send address / ticket key; still WA-shaped in M1)
  accountId: string | null;      // bound brand (null until bind_brand); scopes EVERY read
  chatSessionId: string | null;
  ticketId: string | null;
  customerName: string | null;
  identity: CsIdentity;          // WHO is asking + how much we trust it (spec §1). Replaces senderPhone.
  lastImageUrl?: string | null;  // durable URL of an image the shopper sent THIS turn → attached to escalation
  // search_products writes the candidates it returned to the model; show_products reads them back to
  // resolve the refs it was given. Lives on the per-TURN ctx, so a ref can never address a product
  // from an earlier turn (or, more importantly, from a different brand).
  productCandidates?: CsProductCard[];
}

export interface CsToolResult {
  ok: boolean;
  data?: unknown;                                  // structured payload fed back to the model
  bind?: { accountId: string; ticketId?: string | null }; // bind_brand / open_or_attach_ticket
  learnedName?: string;                            // brain-learned name → loop persists + ctx
  escalated?: boolean;                             // escalate_to_human → loop returns { kind:'none' }
  cards?: CsProductCard[];                         // show_products → loop appends to CsTurnResult.cards
  // NOTE: no `interactive` signal — Bestie CS is purely conversational (no button/list MENU tools),
  // so it can scale to ~10,000 brands. Disambiguation happens in prose via resolve_brand + a
  // free-text confirm/clarify, never via a WhatsApp interactive widget. `cards` is not an exception:
  // a product card carries no reply payload, so it never becomes a thing the shopper must pick from.
}

export interface CsTool {
  def: OpenAIFunctionDef;
  handler(args: any, ctx: CsToolCtx): Promise<CsToolResult>;
}
