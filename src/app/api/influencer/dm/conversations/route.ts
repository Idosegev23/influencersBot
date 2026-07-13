import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { resolveSenderIdentity } from '@/lib/instagram-graph/dm-guards';
import { parseRecipientFromThreadId, within24h, summarizeThreads } from '@/lib/instagram-graph/dm-threads';

/**
 * GET /api/influencer/dm/conversations?username=  — owner-facing DM inbox.
 * Returns the account's Instagram DM threads (incoming + outgoing) + light analytics.
 * requireInfluencerAuth reads ?username= from the query string.
 */
export async function GET(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;
  const accountId = auth.accountId;

  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id, thread_id, meta_state, message_count')
    .eq('account_id', accountId)
    .like('thread_id', 'dm_ig_graph_%')
    .order('updated_at', { ascending: false })
    .limit(50);

  const conn = await getIgConnectionForAccount(accountId);
  const now = Date.now();

  const threads = await Promise.all((sessions || []).map(async (s: any) => {
    // Newest 50 (then reversed to chronological) — an ascending+limit would return
    // the OLDEST messages, making within24h stale and blocking replies on busy threads.
    const { data: msgsDesc } = await supabase
      .from('chat_messages')
      .select('role, content, created_at, metadata')
      .eq('session_id', s.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const messages = (msgsDesc || []).reverse().map((m: any) => ({
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
      by: m.metadata?.by || (m.role === 'assistant' ? 'bot' : undefined),
    }));

    const lastInbound = [...messages].reverse().find((m) => m.role === 'user');
    const last = messages[messages.length - 1];
    const recipientId = parseRecipientFromThreadId(s.thread_id);

    let recipientHandle: string | null = null;
    if (recipientId && conn) {
      const id = await resolveSenderIdentity(recipientId, conn.accessToken).catch(() => null);
      recipientHandle = id?.username || id?.name || null;
    }

    return {
      sessionId: s.id,
      threadId: s.thread_id,
      recipientId,
      recipientHandle,
      lastMessage: last?.content || '',
      lastMessageAt: last?.createdAt || null,
      lastInboundAt: lastInbound?.createdAt || null,
      within24h: within24h(lastInbound?.createdAt || null, now),
      flagged: s.meta_state === 'flagged',
      messages,
    };
  }));

  return NextResponse.json({ threads, analytics: summarizeThreads(threads) });
}
