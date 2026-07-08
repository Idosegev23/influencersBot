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

// One multi-tool turn + one answer turn covers the common case ("make order" = 2 tools at once).
const MAX_ITERS = 3;

type Roster = { id: string; name: string }[];

function systemPrompt(agent: WaAgent, memory: AgentMemory, roster: Roster): string {
  return [
    'אתה בסטי — עוזר READ-ONLY לסוכן משפיענים בוואטסאפ. ענה בעברית, קצר ומדויק.',
    'כלל ברזל: מספרים (כמה/סכום/רשימה) → כלי SQL (count_contracts/sum_sales/list_contracts/get_quote_details/talent_stats/pipeline_status/revenue_by_period). משמעות/תוכן → search_context. שילוב מותר.',
    'שאלות "מה פתוח לי / תעשי סדר / מה על השולחן" → list_open_briefs. "מה לא ברור למי לשייך / הצעות תקועות בלי מיוצג" → list_unassigned. אלה מחזירים את הפריטים עצמם, לא רק ספירה.',
    'אל תמציא מספרים — רק מה שכלי החזיר. אינך יכול לשלוח/להוציא/לשנות דבר; אם מבקשים פעולה כספית, אמור שצריך אישור בנתיב הכסף.',
    roster.length ? `מיוצגים ברוסטר — כשמסננים לפי מיוצג העבר את ה-id המדויק כ-talentId: ${JSON.stringify(roster)}` : '',
    memory.rollingSummary ? `הקשר שיחה: ${memory.rollingSummary}` : '',
    memory.recentTurns?.length ? `שיחה אחרונה (החדש בסוף) — פענח ממנה הפניות כמו "זה"/"והמחיר?":\n${memory.recentTurns.map((t) => `סוכן: ${t.u}\nבסטי: ${t.a}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export async function runAgentBrain(deps: {
  callModel: CallModel;
  sb: any;
  agent: WaAgent;
  text: string;
  memory: AgentMemory;
  roster?: Roster;
}): Promise<{ reply: string; toolCalls: ToolCall[]; modelUsed: string }> {
  const { callModel, sb, agent, text, memory, roster = [] } = deps;
  const executed: ToolCall[] = [];
  const instructions = systemPrompt(agent, memory, roster);
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
  // Converge: if we gathered facts but the loop never emitted a final answer (model kept calling
  // tools / ran out of iterations), force ONE summarizing turn instead of the generic fallback.
  if (!lastText && executed.length) {
    try {
      const final = await callModel({
        instructions: instructions + '\nעכשיו סכם תשובה סופית בעברית מהתוצאות שקיבלת. אל תקרא עוד כלים — החזר {"answer":"..."}.',
        input: text, toolResults: executed, tools: AGENT_TOOL_SCHEMAS,
      });
      if (final.text) lastText = final.text;
    } catch { /* keep the fallback below */ }
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
    `\nהחזר JSON נקי בלבד. לקריאת כלים — {"tools":[{"name":"<שם>","args":{...}}, ...]} (אפשר כמה בבת אחת כשצריך כמה חתכים, למשל list_open_briefs + list_unassigned יחד) ; לתשובה סופית — {"answer":"<תשובה בעברית>"}. ` +
    `העדף להביא בפעם אחת את כל הכלים שתצטרך, ואז לענות; אל תמציא מספרים.`;
  try {
    // effort:'low' — tool selection + Hebrew summarization don't need deep reasoning.
    const { response } = await chatModel(instr, input, laneModel('qa'), { effort: 'low', timeoutMs: 45_000 });
    const raw = String(response || '').replace(/```json|```/g, '').trim();
    let j: any;
    try { j = JSON.parse(raw); }
    catch { return { toolCalls: [], text: raw }; } // not JSON → the model answered in plain Hebrew; pass it through
    const rawTools = Array.isArray(j?.tools) ? j.tools : (j?.tool ? [j.tool] : []); // multi-tool or single, back-compat
    const toolCalls = rawTools
      .filter((t: any) => t && typeof t.name === 'string')
      .map((t: any) => ({ name: t.name, args: t.args && typeof t.args === 'object' ? t.args : {} }));
    if (toolCalls.length) return { toolCalls, text: null };
    // No tool call → final answer. NEVER echo the raw JSON envelope (e.g. {"tools":[]} or a mis-shaped
    // object) back to the WhatsApp user; empty text lets runAgentBrain use its graceful fallback.
    return { toolCalls: [], text: typeof j?.answer === 'string' ? j.answer : '' };
  } catch {
    return { toolCalls: [], text: 'לא הצלחתי להפיק תשובה כרגע.' };
  }
};

/** Single entry the front-door calls for an advisory (read-only) question. Loads + updates memory. */
export async function answerAgentQuestion(agent: WaAgent, text: string): Promise<{ reply: string; modelUsed: string }> {
  const ids = agent.managed_account_ids || [];
  const { data: accts } = ids.length
    ? await supabaseAdmin.from('accounts').select('id, config').in('id', ids)
    : { data: [] as any[] };
  const roster = (accts || [])
    .map((a: any) => ({ id: a.id, name: String((a.config as any)?.display_name || (a.config as any)?.username || '') }))
    .filter((r: any) => r.name);
  const memory = await loadMemory(supabaseAdmin, agent.id);
  const res = await runAgentBrain({ callModel: defaultCallModel, sb: supabaseAdmin, agent, text, memory, roster });
  applyRollingSummary(supabaseAdmin, agent.id, text, res.reply).catch(() => {});
  return { reply: res.reply, modelUsed: res.modelUsed };
}
