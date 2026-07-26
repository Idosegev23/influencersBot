/**
 * Turn timing for metric 6b (time to first response).
 *
 * WHY THIS EXISTS: `chat_messages.created_at` defaults to now(), and both the
 * user and assistant rows are inserted together AFTER the turn completes (see
 * widget-chat-handler.ts). Measured 2026-07-26 on Argania: 1,022 of 1,354
 * user→assistant pairs are less than one second apart, which no real model
 * response can be. The gap between rows is a write artifact, so true latency has
 * to be recorded explicitly.
 */
export function turnTimings(receivedAtMs: number, completedAtMs: number): { latencyMs: number; userCreatedAt: string } {
  return {
    latencyMs: Math.max(0, Math.round(completedAtMs - receivedAtMs)),
    userCreatedAt: new Date(receivedAtMs).toISOString(),
  };
}
