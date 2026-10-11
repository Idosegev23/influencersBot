import { NextResponse } from 'next/server';
import { getAgentSession, type AgentSession } from '@/lib/auth/agent-auth';

/**
 * Gate for the support admin console's own endpoints. The account is whatever the signed
 * agent cookie for `accountUsername` says it is — the username in the URL only picks which
 * cookie to read, so it cannot point an admin at another account.
 */
export async function requireAgentAdmin(
  accountUsername: string | null | undefined,
): Promise<{ session: AgentSession } | { res: NextResponse }> {
  if (!accountUsername) {
    return { res: NextResponse.json({ error: 'accountUsername required' }, { status: 400 }) };
  }
  const session = await getAgentSession(accountUsername);
  if (!session) return { res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!session.is_admin) return { res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { session };
}
