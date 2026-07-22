/**
 * Placeholder for the Phase-D CS ticket lifecycle (Task D1 — open/attach a `whatsapp_cs`
 * support_requests thread per shopper+brand, plus history append-only log).
 * This stub exists only so `src/lib/cs/tools/index.ts` (Task C4) can resolve its dynamic
 * `import('@/lib/cs/cs-ticket')` — Vitest/Vite's import-analysis needs the module to exist on
 * disk even for a dynamic import before `vi.mock('@/lib/cs/cs-ticket', ...)` can intercept it
 * (same issue Task A7 hit with `wa-cs-worker.ts`, resolved by Task A8's `cs-agent.ts` stub).
 * The tool tests mock this module entirely. Do NOT deploy C4 to production before D1 replaces
 * this with the real ticket lifecycle.
 */
export interface OpenOrAttachCsTicketInput {
  accountId: string;
  waId: string;
  customerPhone: string;
  customerName?: string | null;
  topic?: string;
}

export interface OpenOrAttachCsTicketResult {
  ticketId: string;
}

export async function openOrAttachCsTicket(input: OpenOrAttachCsTicketInput): Promise<OpenOrAttachCsTicketResult> {
  throw new Error(`openOrAttachCsTicket not implemented (Task D1 pending) — accountId=${input?.accountId}`);
}

export async function appendCsTicketHistory(ticketId: string, entry: unknown): Promise<void> {
  throw new Error(`appendCsTicketHistory not implemented (Task D1 pending) — ticketId=${ticketId}`);
}
