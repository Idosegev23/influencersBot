/**
 * Bestie's three sales tools.
 *
 * Deliberately few. The brain's job is a conversation, not a workflow: it can
 * look something up, write down what it learned, and hand the lead to a person.
 * Everything else is talking.
 */
import type { BestieTool, BestieToolCtx, BestieToolResult, OpenAIFunctionDef } from './types';

export const BESTIE_TOOL_DEFS: OpenAIFunctionDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_bestie_knowledge',
      description:
        'חיפוש בידע על בסטי — מה המוצר עושה, למי הוא מתאים, איך משתמשים בו, ומה יש בכל מסך. ' +
        'זה המקור היחיד לעובדות. כל טענה עובדתית חייבת לצאת מכאן.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'השאלה בשפת הלקוח, כפי שנשאלה' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'note_lead_detail',
      description:
        'רישום מה שנלמד על העסק של הליד. לקרוא ברגע שמתגלה פרט חדש, לא בסוף השיחה.',
      parameters: {
        type: 'object',
        properties: {
          business: { type: 'string', description: 'סוג העסק, למשל "חנות בגדים אונליין"' },
          size: { type: 'string', description: 'גודל — עובדים, פניות ביום, היקף' },
          need: { type: 'string', description: 'מה הוא מנסה לפתור' },
          urgency: { type: 'string', description: 'כמה זה דחוף לו' },
          channels: { type: 'string', description: 'איפה הלקוחות שלו פונים אליו היום' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_sales',
      description:
        'העברת הליד לאיש מכירות. לקרוא כשהוא מבקש לדבר עם מישהו, כששואלים על מחיר, ' +
        'או כשברור שהוא מעוניין. פעולה סופית — אחריה מודים ומסיימים ולא ממשיכים לנהל את השיחה.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'סיכום קצר בשביל איש המכירות: מי זה, מה הוא צריך, ולמה עכשיו',
          },
        },
        required: ['summary'],
      },
    },
  },
];

async function searchKnowledge(args: any, ctx: BestieToolCtx): Promise<BestieToolResult> {
  const { retrieveContext } = await import('@/lib/rag');
  const { sources } = await retrieveContext({
    accountId: ctx.accountId,
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

async function noteLeadDetail(args: any, ctx: BestieToolCtx): Promise<BestieToolResult> {
  const detail = Object.fromEntries(
    Object.entries(args ?? {}).filter(([, v]) => typeof v === 'string' && v.trim())
  );
  if (!ctx.leadId || !Object.keys(detail).length) return { ok: true, data: { noted: false } };

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();

  // Merge rather than replace — a later turn learning "urgency" must not erase
  // the "business" a earlier turn recorded.
  const { data: lead } = await supabase
    .from('bestie_leads').select('qualification').eq('id', ctx.leadId).maybeSingle();

  const merged = { ...(lead?.qualification ?? {}), ...detail };
  await supabase
    .from('bestie_leads')
    .update({ qualification: merged, updated_at: new Date().toISOString() })
    .eq('id', ctx.leadId);

  return { ok: true, data: { noted: true }, qualification: merged };
}

async function handoffToSales(args: any, ctx: BestieToolCtx): Promise<BestieToolResult> {
  if (!ctx.leadId) return { ok: false, data: { reason: 'no_lead' } };

  const { createClient } = await import('@/lib/supabase/server');
  const { sendHandoffEmail } = await import('@/lib/bestie/handoff-email');
  const supabase = createClient();

  const { data: lead } = await supabase
    .from('bestie_leads').select('*').eq('id', ctx.leadId).maybeSingle();
  if (!lead) return { ok: false, data: { reason: 'lead_missing' } };

  const transcript = ctx.chatSessionId
    ? ((await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', ctx.chatSessionId)
        .order('created_at', { ascending: true })
      ).data ?? []).map((m: any) => ({ role: m.role, text: m.content }))
    : [];

  const sent = await sendHandoffEmail({
    lead,
    summary: String(args?.summary ?? ''),
    transcript,
  });

  const nowIso = new Date().toISOString();
  await supabase
    .from('bestie_leads')
    .update({ status: 'handed_off', handed_off_at: nowIso, updated_at: nowIso })
    .eq('id', ctx.leadId);

  // Pause the bot on this conversation. A salesperson now owns the thread, and
  // the bot must not keep working it beside them.
  await supabase
    .from('bestie_lead_sessions')
    .update({ bot_paused: true, bot_paused_reason: 'handed_off_to_sales', updated_at: nowIso })
    .eq('wa_id', ctx.waId);

  return { ok: true, data: { emailed: sent.success }, handedOff: true };
}

export function getBestieTools(): BestieTool[] {
  return [
    { def: BESTIE_TOOL_DEFS[0], handler: searchKnowledge },
    { def: BESTIE_TOOL_DEFS[1], handler: noteLeadDetail },
    { def: BESTIE_TOOL_DEFS[2], handler: handoffToSales },
  ];
}
