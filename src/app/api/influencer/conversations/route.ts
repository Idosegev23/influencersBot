import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/influencer/conversations?username=...&offset=0&q=search
 *
 * Serves the conversations dashboard. This used to run in the browser against
 * Postgres with the anon key, which is why chat_messages could not have RLS.
 *
 * Two behaviours differ from the client version, both deliberately:
 *
 *  • Search is scoped to the account. The old query ilike'd across every
 *    tenant's messages, took the first 100 hits, then filtered to this
 *    account — so a busy neighbour could crowd out your own results.
 *  • Messages are fetched in one batched query instead of one per session.
 */

const PAGE_SIZE = 50;
const MESSAGES_PER_SESSION = 50;
const SEARCH_MATCH_LIMIT = 100;

type SessionRow = { id: string; [k: string]: any };

export async function GET(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;

  const accountId = auth.accountId;
  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0) || 0);
  const q = (searchParams.get('q') ?? '').trim();

  try {
    let sessions: SessionRow[] = [];

    if (q) {
      // Scope the message search to this account via an inner join on the session.
      const { data: matches, error: matchErr } = await supabase
        .from('chat_messages')
        .select('session_id, chat_sessions!inner(account_id)')
        .eq('chat_sessions.account_id', accountId)
        .ilike('content', `%${q}%`)
        .limit(SEARCH_MATCH_LIMIT);

      if (matchErr) throw matchErr;

      const sessionIds = [...new Set((matches ?? []).map((m: any) => m.session_id))];
      if (sessionIds.length === 0) return NextResponse.json({ sessions: [] });

      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('account_id', accountId)
        .in('id', sessionIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      sessions = data ?? [];
    } else {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      sessions = data ?? [];
    }

    if (sessions.length === 0) return NextResponse.json({ sessions: [] });

    // One query for every session's messages, then group in memory.
    const { data: allMessages, error: msgErr } = await supabase
      .from('chat_messages')
      .select('id, session_id, role, content, created_at')
      .in('session_id', sessions.map((s) => s.id))
      .order('created_at', { ascending: true });

    if (msgErr) throw msgErr;

    const bySession = new Map<string, any[]>();
    for (const m of allMessages ?? []) {
      const bucket = bySession.get(m.session_id);
      if (bucket) bucket.push(m);
      else bySession.set(m.session_id, [m]);
    }

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        ...s,
        messages: (bySession.get(s.id) ?? []).slice(0, MESSAGES_PER_SESSION),
      })),
    });
  } catch (error) {
    console.error('[Conversations] GET error:', error);
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
  }
}
