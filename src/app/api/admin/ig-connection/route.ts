import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;
  const accountId = req.nextUrl.searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ig_graph_connections')
    .select('ig_username, ig_name, ig_profile_pic, ig_followers_count, is_active, connected_at')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error('[ig-connection] Error:', error.message);
    return NextResponse.json({ connection: null });
  }

  return NextResponse.json({ connection: data });
}
