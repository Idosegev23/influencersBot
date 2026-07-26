// Structural mirror of the OpenAI chat-completions function-tool schema
// (no hard SDK type dependency), matching src/lib/cs/tools/types.ts.
export interface OpenAIFunctionDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Per-turn tool execution context. */
export interface BestieToolCtx {
  waId: string;
  leadId: string | null;
  accountId: string;          // the bestie account — scopes every knowledge read
  chatSessionId: string | null;
  leadName: string | null;
}

export interface BestieToolResult {
  ok: boolean;
  data?: unknown;                          // structured payload fed back to the model
  qualification?: Record<string, unknown>; // note_lead_detail → merged onto the lead
  handedOff?: boolean;                     // handoff_to_sales → pause future turns
}

export interface BestieTool {
  def: OpenAIFunctionDef;
  handler(args: any, ctx: BestieToolCtx): Promise<BestieToolResult>;
}
