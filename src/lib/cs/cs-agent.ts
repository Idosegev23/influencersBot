/**
 * Placeholder for the Phase-C brain-led CS turn (Task C6 — RAG + persona-driven reply generation).
 * This stub exists only so `src/lib/cs/wa-cs-worker.ts` (Task A8) can resolve its dynamic
 * `import('@/lib/cs/cs-agent')` — Vitest/Vite's import-analysis needs the module to exist on disk
 * even for a dynamic import before `vi.mock('@/lib/cs/cs-agent', ...)` can intercept it (same
 * issue Task A7 hit with `wa-cs-worker.ts` itself). The worker's tests mock this module entirely.
 * Do NOT deploy A8 to production before C6 replaces this with the real turn function.
 */
export interface CsJobLike {
  waId: string;
  msg?: any;
  textBody?: string | null;
  [key: string]: any;
}

export type CsReply =
  | { kind: 'text'; body: string }
  | { kind: 'buttons'; body: string; buttons: { id: string; title: string }[]; header?: string; footer?: string }
  | { kind: 'list'; body: string; buttonLabel: string; sections: any[]; header?: string; footer?: string }
  | { kind: 'none' };

export interface CsTurnResult {
  reply: CsReply;
  phase: string;
}

export async function runCsTurn(job: CsJobLike): Promise<CsTurnResult> {
  throw new Error(`runCsTurn not implemented (Task C6 pending) — waId=${job?.waId}`);
}
