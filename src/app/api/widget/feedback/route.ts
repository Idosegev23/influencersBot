/**
 * Widget Message Feedback — visitor 👍/👎 ratings on bot replies.
 * POST /api/widget/feedback
 *
 * Stored per-account/per-session for response-quality analytics. No auth;
 * the only validation is shape + that the account exists. Rate-limited via
 * the global middleware (chat bucket).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin') || '*');
  try {
    const body = await req.json();
    const accountId: string | undefined = body?.accountId;
    const sessionId: string | undefined = body?.sessionId || undefined;
    const rating: string | undefined = body?.rating;
    const msgIndex = Number.isFinite(body?.msgIndex) ? body.msgIndex : null;
    const excerpt: string | undefined = typeof body?.messageContent === 'string'
      ? body.messageContent.slice(0, 500)
      : undefined;

    if (!accountId || (rating !== 'up' && rating !== 'down')) {
      return NextResponse.json({ error: 'accountId + rating (up|down) required' }, { status: 400, headers });
    }

    const supabase = await createClient();
    const { error } = await supabase.from('widget_message_feedback').insert({
      account_id: accountId,
      session_id: sessionId || null,
      msg_index: msgIndex,
      rating,
      message_excerpt: excerpt || null,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true }, { headers });
  } catch (err: any) {
    console.error('[Widget Feedback] error:', err);
    return NextResponse.json({ error: err?.message || 'internal error' }, { status: 500, headers });
  }
}
