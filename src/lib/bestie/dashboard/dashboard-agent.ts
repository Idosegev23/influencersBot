/**
 * The dashboard brain. Same loop shape as runBestieTurn — the model calls
 * tools, gets results, repeats until it produces text.
 *
 * What differs from the lead funnel: this one talks to a known, paying customer
 * rather than a stranger to qualify, it can read that customer's own data, and
 * it changes nothing at all.
 *
 * The system prompt is built per turn so it can name the screen the customer is
 * standing on — that is what makes the difference between documentation and
 * someone who is actually looking at your screen with you.
 */
import { DASHBOARD_TOOL_DEFS, getDashboardTools, type DashboardToolResult } from './tools';
import type { DashboardCtx } from './context';
import type { OpenAIFunctionDef } from '@/lib/bestie/tools/types';

export interface DashboardMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: any;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface DashboardModelTurn {
  toolCalls: Array<{ id?: string; name: string; args: any }>;
  text: string | null;
}

export interface DashboardAgentDeps {
  callModel(params: {
    system: string;
    messages: DashboardMessage[];
    tools: OpenAIFunctionDef[];
  }): Promise<DashboardModelTurn>;
  runTool(name: string, args: any, ctx: DashboardCtx): Promise<DashboardToolResult>;
}

const MAX_ITERS = 5;
const CLARIFY = 'סליחה, אפשר לנסח שוב? 🙏';

export const DASHBOARD_SYSTEM_PROMPT = `את בסטי, בתוך הדשבורד של המותג. מולך לקוח מזוהה שמשלם על המוצר.

מה את יודעת: איך בסטי עובדת ומה יש בכל מסך, ועוד הדאטה של החשבון הזה בלבד —
השיחות שלו, הפניות שלו, ההגדרות שלו.

מה את לא יודעת: חשבונות אחרים ומה קורה אצלם, ואיך המערכת בנויה מבפנים.

את לא משנה כלום. לא הגדרות, לא ידע, לא תוכן. את מראה בדיוק מה לעשות, נותנת את
הניסוח המלא, ומפנה למסך ולשדה — והוא מבצע.

מחירים: לעולם אל תנקבי במחיר.

כשאת מפנה למסך — תמיד דרך route_to_screen, אף פעם לא מהזיכרון. הכלי מחזיר href,
ואת חייבת לכתוב אותו כקישור בפורמט [שם המסך](href) — לא כנתיב חשוף. לקוח שצריך
להעתיק נתיב מתוך צ'אט קיבל שיעורי בית, לא תשובה.
אם הוא כבר על המסך הזה (isCurrentScreen), תגידי לו את זה במקום לשלוח אותו לטיול.

כשאין לך תשובה או שמשהו לא עובד — escalate_to_bestie_team. לא לנחש.

סגנון: קצר, בגובה העיניים, בלי סופרלטיבים.

עיצוב התשובה — הווידג'ט מרנדר Markdown, אז השתמשי בו:
· **מודגש** לכותרות של פריטים, רשימות ממוספרות כשיש סדר, תבליטים כשאין.
· דוגמה אחת לכל פריט, לא שלוש. הדוגמה הכי מייצגת, מקוצרת למשפט.
· לכל היותר 5 פריטים. אם יש יותר — הציגי את החמישה הגדולים ואמרי כמה נשארו.
· בלי לחזור על השאלה בפתיחה. ישר לעניין.
· משפט סיום אחד שמציע את הצעד הבא, לא פסקה.`;

function buildSystem(ctx: DashboardCtx): string {
  const where = ctx.currentRoute
    ? `\n\nהלקוח נמצא כרגע במסך: ${ctx.currentRoute}`
    : '';
  return DASHBOARD_SYSTEM_PROMPT + where;
}

async function defaultCallModel(params: {
  system: string;
  messages: DashboardMessage[];
  tools: OpenAIFunctionDef[];
}): Promise<DashboardModelTurn> {
  const OpenAI = (await import('openai')).default;
  const { laneModel } = await import('@/lib/llm/config');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
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

async function defaultRunTool(
  name: string,
  args: any,
  ctx: DashboardCtx
): Promise<DashboardToolResult> {
  const tool = getDashboardTools().find(t => t.def.function.name === name);
  if (!tool) return { ok: false, data: { reason: 'unknown_tool' } };
  try {
    return await tool.handler(args, ctx);
  } catch (e) {
    console.warn('[dashboard-agent] tool threw', name, e);
    return { ok: false, data: { reason: 'tool_error' } };
  }
}

export async function runDashboardTurn(
  input: {
    ctx: DashboardCtx;
    message: string;
    history?: Array<{ role: string; content: string }>;
  },
  depsOverride?: Partial<DashboardAgentDeps>
): Promise<{ reply: string }> {
  const deps: DashboardAgentDeps = {
    callModel: defaultCallModel,
    runTool: defaultRunTool,
    ...depsOverride,
  };

  const system = buildSystem(input.ctx);
  const messages: DashboardMessage[] = [
    ...((input.history ?? []) as DashboardMessage[]),
    { role: 'user', content: input.message },
  ];

  let finalText: string | null = null;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const turn = await deps.callModel({ system, messages, tools: DASHBOARD_TOOL_DEFS });
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
      const result = await deps.runTool(tc.name, tc.args, input.ctx);
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result.data ?? { ok: result.ok }),
      });
    }
  }

  return { reply: (finalText || CLARIFY).trim() };
}
