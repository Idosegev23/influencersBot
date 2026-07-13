import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { sendInstagramDM } from '@/lib/instagram-graph/client';
import { parseRecipientFromThreadId, within24h } from '@/lib/instagram-graph/dm-threads';

/**
 * POST /api/influencer/dm/send?username=  body { threadId, text }
 * Owner sends a manual DM reply. Hard-enforces Instagram's 24-hour messaging
 * window (submission compliance: never send outside it). Persists the sent
 * message as an outbound `human` message.
 */
export async function POST(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;

  const { threadId, text } = await req.json().catch(() => ({}));
  if (!threadId || !text?.trim()) {
    return NextResponse.json({ error: 'Missing threadId or text' }, { status: 400 });
  }

  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, message_count')
    .eq('thread_id', threadId)
    .eq('account_id', auth.accountId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  // 24-hour window: only reply to a user who messaged within the last 24h.
  const { data: lastInbound } = await supabase
    .from('chat_messages')
    .select('created_at')
    .eq('session_id', session.id)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!within24h(lastInbound?.created_at || null, Date.now())) {
    return NextResponse.json({ error: 'outside_24h_window' }, { status: 422 });
  }

  const recipientId = parseRecipientFromThreadId(threadId);
  const conn = await getIgConnectionForAccount(auth.accountId);
  if (!recipientId || !conn) {
    return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });
  }

  try {
    const result = await sendInstagramDM(recipientId, text, conn.igId, conn.accessToken);
    await supabase.from('chat_messages').insert({
      session_id: session.id,
      role: 'assistant',
      content: text,
      metadata: { by: 'human' },
      ...(result?.message_id ? { meta_mid: result.message_id } : {}),
    });
    await supabase
      .from('chat_sessions')
      .update({ message_count: (session.message_count || 0) + 1 })
      .eq('id', session.id);
    return NextResponse.json({ ok: true, response: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, response: { error: { message: e?.message || 'send failed' } } });
  }
}
