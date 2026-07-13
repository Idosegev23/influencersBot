import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/influencer/dm/flag?username=  body { sessionId, flagged }
 * Durable "needs my attention" marker on a DM conversation (chat_sessions.meta_state).
 */
export async function POST(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;

  const { sessionId, flagged } = await req.json().catch(() => ({}));
  if (!sessionId || typeof flagged !== 'boolean') {
    return NextResponse.json({ error: 'Missing sessionId or flagged' }, { status: 400 });
  }

  const { error } = await supabase
    .from('chat_sessions')
    .update({ meta_state: flagged ? 'flagged' : null })
    .eq('id', sessionId)
    .eq('account_id', auth.accountId);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  return NextResponse.json({ ok: true, flagged });
}
