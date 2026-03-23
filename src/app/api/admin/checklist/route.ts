import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Default checklist template ───
const CHECKLIST_TEMPLATE: { section: string; tasks: { key: string; title: string }[] }[] = [
  {
    section: 'הקמת חשבון',
    tasks: [
      { key: 'account_create', title: 'יצירת חשבון ב-Supabase' },
      { key: 'account_type', title: 'הגדרת סוג חשבון (creator / brand / service_provider)' },
      { key: 'account_language', title: 'הגדרת שפה, timezone, תצורה בסיסית' },
      { key: 'account_profile_pic', title: 'שמירת תמונת פרופיל' },
      { key: 'account_display_name', title: 'הגדרת שם תצוגה' },
    ],
  },
  {
    section: 'חיבורים ואינטגרציות',
    tasks: [
      { key: 'conn_instagram_oauth', title: 'חיבור אינסטגרם (OAuth)' },
      { key: 'conn_website_domain', title: 'הגדרת דומיין אתר (אם רלוונטי)' },
      { key: 'conn_tiktok', title: 'חיבור TikTok (אם רלוונטי)' },
      { key: 'conn_youtube', title: 'חיבור YouTube (אם רלוונטי)' },
      { key: 'conn_documents', title: 'קבלת מסמכי רקע מהלקוח (PDF, FAQ וכו׳)' },
    ],
  },
  {
    section: 'סריקות תוכן',
    tasks: [
      { key: 'scan_ig_profile', title: 'סריקת פרופיל אינסטגרם' },
      { key: 'scan_ig_posts', title: 'סריקת פוסטים + תגובות' },
      { key: 'scan_ig_highlights', title: 'סריקת Highlights / Stories' },
      { key: 'scan_transcriptions', title: 'תמלול סרטונים (Gemini)' },
      { key: 'scan_website', title: 'סריקת אתר (deep-scrape)' },
      { key: 'scan_documents', title: 'העלאת מסמכים + פרסור AI' },
    ],
  },
  {
    section: 'עיבוד AI',
    tasks: [
      { key: 'ai_rag_chunks', title: 'יצירת RAG chunks + vectors' },
      { key: 'ai_rag_enrich', title: 'העשרת RAG (סיכומים, שאילתות סינתטיות)' },
      { key: 'ai_persona_build', title: 'בניית פרסונה (GPT-5.4)' },
      { key: 'ai_persona_tone', title: 'הגדרת טון, סגנון, אישיות' },
      { key: 'ai_tab_config', title: 'יצירת Tab Config מ-RAG' },
    ],
  },
  {
    section: 'הגדרת צ׳אטבוט',
    tasks: [
      { key: 'chat_greeting', title: 'הגדרת הודעת פתיחה' },
      { key: 'chat_questions', title: 'הגדרת שאלות מוכנות (Quick Actions)' },
      { key: 'chat_boundaries', title: 'הגדרת גבולות — מה הבוט לא עונה' },
      { key: 'chat_referrals', title: 'הגדרת הפניות (לאן מפנים שאלות חורגות)' },
      { key: 'chat_theme', title: 'הגדרת ערכת צבעים לצ׳אט' },
      { key: 'chat_coupons', title: 'הזנת קופונים ומבצעים (אם רלוונטי)' },
    ],
  },
  {
    section: 'וידג׳ט (אם רלוונטי)',
    tasks: [
      { key: 'widget_colors', title: 'הגדרת צבעים ועיצוב וידג׳ט' },
      { key: 'widget_logo', title: 'העלאת לוגו / אווטאר לבועת צ׳אט' },
      { key: 'widget_cors', title: 'הוספת דומיין ל-CORS whitelist' },
      { key: 'widget_embed_code', title: 'שליחת קוד הטמעה ללקוח' },
      { key: 'widget_install_verify', title: 'אימות התקנת הוידג׳ט באתר' },
    ],
  },
  {
    section: 'בדיקות ואימות',
    tasks: [
      { key: 'test_chat_general', title: 'בדיקת צ׳אט — שאלה כללית' },
      { key: 'test_chat_content', title: 'בדיקת צ׳אט — שאלה על תוכן ספציפי (3+ שאלות)' },
      { key: 'test_chat_boundary', title: 'בדיקת גבולות — שאלה חורגת' },
      { key: 'test_content_quality', title: 'אימות איכות תוכן — אין פברוק / הזיות' },
      { key: 'test_widget_design', title: 'בדיקת עיצוב וידג׳ט (צבעים, RTL, מובייל)' },
      { key: 'test_widget_streaming', title: 'בדיקת Streaming + Typing Indicator' },
    ],
  },
  {
    section: 'אישור סופי והעברה',
    tasks: [
      { key: 'final_content_approval', title: 'אישור איכות תוכן סופי' },
      { key: 'final_client_handoff', title: 'העברה ללקוח / Go Live' },
      { key: 'final_subdomain', title: 'הגדרת Subdomain / קישור ייחודי' },
      { key: 'final_credentials', title: 'יצירת פרטי גישה ללקוח (אם רלוונטי)' },
    ],
  },
];

// GET — load checklist for account (auto-init if needed)
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
  }

  // Check if checklist exists
  const supabase = getSupabase();
  const { data: existing, error: fetchErr } = await supabase
    .from('account_checklist')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true });

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // If no checklist, initialize from template
  if (!existing || existing.length === 0) {
    const rows = CHECKLIST_TEMPLATE.flatMap((sec) =>
      sec.tasks.map((t) => ({
        account_id: accountId,
        task_key: t.key,
        section: sec.section,
        task_title: t.title,
        completed: false,
      }))
    );

    const { data: inserted, error: insertErr } = await supabase
      .from('account_checklist')
      .insert(rows)
      .select('*')
      .order('created_at', { ascending: true });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ tasks: inserted, initialized: true });
  }

  return NextResponse.json({ tasks: existing });
}

// PATCH — toggle task completion or update note
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, completed, note, completed_by } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
  }

  const supabase = getSupabase();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof completed === 'boolean') {
    updates.completed = completed;
    updates.completed_at = completed ? new Date().toISOString() : null;
    updates.completed_by = completed ? (completed_by || 'admin') : null;
  }

  if (typeof note === 'string') {
    updates.note = note;
  }

  const { data, error } = await supabase
    .from('account_checklist')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: data });
}

// POST — reset checklist (re-initialize from template)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { accountId, action } = body;

  if (!accountId) {
    return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
  }

  const supabase = getSupabase();
  if (action === 'reset') {
    // Delete existing and re-create
    await supabase
      .from('account_checklist')
      .delete()
      .eq('account_id', accountId);

    const rows = CHECKLIST_TEMPLATE.flatMap((sec) =>
      sec.tasks.map((t) => ({
        account_id: accountId,
        task_key: t.key,
        section: sec.section,
        task_title: t.title,
        completed: false,
      }))
    );

    const { data, error } = await supabase
      .from('account_checklist')
      .insert(rows)
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tasks: data, reset: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
