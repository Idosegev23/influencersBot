/**
 * Placeholder for the Phase-D bot-pause mechanic (Task D3 — per-conversation `bot_paused` flag:
 * set on escalation/human-reply/"take over", cleared on manual resume or a positive trigger).
 * This stub exists only so `src/lib/cs/tools/index.ts` (Task C4) can resolve its dynamic
 * `import('@/lib/handoff/bot-pause')` — Vitest/Vite's import-analysis needs the module to exist
 * on disk even for a dynamic import before `vi.mock('@/lib/handoff/bot-pause', ...)` can
 * intercept it (same issue Task A7 hit with `wa-cs-worker.ts`, resolved by Task A8's
 * `cs-agent.ts` stub). The tool tests mock this module entirely. Do NOT deploy C4 to production
 * before D3 replaces this with the real pause/resume mechanic.
 */
export async function pauseBot(chatSessionId: string, reason: string): Promise<void> {
  throw new Error(`pauseBot not implemented (Task D3 pending) — chatSessionId=${chatSessionId} reason=${reason}`);
}

export async function isBotPaused(chatSessionId: string): Promise<boolean> {
  throw new Error(`isBotPaused not implemented (Task D3 pending) — chatSessionId=${chatSessionId}`);
}

export async function resumeBot(chatSessionId: string): Promise<void> {
  throw new Error(`resumeBot not implemented (Task D3 pending) — chatSessionId=${chatSessionId}`);
}
