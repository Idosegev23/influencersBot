/**
 * The lead-conversation brain. Brain-led tool loop, modelled on runCsTurn
 * (src/lib/cs/cs-agent.ts) — the model calls tools, gets results, and repeats
 * until it produces final text. No scripted menus, no state machine.
 *
 * Two rules in the system prompt carry the whole risk of this feature:
 * Bestie answers about Bestie and nothing else, and she never states a price.
 * Both are unconditional on purpose — a rule phrased as "unless you saw one"
 * is a rule that fails exactly when it matters.
 */
import { BESTIE_TOOL_DEFS, getBestieTools } from '@/lib/bestie/tools';
import type { BestieToolCtx, BestieToolResult, OpenAIFunctionDef } from '@/lib/bestie/tools/types';
import type { BestieLeadJob } from '@/lib/bestie/wa-lead-queue';

export interface BestieChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: any;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface BestieModelTurn {
  toolCalls: Array<{ id?: string; name: string; args: any }>;
  text: string | null;
}

export interface BestieTurnResult {
  reply: { kind: 'text'; body: string } | { kind: 'none' };
  handedOff: boolean;
}

export interface BestieAgentDeps {
  callModel(params: {
    system: string;
    messages: BestieChatMessage[];
    tools: OpenAIFunctionDef[];
  }): Promise<BestieModelTurn>;
  runTool(name: string, args: any, ctx: BestieToolCtx): Promise<BestieToolResult>;
  loadContext(job: BestieLeadJob): Promise<BestieToolCtx>;
  loadHistory(chatSessionId: string | null): Promise<BestieChatMessage[]>;
  persistTurn(ctx: BestieToolCtx, userMessage: string, assistantText: string): Promise<void>;
}

const MAX_ITERS = 5;

const HANDOFF_ACK = 'תודה! מעבירה אותך לאיש מכירות שיחזור אליך בהקדם 🙏';
const CLARIFY = 'סליחה, אפשר לנסח שוב? 🙏';

export const BESTIE_SYSTEM_PROMPT = `את בסטי — עוזרת AI שעונה ללקוחות של עסקים בוואטסאפ, באינסטגרם ובאתר.
מולך אדם שהשאיר פרטים במודעה כדי לשמוע על בסטי.

מה את יודעת: מה בסטי עושה, למי היא מתאימה, איך משתמשים בה, ומה יש בכל מסך.
תמיד דרך search_bestie_knowledge — כל טענה עובדתית יוצאת משם ולא מהראש שלך.

מה את לא יודעת ולא מנחשת: לקוחות אחרים של בסטי ומה קורה אצלם, ואיך המערכת בנויה
מבפנים. מה שלא ידוע — תגידי שאת לא יודעת ותציעי לחבר לאדם.

מחירים: לעולם אל תנקבי במחיר. לא סכום, לא טווח, לא "מתחיל מ...", ולא אישור למספר
שהלקוח הציע בעצמו. גם אם מתעקשים, וגם אם נדמה לך שראית מחיר בידע. תמיד: איש מכירות
ייתן הצעה מדויקת אחרי שיחה קצרה — ותציעי להעביר עכשיו. מספר שתגידי הופך להתחייבות
שמישהו יצטרך לכבד.

תוך כדי השיחה תרשמי מה שאת לומדת על העסק עם note_lead_detail — ברגע שמתגלה פרט,
לא בסוף.

כשהוא מבקש לדבר עם מישהו, שואל על מחיר, או שברור שהוא מעוניין — קראי ל-handoff_to_sales,
תודי, וסיימי. אל תמשיכי לנהל את השיחה אחרי זה.

סגנון: קצר, אנושי, בגובה העיניים. הודעות וואטסאפ, לא מיילים. בלי סופרלטיבים ובלי לחץ.`;

async function defaultCallModel(params: {
  system: string;
  messages: BestieChatMessage[];
  tools: OpenAIFunctionDef[];
}): Promise<BestieModelTurn> {
  const OpenAI = (await import('openai')).default;
  const { laneModel } = await import('@/lib/llm/config');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
    // Same lane as the CS brain: this conversation decides whether a lead
    // becomes a customer, so it is not the place to save on model quality.
    model: laneModel('money'),
    messages: [{ role: 'system', content: params.system }, ...(params.messages as any)],
    tools: params.tools as any,
    tool_choice: 'auto',
  });

  const msg: any = res.choices?.[0]?.message;
  const toolCalls = (msg?.tool_calls || []).map((tc: any) => ({
    id: tc.id,
    name: tc.function?.name,
    args: (() => { try { return JSON.parse(tc.function?.arguments ?? '{}'); } catch { return {}; } })(),
  }));
  return { toolCalls, text: msg?.content ?? null };
}

async function defaultLoadContext(job: BestieLeadJob): Promise<BestieToolCtx> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();

  const { data: session } = await supabase
    .from('bestie_lead_sessions')
    .select('lead_id, chat_session_id')
    .eq('wa_id', job.waId)
    .maybeSingle();

  const leadId = job.leadId ?? session?.lead_id ?? null;

  let leadName: string | null = null;
  if (leadId) {
    const { data: lead } = await supabase
      .from('bestie_leads').select('full_name').eq('id', leadId).maybeSingle();
    leadName = lead?.full_name ?? null;
  }

  const { data: account } = await supabase
    .from('accounts').select('id').eq('config->>username', 'bestie').maybeSingle();

  return {
    waId: job.waId,
    leadId,
    accountId: account?.id ?? '',
    chatSessionId: session?.chat_session_id ?? null,
    leadName,
  };
}

async function defaultLoadHistory(chatSessionId: string | null): Promise<BestieChatMessage[]> {
  if (!chatSessionId) return [];
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', chatSessionId)
    .order('created_at', { ascending: true })
    .limit(20);
  return (data ?? []).map((m: any) => ({ role: m.role, content: m.content }));
}

async function defaultPersistTurn(
  ctx: BestieToolCtx,
  userMessage: string,
  assistantText: string
): Promise<void> {
  if (!ctx.chatSessionId) return;
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  await supabase.from('chat_messages').insert([
    { session_id: ctx.chatSessionId, role: 'user', content: userMessage },
    { session_id: ctx.chatSessionId, role: 'assistant', content: assistantText },
  ]);
}

async function defaultRunTool(
  name: string,
  args: any,
  ctx: BestieToolCtx
): Promise<BestieToolResult> {
  const tool = getBestieTools().find(t => t.def.function.name === name);
  if (!tool) return { ok: false, data: { reason: 'unknown_tool' } };
  try {
    return await tool.handler(args, ctx);
  } catch (e) {
    console.warn('[bestie-agent] tool threw', name, e);
    return { ok: false, data: { reason: 'tool_error' } };
  }
}

export async function runBestieTurn(
  job: BestieLeadJob,
  depsOverride?: Partial<BestieAgentDeps>
): Promise<BestieTurnResult> {
  const deps: BestieAgentDeps = {
    callModel: defaultCallModel,
    runTool: defaultRunTool,
    loadContext: defaultLoadContext,
    loadHistory: defaultLoadHistory,
    persistTurn: defaultPersistTurn,
    ...depsOverride,
  };

  const userMessage = job.textBody?.trim() || '';
  if (!userMessage) return { reply: { kind: 'none' }, handedOff: false };

  const ctx = await deps.loadContext(job);
  const history = await deps.loadHistory(ctx.chatSessionId);
  const messages: BestieChatMessage[] = [...history, { role: 'user', content: userMessage }];

  let finalText: string | null = null;
  let handedOff = false;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const turn = await deps.callModel({
      system: BESTIE_SYSTEM_PROMPT,
      messages,
      tools: BESTIE_TOOL_DEFS,
    });

    if (!turn.toolCalls?.length) { finalText = turn.text; break; }

    messages.push({
      role: 'assistant',
      content: turn.text,
      tool_calls: turn.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    });

    for (const tc of turn.toolCalls) {
      const result = await deps.runTool(tc.name, tc.args, ctx);
      if (result.handedOff) handedOff = true;
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result.data ?? { ok: result.ok }),
      });
    }

    // Do NOT short-circuit on handoff. The lead who just asked to speak to
    // someone must get an acknowledgement now, not silence — the pause applies
    // to future turns. Let the loop run once more so the model can close warmly.
  }

  const body = (finalText || (handedOff ? HANDOFF_ACK : CLARIFY)).trim();
  await deps.persistTurn(ctx, userMessage, body);

  return { reply: { kind: 'text', body }, handedOff };
}
