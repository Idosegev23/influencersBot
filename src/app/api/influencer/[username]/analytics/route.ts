/**
 * Accurate analytics for an account's chat activity.
 *
 * The previous implementation conflated "sessions" with "unique
 * visitors" (217 vs the real 1022 for LA BEAUTÉ in last 24h) and
 * had no topic breakdown. This route returns:
 *
 *   • visits.total            page opens (with dedup)
 *   • visits.unique           distinct anon_id — the real visitor count
 *   • sessions.total          chat sessions opened (subset of visitors)
 *   • sessions.with_message   sessions where the customer actually wrote
 *   • messages.user           messages from the customer
 *   • messages.assistant      messages from the bot
 *   • avg_user_msgs_per_session
 *   • topics                  bucketed first-user-message classification:
 *                             shipment_status / complaint / return /
 *                             support_request / coupon / product_question /
 *                             greeting / other
 *
 * The topic classifier runs as a SQL CASE — fast, deterministic, no
 * extra LLM calls. The patterns mirror the chat-route fast-path so
 * what gets auto-redirected on the chat side is what gets bucketed
 * the same way here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

function parseRange(req: NextRequest): { fromIso: string; toIso: string } {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const days = Number(url.searchParams.get('days') || '7');
  if (fromParam && toParam) return { fromIso: fromParam, toIso: toParam };
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string }> },
) {
  const { username } = await ctx.params;
  const isInfluencer = await checkInfluencerAuth(username);
  const isAdmin = (await requireAdminAuth()) === null;
  if (!isInfluencer && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const accountId = influencer.id;
  const { fromIso, toIso } = parseRange(req);

  // Visits — page opens
  const [{ count: visitsTotal }, visitsUniqueRes] = await Promise.all([
    supabase
      .from('chat_visits')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .gte('created_at', fromIso)
      .lte('created_at', toIso),
    supabase
      .from('chat_visits')
      .select('anon_id')
      .eq('account_id', accountId)
      .gte('created_at', fromIso)
      .lte('created_at', toIso),
  ]);
  const uniqueVisitors = new Set(
    (visitsUniqueRes.data || []).map((r: any) => r.anon_id).filter(Boolean),
  ).size;

  // Sessions
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id, message_count, created_at')
    .eq('account_id', accountId)
    .gte('created_at', fromIso)
    .lte('created_at', toIso);

  const sessionIds = (sessions || []).map((s: any) => s.id);
  const sessionsTotal = sessionIds.length;

  // Messages
  let userMessages = 0;
  let botMessages = 0;
  const sessionsWithUserMsg = new Set<string>();

  if (sessionIds.length > 0) {
    // Supabase has a 1000-row default limit; chunk if many sessions.
    const CHUNK = 200;
    for (let i = 0; i < sessionIds.length; i += CHUNK) {
      const batch = sessionIds.slice(i, i + CHUNK);
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('session_id, role')
        .in('session_id', batch);
      for (const m of msgs || []) {
        if (m.role === 'user') {
          userMessages++;
          sessionsWithUserMsg.add(m.session_id);
        } else if (m.role === 'assistant') {
          botMessages++;
        }
      }
    }
  }

  // Topics — first user message of each session, classified.
  const topics = await classifyTopics(accountId, fromIso, toIso);

  // Conversion events — coupon copies + product clicks. The legacy
  // getAnalyticsSummary already does this; mirroring here so the
  // page can drop that call entirely.
  const { data: eventRows } = await supabase
    .from('events')
    .select('type')
    .eq('account_id', accountId)
    .gte('created_at', fromIso)
    .lte('created_at', toIso);
  let couponCopies = 0;
  let productClicks = 0;
  for (const e of eventRows || []) {
    if ((e as any).type === 'coupon_copied') couponCopies++;
    else if ((e as any).type === 'product_clicked') productClicks++;
  }

  return NextResponse.json({
    range: { from: fromIso, to: toIso },
    visits: {
      total: visitsTotal || 0,
      unique: uniqueVisitors,
    },
    sessions: {
      total: sessionsTotal,
      with_message: sessionsWithUserMsg.size,
    },
    messages: {
      user: userMessages,
      assistant: botMessages,
      total: userMessages + botMessages,
    },
    avg_user_msgs_per_session:
      sessionsWithUserMsg.size > 0
        ? Math.round((userMessages / sessionsWithUserMsg.size) * 10) / 10
        : 0,
    topics,
    conversions: {
      coupon_copies: couponCopies,
      product_clicks: productClicks,
    },
  });
}

/**
 * Simple keyword-based classifier on the FIRST user message of each
 * session. Buckets are ordered — most specific first.
 *
 * Note on Hebrew: final-form letters are different code points
 * (e.g. נ U+05E0 vs ן U+05DF). When matching words that can end with
 * such letters mid-word (e.g. "קופון" singular vs "קופונים" plural),
 * use a character class like [נן] or list both forms explicitly.
 */
async function classifyTopics(
  accountId: string,
  fromIso: string,
  toIso: string,
): Promise<Record<string, number>> {
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('account_id', accountId)
    .gte('created_at', fromIso)
    .lte('created_at', toIso);
  const sessionIds = (sessions || []).map((s: any) => s.id);
  if (sessionIds.length === 0) return {};

  // Fetch user messages with the smallest created_at per session.
  // Doing in chunks to keep query manageable.
  const firstByType: Record<string, string> = {}; // session_id → text
  const CHUNK = 200;
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const batch = sessionIds.slice(i, i + CHUNK);
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('session_id, content, created_at')
      .in('session_id', batch)
      .eq('role', 'user')
      .order('created_at', { ascending: true });
    for (const m of msgs || []) {
      if (!firstByType[m.session_id]) {
        firstByType[m.session_id] = m.content || '';
      }
    }
  }

  const counts: Record<string, number> = {};
  for (const txt of Object.values(firstByType)) {
    const topic = classifyOne(txt);
    counts[topic] = (counts[topic] || 0) + 1;
  }
  return counts;
}

function classifyOne(text: string): string {
  const t = (text || '').trim();
  if (!t) return 'other';

  // Order matters — most specific first.

  // 1) Shipment status / "where's my order?"
  if (
    /מתי.*?(תגיע|יגיע|מגיע|מגיעה|אקבל|הגעה)/.test(t) ||
    /איפה.*?(הזמנה|משלוח|חבילה|ההזמנה|המשלוח)/.test(t) ||
    /סטטוס.*?(הזמנה|משלוח)/.test(t) ||
    /מצב.*?(הזמנה|משלוח)/.test(t) ||
    /לעקוב\s+אחרי/.test(t) ||
    /\bמעקב\b/.test(t) ||
    /track(?:ing)?/i.test(t) ||
    /הזמנה.*?(לא הגיעה|לא הגיע|מאחרת|מאחר)/.test(t) ||
    /^הזמנה\s+\d+$/.test(t)
  ) {
    return 'shipment_status';
  }

  // 2) Complaint — damaged / missing / wrong item
  if (
    /דול(ף|פת|פים)/.test(t) ||
    /נז(ל|לת|ילה)|נשפך/.test(t) ||
    /\bשבור[הים]?\b/.test(t) ||
    /סדוק[הים]?/.test(t) ||
    /פגום[הים]?/.test(t) ||
    /מקולקל[תים]?/.test(t) ||
    /ניזוק|נמעך|נשבר|מעוך|פתוח/.test(t) ||
    /חסר.*?(פריט|מוצר|בחבילה|במשלוח|בו|מוצרים|פריטים)/.test(t) ||
    /חוסרים/.test(t) ||
    /לא\s+(שמו|הכניסו)\s+לי/.test(t) ||
    /לא\s+קיבלתי\s+את/.test(t) ||
    /הגיע(ה)?.*?(חסר|בלי|אבל)/.test(t) ||
    /טעות.*?(הזמנ|מוצר|חבילה|משלוח)/.test(t) ||
    /מוצר.*?(לא נכון|שגוי|אחר|שונה|שלא הזמנתי)/.test(t) ||
    /ההזמנה.*?(שלא שלי|לא שלי)/.test(t)
  ) {
    return 'complaint';
  }

  // 3) Return / exchange
  if (
    /להחזיר/.test(t) ||
    /להחליף|החלפת/.test(t) ||
    /ביטול\s+הזמנה/.test(t) ||
    /(לקבל|רוצ[הים])\s+החזר/.test(t)
  ) {
    return 'return_or_exchange';
  }

  // 4) Support request / human rep / "no response"
  if (
    /נציג/.test(t) ||
    /שירות\s*(לקוחות|גרוע|לקוי|נורא)/.test(t) ||
    /לדבר\s+עם\s+(מישהו|נציג|בנאדם)/.test(t) ||
    /איך\s+(יוצרים|פונים|אפשר|ניתן)/.test(t) ||
    /(פנייה|פניה)\s+ל?תמיכה/.test(t) ||
    /\bתמיכה\b/.test(t) ||
    /אין\s+(מענה|תגובה|התייחסות)/.test(t) ||
    /(הטלפון|המייל)\s+שלכם/.test(t)
  ) {
    return 'support_request';
  }

  // 5) Coupon / discount — handle final-form letter variants.
  if (
    /קופונ/.test(t) || // matches both קופון and קופונים (shared prefix)
    /\bקופון\b/.test(t) ||
    /הנחה|הנחות/.test(t) ||
    /\bקוד\b|קודי\s+הנחה/.test(t) ||
    /מבצע|מבצעים/.test(t) ||
    /coupon/i.test(t)
  ) {
    return 'coupon';
  }

  // 6) Product question / recommendation
  if (
    /איזה\s*(שמפו|מסכה|מוצר|טיפוח|סדרה|בושם|סרום)/.test(t) ||
    /מה\s+(ממליצ|מתאים|הכי טוב)/.test(t) ||
    /המלצ.*?(מוצר|שיער|טיפוח|סדרה)/.test(t) ||
    /הבדל\s+בין/.test(t) ||
    /איך\s+משתמש/.test(t) ||
    /ספר.*?(לי|על)\s+/.test(t) ||
    /סדרה|סדרות/.test(t)
  ) {
    return 'product_question';
  }

  // 7) Greeting
  if (/^\s*(שלום|היי|הי\b|ערב\s+טוב|בוקר\s+טוב|מה\s+קורה)/.test(t)) {
    return 'greeting';
  }

  return 'other';
}
