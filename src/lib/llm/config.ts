/**
 * Config-driven model IDs for the agent WhatsApp lanes (P2).
 * Every id is env-overridable; the defaults were VERIFIED available on 2026-07-08 via
 * both providers' models.list (gpt-5.5 / gpt-5.4-nano / gpt-4o-transcribe on OpenAI;
 * gemini-3-pro-preview / gemini-3.5-flash / gemini-embedding-001 on Gemini). Bumping a
 * model is a one-line env change — no code change — so we can try a new id in prod and
 * roll back instantly. The P0 money guardrails (normalizeAmount + read-back + idempotency)
 * remain the safety net regardless of which model runs.
 */
const env = (k: string, d: string) => process.env[k] || d;

export type Lane = 'money' | 'router' | 'qa' | 'stt' | 'cs';

/** The OpenAI model id for a lane (the agent brain runs on OpenAI; Gemini is P2.2 fallback). */
export function laneModel(lane: Lane): string {
  switch (lane) {
    case 'money': return env('AGENT_MODEL_MONEY', 'gpt-5.6-sol'); // intent + pricing extraction (same price as gpt-5.5, stronger agentic)
    case 'router': return env('AGENT_MODEL_ROUTER', 'gpt-6-luna'); // cheap classify. Benched 2026-09-27: WA router 98.2% vs 95.5%, lead classifier equal, hand-off summary 9.34 vs 9.00, half the price
    case 'qa': return env('AGENT_MODEL_QA', 'gpt-5.6-sol');
    // The WhatsApp/web customer-service brain. Split from `money` 2026-09-27 so it can move on its
    // own. Benched on 46 cases (31 scenarios + 15 real): gpt-6-sol 31/31 tool decisions, judged
    // highest by both judges, zero false "a human will reply" promises, same cost as terra and 57%
    // below gpt-5.6-sol. It needs the empty-closing-call fix in cs-agent.ts (it hit that bug on 2/2
    // product-card turns without it). Rollback: AGENT_MODEL_CS=gpt-5.6-terra.
    case 'cs': return env('AGENT_MODEL_CS', 'gpt-6-sol');
    case 'stt': return env('AGENT_MODEL_STT', 'gpt-4o-transcribe');
    default: return env('AGENT_MODEL_MONEY', 'gpt-5.6-sol');
  }
}
