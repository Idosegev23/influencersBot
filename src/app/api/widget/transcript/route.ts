/**
 * Widget Transcript — emails the visitor a copy of the chat conversation.
 * POST /api/widget/transcript
 *
 * Pulls chat_messages for the session and sends a clean HTML email to the
 * visitor's address. Bot turns and visitor turns are clearly distinguished.
 * Account branding (display_name) is in the subject + header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin') || '*') });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin') || '*');
  try {
    const body = await req.json();
    const accountId: string | undefined = body?.accountId;
    const sessionId: string | undefined = body?.sessionId;
    const email: string | undefined = (body?.email || '').trim().toLowerCase();

    if (!accountId || !sessionId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'accountId + sessionId + valid email required' }, { status: 400, headers });
    }

    const supabase = await createClient();
    const [{ data: account }, { data: msgs }] = await Promise.all([
      supabase.from('accounts').select('config, language').eq('id', accountId).single(),
      supabase.from('chat_messages')
        .select('role, content, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(100),
    ]);

    if (!account) {
      return NextResponse.json({ error: 'account not found' }, { status: 404, headers });
    }
    if (!msgs || !msgs.length) {
      return NextResponse.json({ error: 'no conversation found for that session' }, { status: 404, headers });
    }

    const cfg: any = account.config || {};
    const brand = cfg.display_name || cfg.username || 'Chat';
    const isEn = (account.language || 'he') === 'en';

    const subject = isEn ? `Your chat with ${brand}` : `השיחה שלך עם ${brand}`;
    const greeting = isEn ? 'Here\'s the chat you requested:' : 'הנה תמלול השיחה שביקשת:';
    const footer = isEn ? `Sent by ${brand} via BestieAI` : `נשלח על ידי ${brand} דרך BestieAI`;

    // Render each message as a styled bubble. We render bot+user side-by-side
    // visually with subtle color differentiation so the email reads like a
    // chat log, not a wall of text.
    const bubblesHtml = (msgs || []).map((m: any) => {
      const isUser = m.role === 'user';
      const align = isUser ? 'right' : 'left';
      const bg = isUser ? '#0c1013' : '#f3f4f6';
      const fg = isUser ? '#ffffff' : '#111111';
      const label = isUser
        ? (isEn ? 'You' : 'אתה/את')
        : brand;
      return `<div style="text-align:${align};margin:8px 0;">
        <div style="font-size:11px;color:#9ca3af;margin-bottom:2px;">${escapeHtml(label)}</div>
        <div style="display:inline-block;max-width:80%;background:${bg};color:${fg};padding:9px 14px;border-radius:18px;font-size:14px;line-height:1.45;white-space:pre-wrap;text-align:${isEn ? 'left' : 'right'};">${escapeHtml(m.content || '')}</div>
      </div>`;
    }).join('');

    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#0c1013;direction:${isEn ? 'ltr' : 'rtl'}">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="font-size:13px;color:#676767;margin-bottom:6px">${escapeHtml(brand)}</div>
    <h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#0c1013">${escapeHtml(subject)}</h1>
    <p style="font-size:14px;color:#4b5563;margin:0 0 18px;">${escapeHtml(greeting)}</p>
    <div style="border-top:1px solid #f1e9fd;padding-top:14px;">${bubblesHtml}</div>
  </div>
  <div style="max-width:560px;margin:12px auto 0;font-size:11px;color:#9ca3af;text-align:center">${escapeHtml(footer)}</div>
</body></html>`;

    const res = await sendEmail({ to: email, subject, html });
    if (!res.success) {
      console.warn('[Widget Transcript] email send failed:', res.error);
      return NextResponse.json({ error: res.error || 'send failed' }, { status: 500, headers });
    }
    return NextResponse.json({ success: true, sent: msgs.length }, { headers });
  } catch (err: any) {
    console.error('[Widget Transcript] error:', err);
    return NextResponse.json({ error: err?.message || 'internal error' }, { status: 500, headers });
  }
}
