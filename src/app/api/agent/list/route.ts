import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAgentSession } from '@/lib/auth/agent-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const accountUsername = url.searchParams.get('accountUsername');
  if (!accountUsername) {
    return NextResponse.json({ error: 'accountUsername required' }, { status: 400 });
  }

  const session = await getAgentSession(accountUsername);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('support_agents')
    .select('id, first_name, last_name, is_admin, is_active, last_login_at')
    .eq('account_id', session.account_id)
    .eq('is_active', true)
    .order('first_name');

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({
    agents: (data || []).map((a) => ({
      id: a.id,
      first_name: a.first_name,
      last_name: a.last_name,
      display_name: `${a.first_name} ${a.last_name}`,
      is_admin: a.is_admin,
      last_login_at: a.last_login_at,
    })),
  });
}
