import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { pauseBot, resumeBot } from '@/lib/handoff/bot-pause';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const chatSessionId = (body?.chatSessionId || '').toString().trim();
  const action = (body?.action || '').toString();
  if (!chatSessionId || (action !== 'pause' && action !== 'resume')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // resolve the owning account so we can authorize the influencer
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, account_id')
    .eq('id', chatSessionId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', session.account_id)
    .maybeSingle();
  const username = account?.config?.username || '';

  const isAdmin = (await requireAdminAuth()) === null;
  const isInfluencer = username ? await checkInfluencerAuth(username) : false;
  if (!isAdmin && !isInfluencer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (action === 'pause') await pauseBot(chatSessionId, 'manual');
  else await resumeBot(chatSessionId); // manual resume only — no auto-resume

  return NextResponse.json({ ok: true, chatSessionId, action });
}
