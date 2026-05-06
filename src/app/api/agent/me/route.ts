import { NextRequest, NextResponse } from 'next/server';
import { getAgentSession } from '@/lib/auth/agent-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const accountUsername = url.searchParams.get('accountUsername');
  if (!accountUsername) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const session = await getAgentSession(accountUsername);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    agent: {
      id: session.agent_id,
      first_name: session.first_name,
      last_name: session.last_name,
      display_name: session.display_name,
      is_admin: session.is_admin,
      account_id: session.account_id,
    },
  });
}
