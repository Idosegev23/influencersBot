/**
 * GET /api/cron/handoff-fallback
 *
 * Vercel cron — runs every 30 minutes. For any handoff whose status is
 * still `forwarded` X hours after we sent it (default 6h), drop a
 * fallback note into the visitor's chat letting them know Itamar is
 * busy and that Roi will follow up, then notify Roi by email so the
 * lead doesn't drop on the floor.
 *
 * Idempotent: each handoff is touched at most once via status flip to
 * `fallback_sent`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBriefEmail } from '@/lib/google-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const FALLBACK_AFTER_HOURS = Number(process.env.HANDOFF_FALLBACK_HOURS || '6');

function ownerName(): string {
  return process.env.CONFERENCE_LEAD_OWNER_NAME || 'רועי';
}
function ownerEmail(): string {
  return process.env.CONFERENCE_LEAD_OWNER_EMAIL || 'roi@ldrsgroup.com';
}

function buildOwnerNotice(args: {
  refCode: string;
  visitorLabel: string;
  question: string;
  forwardedAt: string | null;
}): { subject: string; html: string } {
  const subject = `⏰ Bestie handoff ללא תשובה — ${args.refCode}`;
  const since = args.forwardedAt
    ? new Date(args.forwardedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
    : '—';
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he"><body style="font-family:Heebo,Arial,sans-serif;background:#eef1f5;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:28px;box-shadow:0 2px 12px rgba(12,16,19,0.08);">
  <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#5FD4F5;text-transform:uppercase;margin-bottom:8px;">LDRS · Handoff fallback</div>
  <h2 style="margin:0 0 12px 0;color:#0c1013;font-size:20px;">איתמר לא ענה תוך ${FALLBACK_AFTER_HOURS}ש —  עברנו ל-fallback</h2>
  <p style="color:#52525b;font-size:14px;line-height:1.6;margin:0 0 16px 0;">
    ההודעה <strong>[#${args.refCode}]</strong> נשלחה ב-${since} לוואטסאפ של איתמר ולא נענתה.<br>
    הצ'אט של המבקר עודכן עם הודעה ש"איתמר עסוק" ושאתה תיצור איתו קשר.
  </p>
  <div style="background:#fafbfc;border:1px solid #eef1f5;border-radius:12px;padding:16px 18px;margin-top:8px;">
    <div style="font-size:12px;color:#7a8794;font-weight:700;margin-bottom:6px;">המבקר</div>
    <div style="font-size:14px;color:#0c1013;margin-bottom:14px;">${args.visitorLabel}</div>
    <div style="font-size:12px;color:#7a8794;font-weight:700;margin-bottom:6px;">השאלה</div>
    <div style="font-size:14px;color:#0c1013;line-height:1.55;">${args.question.replace(/</g, '&lt;')}</div>
  </div>
</div>
</body></html>`;
  return { subject, html };
}

export async function GET(req: NextRequest) {
  // Vercel cron secret check (optional but recommended)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const got = req.headers.get('authorization')?.replace('Bearer ', '');
    if (got !== cronSecret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - FALLBACK_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  const { data: stale, error } = await supabase
    .from('chat_handoffs')
    .select('id, account_id, session_id, ref_code, visitor_label, visitor_question, forwarded_at')
    .eq('status', 'forwarded')
    .lt('forwarded_at', cutoff)
    .limit(50);

  if (error) {
    console.error('[handoff-fallback] query failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; refCode: string; ok: boolean; error?: string }> = [];

  for (const h of stale || []) {
    try {
      // 1. Drop fallback note in the visitor's chat
      await supabase.from('chat_messages').insert({
        session_id: h.session_id,
        role: 'assistant',
        content:
          `איתמר עסוק כרגע ולא הצליח לענות אישית.\n` +
          `${ownerName()} מצוות LDRS יחזור אליך בהקדם — אם השארת אימייל או טלפון, הוא ייצור קשר. ` +
          `אם תרצה, אפשר להמשיך לדבר איתי כאן בינתיים.`,
        metadata: {
          source: 'handoff_fallback_note',
          ref_code: h.ref_code,
        },
      });

      // 2. Mark handoff as fallback_sent (idempotency anchor)
      await supabase
        .from('chat_handoffs')
        .update({
          status: 'fallback_sent',
          fallback_sent_at: new Date().toISOString(),
        })
        .eq('id', h.id);

      // 3. Notify Roi by email so the lead is in his inbox, not dropped
      try {
        const { subject, html } = buildOwnerNotice({
          refCode: h.ref_code,
          visitorLabel: h.visitor_label || '—',
          question: h.visitor_question || '—',
          forwardedAt: h.forwarded_at,
        });
        await sendBriefEmail({ to: ownerEmail(), subject, htmlBody: html });
      } catch (e) {
        console.error('[handoff-fallback] owner email failed', e);
      }

      results.push({ id: h.id, refCode: h.ref_code, ok: true });
    } catch (e: any) {
      console.error('[handoff-fallback] failed for', h.id, e);
      results.push({ id: h.id, refCode: h.ref_code, ok: false, error: e?.message });
    }
  }

  return NextResponse.json({
    success: true,
    cutoff,
    processed: results.length,
    results,
  });
}
