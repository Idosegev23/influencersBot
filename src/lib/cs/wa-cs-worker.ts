/**
 * Placeholder for the CS drain loop (Task A8 — RAG + brain per-shopper turn processing).
 * This stub exists only so `src/app/api/cs/wa-worker/route.ts` (Task A7) can statically
 * import `runCsDrain`; the route's tests mock this module entirely. Do NOT deploy A7 to
 * production before A8 replaces this with the real implementation.
 */
export async function runCsDrain(waId: string): Promise<{ status: string; processed: number }> {
  throw new Error(`runCsDrain not implemented (Task A8 pending) — waId=${waId}`);
}
