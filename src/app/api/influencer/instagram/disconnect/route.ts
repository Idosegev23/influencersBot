import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/influencer/instagram/disconnect?username=
 * Owner-facing disconnect: deactivates the account's Instagram connection
 * (ig_graph_connections.is_active = false). Does NOT delete stored data —
 * full deletion is a separate flow (/api/influencer/request-deletion).
 * Account is derived from the session (never a client-supplied id).
 */
export async function POST(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;

  const { error } = await supabase
    .from('ig_graph_connections')
    .update({ is_active: false })
    .eq('account_id', auth.accountId)
    .eq('is_active', true);

  if (error) {
    console.error('[ig disconnect] error:', error.message);
    return NextResponse.json({ error: 'Disconnect failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
