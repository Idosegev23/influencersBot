/**
 * POST /api/agent/inbound/[id]/convert — turn an unmatched inbound message into a
 * quote by assigning a client. { account_id, overrides? }
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { createQuote } from '@/lib/crm/quotes';
import { parsedToQuoteFields } from '@/lib/crm/quote-ingest';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;

  const { data: msg } = await supabaseAdmin
    .from('crm_inbound_messages')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (msg.agent_id !== agent.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (msg.partnership_id) return NextResponse.json({ error: 'כבר הומר להצעה' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const accountId = String(body?.account_id ?? '');
  if (!accountId || !(agent.managedAccountIds || []).includes(accountId)) {
    return NextResponse.json({ error: 'בחר/י לקוח מתוך הלקוחות שלך' }, { status: 400 });
  }

  const { data: acct } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).maybeSingle();
  const clientName = (acct?.config as any)?.display_name || (acct?.config as any)?.username || null;
  const parsed = msg.parsed_data || {};
  const fields = { ...parsedToQuoteFields(parsed), ...(body?.overrides || {}) };

  try {
    const result = await createQuote({
      agentId: agent.id,
      accountId,
      clientName,
      agentName: agent.fullName,
      notes: msg.raw_text || null,
      parsedData: parsed,
      ...fields,
    });
    await supabaseAdmin
      .from('crm_inbound_messages')
      .update({ partnership_id: result.partnershipId, signature_request_id: result.signatureRequestId, parse_status: 'parsed' })
      .eq('id', id);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
