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
  lastImageUrl?: string | null;  // durable URL of an image the shopper sent THIS turn → attached to escalation
}

export interface CsToolResult {
  ok: boolean;
  data?: unknown;                                  // structured payload fed back to the model
  bind?: { accountId: string; ticketId?: string | null }; // bind_brand / open_or_attach_ticket
  learnedName?: string;                            // brain-learned name → loop persists + ctx
  escalated?: boolean;                             // escalate_to_human → loop returns { kind:'none' }
  // NOTE: no `interactive` signal — Bestie CS is purely conversational (no button/list menu tools),
  // so it can scale to ~10,000 brands. Disambiguation happens in prose via resolve_brand + a
  // free-text confirm/clarify, never via a WhatsApp interactive widget.
}

export interface CsTool {
  def: OpenAIFunctionDef;
  handler(args: any, ctx: CsToolCtx): Promise<CsToolResult>;
}
