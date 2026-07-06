/**
 * Widget Session — fetch recent chat messages for a session so the widget
 * can restore the conversation visually on page load (or when the visitor
 * returns after opening a ticket / closing the widget).
 *
 *   GET /api/widget/session/[sessionId]?accountId=...
 *     → { messages: [{role, content}], sessionId, productCards }
 *
 * Validates the session belongs to the account before returning data.
 * Capped at the last 20 message pairs so the payload stays small and the
 * widget doesn't re-render an unbounded scrollback.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin') || '*') });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const headers = cors(req.headers.get('origin') || '*');
  try {
    const accountId = req.nextUrl.searchParams.get('accountId');
    if (!sessionId || !accountId) {
      return NextResponse.json({ error: 'sessionId + accountId required' }, { status: 400, headers });
    }

    const supabase = await createClient();
    // Validate session belongs to this account — prevents leaking another
    // account's history via a guessed sessionId.
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id, account_id')
      .eq('id', sessionId)
      .single();
    if (!session || session.account_id !== accountId) {
      return NextResponse.json({ messages: [] }, { headers });
    }

    // Display window: only the last 7 days are restored into the widget.
    // Full history stays in chat_messages untouched — this is a UI cutoff,
    // not retention. Without it a returning visitor sees months-old
    // scrollback from every visit the account ever had with them.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: true })
      .limit(40);

    const messages = (rows || []).map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
    }));

    return NextResponse.json({ sessionId, messages }, { headers });
  } catch (err: any) {
    console.error('[Widget Session] error:', err);
    return NextResponse.json({ error: err?.message || 'internal error' }, { status: 500, headers });
  }
}
