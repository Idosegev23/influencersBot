/**
 * Six read-only tools. None of them takes an account.
 *
 * ctx.accountId comes from the authenticated session and is injected by the
 * route. It is deliberately absent from every parameter schema: Bestie will be
 * summarising text this brand's own customers wrote, so a prompt instruction
 * not to read other accounts is an instruction delivered to an attacker's
 * audience. An absent parameter cannot be filled in.
 *
 * Nothing here writes. Escalation emails rather than filing a ticket, so the
 * "no write path" property has no exception to remember.
 */
import type { OpenAIFunctionDef } from '@/lib/bestie/tools/types';
import type { DashboardCtx } from './context';
import { buildPulse } from './pulse';
import { groupKnowledgeGaps } from './gaps';
import { runHealthCheck } from './health';
import { buildScreenLink } from './routing';

export interface DashboardToolResult {
  ok: boolean;
  data?: unknown;
}

export interface DashboardTool {
  def: OpenAIFunctionDef;
  handler(args: any, ctx: DashboardCtx): Promise<DashboardToolResult>;
}

const NO_PARAMS = { type: 'object', properties: {} } as Record<string, unknown>;

export const DASHBOARD_TOOL_DEFS: OpenAIFunctionDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_bestie_knowledge',
      description:
        'חיפוש בידע על בסטי — מה המוצר עושה, איך משתמשים בו, ומה יש בכל מסך. ' +
        'המקור היחיד לעובדות על המוצר.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'השאלה בשפת הלקוח' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'route_to_screen',
      description:
        'המרת נתיב מסך לקישור לחיץ עבור הלקוח הזה. תמיד לעבור דרך זה — אף פעם לא ' +
        'לכתוב נתיב מהזיכרון. מחזיר null אם המסך לא קיים.',
      parameters: {
        type: 'object',
        properties: {
          route: { type: 'string', description: 'נתיב בצורת /influencer/[username]/...' },
        },
        required: ['route'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_account_pulse',
      description: 'מה קרה בחשבון השבוע לעומת שבוע שעבר — שיחות, פניות, הסטה, ונושאי אסקלציה.',
      parameters: NO_PARAMS,
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_knowledge_gaps',
      description:
        'השאלות שהבוט של החשבון הזה לא ידע לענות עליהן, מקובצות לנושאים, עם דוגמאות אמיתיות.',
      parameters: NO_PARAMS,
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_health_check',
      description:
        'מה לא תקין בחשבון כרגע — קופונים פגי תוקף שעדיין פעילים, אינסטגרם מנותק, ' +
        'קטלוג ריק, פניות תקועות.',
      parameters: NO_PARAMS,
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_bestie_team',
      description:
        'העברה לצוות של בסטי כשאין לך תשובה או כשמשהו לא עובד. שולח מייל עם השיחה. ' +
        'לא פותר בעצמך ולא משנה כלום.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string', description: 'מה הבעיה, במשפט' } },
        required: ['summary'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers. Every query is scoped by ctx.accountId, which the model cannot name.
// ---------------------------------------------------------------------------

async function searchKnowledge(args: any, ctx: DashboardCtx): Promise<DashboardToolResult> {
  const { retrieveContext } = await import('@/lib/rag');
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();

  // Product knowledge lives on the bestie account, not on the brand's.
  const { data: bestie } = await supabase
    .from('accounts').select('id').eq('config->>username', 'bestie').maybeSingle();
  if (!bestie) return { ok: false, data: { reason: 'bestie_account_missing' } };

  const { sources } = await retrieveContext({
    accountId: bestie.id,
    query: String(args?.query ?? ''),
    archetype: 'saas_product',
  } as any);

  return {
    ok: true,
    data: {
      sources: (sources ?? []).map((s: any) => ({
        title: s.title,
        excerpt: s.excerpt,
        route: s.metadata?.route ?? null,
      })),
    },
  };
}

async function routeToScreen(args: any, ctx: DashboardCtx): Promise<DashboardToolResult> {
  const { listCustomerScreens } = await import('@/lib/bestie/screen-inventory');
  const known = listCustomerScreens().map(s => s.route);
  const link = buildScreenLink(String(args?.route ?? ''), ctx.username, ctx.currentRoute, known);

  return link
    ? { ok: true, data: link }
    : { ok: false, data: { reason: 'no_such_screen' } };
}

async function readAccountPulse(_args: any, ctx: DashboardCtx): Promise<DashboardToolResult> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();

  const [{ data: conversations }, { data: tickets }] = await Promise.all([
    supabase.from('chat_sessions')
      .select('created_at').eq('account_id', ctx.accountId).gte('created_at', since),
    supabase.from('support_requests')
      .select('created_at, source, escalation_reason')
      .eq('account_id', ctx.accountId).gte('created_at', since),
  ]);

  return {
    ok: true,
    data: buildPulse({
      conversations: conversations ?? [],
      tickets: (tickets ?? []) as any,
      now: new Date(),
    }),
  };
}

async function findGaps(_args: any, ctx: DashboardCtx): Promise<DashboardToolResult> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();

  const { data } = await supabase
    .from('support_requests')
    .select('escalation_reason, source, message, created_at')
    .eq('account_id', ctx.accountId)
    .gte('created_at', since)
    .not('escalation_reason', 'is', null);

  return { ok: true, data: { gaps: groupKnowledgeGaps((data ?? []) as any) } };
}

async function healthCheck(_args: any, ctx: DashboardCtx): Promise<DashboardToolResult> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();

  const [coupons, products, ig, tickets] = await Promise.all([
    supabase.from('coupons').select('code, end_date, is_active').eq('account_id', ctx.accountId),
    supabase.from('widget_products').select('id', { count: 'exact', head: true }).eq('account_id', ctx.accountId),
    supabase.from('ig_graph_connections').select('id').eq('account_id', ctx.accountId).limit(1),
    supabase.from('support_requests').select('created_at').eq('account_id', ctx.accountId).neq('status', 'resolved'),
  ]);

  return {
    ok: true,
    data: {
      findings: runHealthCheck({
        coupons: (coupons.data ?? []) as any,
        productCount: products.count ?? 0,
        instagramConnected: (ig.data ?? []).length > 0,
        openTickets: (tickets.data ?? []) as any,
        now: new Date(),
      }),
    },
  };
}

async function escalate(args: any, ctx: DashboardCtx): Promise<DashboardToolResult> {
  const { sendDashboardEscalation } = await import('./escalation');
  const sent = await sendDashboardEscalation({
    brandUsername: ctx.username,
    currentRoute: ctx.currentRoute,
    message: String(args?.summary ?? ''),
    transcript: [],
  });
  return { ok: sent.success, data: { emailed: sent.success } };
}

export function getDashboardTools(): DashboardTool[] {
  return [
    { def: DASHBOARD_TOOL_DEFS[0], handler: searchKnowledge },
    { def: DASHBOARD_TOOL_DEFS[1], handler: routeToScreen },
    { def: DASHBOARD_TOOL_DEFS[2], handler: readAccountPulse },
    { def: DASHBOARD_TOOL_DEFS[3], handler: findGaps },
    { def: DASHBOARD_TOOL_DEFS[4], handler: healthCheck },
    { def: DASHBOARD_TOOL_DEFS[5], handler: escalate },
  ];
}
