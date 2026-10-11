import { NextRequest, NextResponse } from 'next/server';
import { requireAgentAdmin } from '@/lib/auth/require-agent-admin';
import { connectAccountFromSignup } from '@/lib/whatsapp-cloud/connect-account';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/agent/account/[username]/whatsapp — a brand's support admin connects the brand's
 * WhatsApp number (Coexistence) from the admin console.
 *
 * Same flow as the wizard and the customer dashboard; only the door differs. Admin agents
 * only: connecting a number changes who answers every customer, which is not a rota decision.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const auth = await requireAgentAdmin(decodeURIComponent((await params).username));
  if ('res' in auth) return auth.res;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  console.log('[wa-connect] admin console connect', { accountId: auth.session.account_id, agentId: auth.session.agent_id });
  const out = await connectAccountFromSignup(auth.session.account_id, body);
  return NextResponse.json(out.body, { status: out.status });
}
