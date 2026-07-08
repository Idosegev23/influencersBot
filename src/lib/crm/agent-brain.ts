/**
 * Advisory-lane hybrid tool-calling agent (spec §4.5B). READ-ONLY: it can only call
 * the fact tools in agent-tools.ts (SQL for numbers, RAG for meaning) — never issue,
 * send, or mutate. `callModel` is injected so the loop is provider-agnostic and testable;
 * production wires it to the repo's src/lib/llm/ layer (laneModel('qa') → GPT-5.5) with
 * function-calling. The loop: system prompt (roster + rolling summary + "SQL for numbers,
 * RAG for meaning, read-only, never invent") → model emits either tool calls or a final
 * answer → execute tools via runTool → feed results back → repeat (cap 4) → Hebrew answer.
 */
import { runTool, AGENT_TOOL_SCHEMAS } from '@/lib/crm/agent-tools';
import type { AgentMemory } from '@/lib/crm/agent-memory';
import { loadMemory, applyRollingSummary } from '@/lib/crm/agent-memory';
import type { WaAgent } from '@/lib/crm/wa-conversation';
import { laneModel } from '@/lib/llm/config';
import { chatModel } from '@/lib/openai';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export const AGENT_BRAIN_MODELS = {
  // Model IDs resolve from the repo's config lane (laneModel('qa')) — never hardcode a 404.
  // Env overrides allow pinning a verified ID (scripts/verify-agent-models.mjs).
  primary: { provider: 'gemini' as const, id: process.env.AGENT_BRAIN_MODEL_PRIMARY || laneModel('qa') },
  fallback: { provider: 'openai' as const, id: process.env.AGENT_BRAIN_MODEL_FALLBACK || laneModel('qa') },
};

export const ADVISORY_INTENTS = new Set(['answer', 'analytics', 'ask', 'draft', 'search', 'clarify_read']);
export function isAdvisoryIntent(intent: string): boolean {
  return ADVISORY_INTENTS.has(intent);
}

export type ToolCall = { name: string; args: any; result: any };
export type ModelTurn = { toolCalls: { name: string; args: any }[]; text: string | null };
export type CallModel = (req: {
  instructions: string;
  input: string;
  toolResults: ToolCall[];
  tools: typeof AGENT_TOOL_SCHEMAS;
}) => Promise<ModelTurn>;

const MAX_ITERS = 4;

function systemPrompt(agent: WaAgent, memory: AgentMemory): string {
  return [
    'אתה בסטי — עוזר READ-ONLY לסוכן משפיענים בוואטסאפ. ענה בעברית, קצר ומדויק.',
    'כלל ברזל: מספרים (כמה/סכום/רשימה) → כלי SQL (count_contracts/sum_sales/list_contracts/get_quote_details/talent_stats/pipeline_status/revenue_by_period). משמעות/תוכן → search_context. שילוב מותר.',
    'אל תמציא מספרים — רק מה שכלי החזיר. אינך יכול לשלוח/להוציא/לשנות דבר; אם מבקשים פעולה כספית, אמור שצריך אישור בנתיב הכסף.',
    memory.rollingSummary ? `הקשר שיחה: ${memory.rollingSummary}` : '',
  ].filter(Boolean).join('\n');
}

export async function runAgentBrain(deps: {
  callModel: CallModel;
  sb: any;
  agent: WaAgent;
  text: string;
  memory: AgentMemory;
}): Promise<{ reply: string; toolCalls: ToolCall[]; modelUsed: string }> {
  const { callModel, sb, agent, text, memory } = deps;
  const executed: ToolCall[] = [];
  const instructions = systemPrompt(agent, memory);
  let lastText: string | null = null;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const turn = await callModel({ instructions, input: text, toolResults: executed, tools: AGENT_TOOL_SCHEMAS });
    if (turn.text) lastText = turn.text;
    if (!turn.toolCalls || turn.toolCalls.length === 0) break; // final answer
    for (const call of turn.toolCalls) {
      try {
        const result = await runTool(sb, agent.id, call.name, call.args);
        executed.push({ name: call.name, args: call.args, result });
      } catch (err) {
        executed.push({ name: call.name, args: call.args, result: { error: err instanceof Error ? err.message : String(err) } });
      }
    }
  }
  return {
    reply: (lastText || 'לא הצלחתי להפיק תשובה כרגע — אפשר לנסח שוב?').trim(),
    toolCalls: executed,
    modelUsed: AGENT_BRAIN_MODELS.primary.id,
  };
}

/**
 * Production callModel: a JSON tool-emit loop over the repo's chatModel (gpt-5.5). One turn:
 * given the running tool results, the model either emits ONE tool call or a final answer.
 * (A plain-JSON loop, not native function-calling — simpler, and gpt-5.5 handles it reliably.)
 */
export const defaultCallModel: CallModel = async ({ instructions, input, toolResults, tools }) => {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}\n  params: ${JSON.stringify((t as any).parameters)}`).join('\n');
  const prior = toolResults.map((tr) => `כלי ${tr.name}(${JSON.stringify(tr.args)}) → ${JSON.stringify(tr.result)}`).join('\n');
  const instr =
    `${instructions}\n\nכלים זמינים (READ-ONLY):\n${toolList}\n` +
    (prior ? `\nתוצאות שכבר קיבלת:\n${prior}\n` : '') +
    `\nהחזר JSON נקי בלבד: לקריאת כלי — {"tool":{"name":"<שם>","args":{...}}} ; לתשובה סופית — {"answer":"<תשובה בעברית>"}. ` +
    `העדף לענות ברגע שיש מספיק עובדות; אל תמציא מספרים.`;
  try {
    const { response } = await chatModel(instr, input, laneModel('qa'));
    const j = JSON.parse(String(response || '').replace(/```json|```/g, '').trim());
    if (j?.tool?.name) return { toolCalls: [{ name: j.tool.name, args: j.tool.args || {} }], text: null };
    return { toolCalls: [], text: j?.answer || String(response || '') };
  } catch {
    return { toolCalls: [], text: 'לא הצלחתי להפיק תשובה כרגע.' };
  }
};

/** Single entry the front-door calls for an advisory (read-only) question. Loads + updates memory. */
export async function answerAgentQuestion(agent: WaAgent, text: string): Promise<{ reply: string; modelUsed: string }> {
  const memory = await loadMemory(supabaseAdmin, agent.id);
  const res = await runAgentBrain({ callModel: defaultCallModel, sb: supabaseAdmin, agent, text, memory });
  applyRollingSummary(supabaseAdmin, agent.id, text, res.reply).catch(() => {});
  return { reply: res.reply, modelUsed: res.modelUsed };
}
