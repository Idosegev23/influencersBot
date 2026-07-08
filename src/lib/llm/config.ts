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

export type Lane = 'money' | 'router' | 'qa' | 'stt';

/** The OpenAI model id for a lane (the agent brain runs on OpenAI; Gemini is P2.2 fallback). */
export function laneModel(lane: Lane): string {
  switch (lane) {
    case 'money': return env('AGENT_MODEL_MONEY', 'gpt-5.5'); // intent + pricing extraction
    case 'router': return env('AGENT_MODEL_ROUTER', 'gpt-5.4-nano'); // cheap classify
    case 'qa': return env('AGENT_MODEL_QA', 'gpt-5.5');
    case 'stt': return env('AGENT_MODEL_STT', 'gpt-4o-transcribe');
    default: return env('AGENT_MODEL_MONEY', 'gpt-5.5');
  }
}
