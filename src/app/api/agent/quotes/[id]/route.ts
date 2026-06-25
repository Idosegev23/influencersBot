/**
 * POST /api/agent/quotes/[id] — quote recovery actions on a signature request.
 *   { action: 'cancel' }  — cancel the quote + deal (before signing)
 *   { action: 'resend' }  — re-issue a fresh signing link (new token + expiry)
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { cancelQuote, resendQuote } from '@/lib/crm/quotes';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  try {
    if (body?.action === 'cancel') {
      await cancelQuote(id, agent.id);
      return NextResponse.json({ success: true });
    }
    if (body?.action === 'resend') {
      const r = await resendQuote(id, agent.id);
      return NextResponse.json({ success: true, ...r });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 400 });
  }
}
