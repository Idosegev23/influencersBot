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
