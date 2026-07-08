/**
 * Advisory-lane conversation memory for the WhatsApp brain (spec §2C/§8, P3.14).
 *
 * One rolling summary per agent, kept short, so free-form follow-ups
 * ("רגע, תשנה לאנה ל-90") resolve in context on the next turn. READ-ONLY lane:
 * this file only reads/writes crm_agent_wa_memory — it never touches the money/deal
 * tables. DB I/O takes an injected `sb` client (first arg) so tests run without mocks;
 * buildSummaryPrompt is pure (no DB/LLM import) and unit-tests in isolation.
 *
 * The summary is produced by the QA-lane model (config-driven via laneModel('qa') —
 * never a hardcoded id) through chatModel(); on any LLM failure we keep the prior
 * summary so a bad turn can never wipe the agent's context.
 */
import { chatModel } from '@/lib/openai';
import { laneModel } from '@/lib/llm/config';

export type AgentMemory = {
  rollingSummary: string;
  lastResponseId: string | null;
  turnCount: number;
};

/** Load an agent's rolling memory; returns empty defaults when no row exists yet. */
export async function loadMemory(sb: any, agentId: string): Promise<AgentMemory> {
  const { data } = await sb
    .from('crm_agent_wa_memory')
    .select('*')
    .eq('agent_id', agentId)
    .maybeSingle();
  return {
    rollingSummary: data?.rolling_summary || '',
    lastResponseId: data?.last_response_id || null,
    turnCount: data?.turn_count || 0,
  };
}

/** Upsert a partial memory patch for the agent (only provided fields are written). */
export async function saveMemory(sb: any, agentId: string, patch: Partial<AgentMemory>): Promise<void> {
  const row: any = { agent_id: agentId, updated_at: new Date().toISOString() };
  if (patch.rollingSummary !== undefined) row.rolling_summary = patch.rollingSummary;
  if (patch.lastResponseId !== undefined) row.last_response_id = patch.lastResponseId;
  if (patch.turnCount !== undefined) row.turn_count = patch.turnCount;
  await sb.from('crm_agent_wa_memory').upsert(row, { onConflict: 'agent_id' });
}

/**
 * Pure prompt builder: carries the prior summary + the new (user, assistant) turn and
 * asks for a compact Hebrew rolling summary that preserves open entities/intents.
 * No DB/LLM import → unit-testable without mocks.
 */
export function buildSummaryPrompt(
  prevSummary: string,
  userMsg: string,
  assistantMsg: string
): { instructions: string; input: string } {
  return {
    instructions:
      'עדכן סיכום שיחה מתגלגל וקצר (עד 6 שורות) בין סוכן משפיענים לעוזר בסטי. ' +
      'שמור ישויות פתוחות (מיוצגים/מותגים/סכומים/כוונות פתוחות) כדי שאפשר יהיה להבין המשך כמו "תשנה לאנה ל-90". ' +
      'החזר טקסט סיכום בלבד.',
    input:
      `סיכום קודם:\n${prevSummary || '(אין)'}\n\n` +
      `תור חדש —\nסוכן: ${userMsg}\nבסטי: ${assistantMsg}`,
  };
}

/**
 * Recompute and persist the rolling summary after a turn. Bumps turn_count.
 * On any LLM error the prior summary is kept (never wiped). Read-only w.r.t. deals/money.
 */
export async function applyRollingSummary(
  sb: any,
  agentId: string,
  userMsg: string,
  assistantMsg: string
): Promise<void> {
  const mem = await loadMemory(sb, agentId);
  const { instructions, input } = buildSummaryPrompt(mem.rollingSummary, userMsg, assistantMsg);
  let summary = mem.rollingSummary;
  try {
    const { response } = await chatModel(instructions, input, laneModel('qa'));
    if (response?.trim()) summary = response.trim();
  } catch {
    /* keep prior summary — a failed summarization must never erase context */
  }
  await saveMemory(sb, agentId, { rollingSummary: summary, turnCount: mem.turnCount + 1 });
}
