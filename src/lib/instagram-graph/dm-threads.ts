/**
 * Pure helpers for the owner-facing Instagram DM inbox.
 * Isolated from the route handlers so the logic is unit-testable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Extract the recipient IGSID from a DM thread id.
 * Format: `dm_ig_graph_<recipientId>_<accountUuid>`. The accountId is a UUID
 * (has dashes); the recipientId is whatever sits between the prefix and that
 * trailing UUID. Returns null for anything that isn't a Graph DM thread.
 */
export function parseRecipientFromThreadId(threadId: string): string | null {
  const m = /^dm_ig_graph_(.+)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(threadId);
  return m ? m[1] : null;
}

/** True if the last inbound message is within Instagram's 24-hour messaging window. */
export function within24h(lastInboundAtISO: string | null | undefined, nowMs: number): boolean {
  if (!lastInboundAtISO) return false;
  const t = Date.parse(lastInboundAtISO);
  if (Number.isNaN(t)) return false;
  return nowMs - t < DAY_MS;
}

/** Light response analytics over the DM threads. */
export function summarizeThreads(
  threads: { messages: { role: string; by?: string }[]; flagged: boolean }[],
): { conversations: number; botReplies: number; humanReplies: number; flagged: number } {
  let botReplies = 0;
  let humanReplies = 0;
  let flagged = 0;
  for (const th of threads) {
    if (th.flagged) flagged++;
    for (const m of th.messages) {
      if (m.role === 'assistant') {
        if (m.by === 'human') humanReplies++;
        else botReplies++;
      }
    }
  }
  return { conversations: threads.length, botReplies, humanReplies, flagged };
}
