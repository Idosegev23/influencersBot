/**
 * GET /api/agent/inbound — the agent's inbound messages (WhatsApp/email forwarded
 * quotes), for the inbox. Includes parsed data + whether a quote was already created.
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const url = new URL(req.url);
  const filter = url.searchParams.get('filter'); // 'needs_client' | 'all'

  let q = supabaseAdmin
    .from('crm_inbound_messages')
    .select('id, channel, sender, subject, raw_text, parse_status, parsed_data, partnership_id, signature_request_id, error, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filter === 'needs_client') q = q.is('partnership_id', null).eq('parse_status', 'parsed');

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Light client-name lookup for converted ones.
  const sigTokens = (data || []).filter((m) => m.signature_request_id).map((m) => m.signature_request_id);
  let tokenByReq: Record<string, string> = {};
  if (sigTokens.length) {
    const { data: sigs } = await supabaseAdmin.from('signature_requests').select('id, token').in('id', sigTokens as string[]);
    tokenByReq = Object.fromEntries((sigs || []).map((s) => [s.id, s.token]));
  }

  return NextResponse.json({
    inbound: (data || []).map((m) => ({
      id: m.id,
      channel: m.channel,
      sender: m.sender,
      subject: m.subject,
      preview: (m.raw_text || '').slice(0, 160),
      parse_status: m.parse_status,
      brand: m.parsed_data?.brandName || null,
      amount: typeof m.parsed_data?.totalAmount === 'number' ? m.parsed_data.totalAmount : null,
      currency: m.parsed_data?.currency || null,
      needs_client: !m.partnership_id && m.parse_status === 'parsed',
      partnership_id: m.partnership_id,
      sign_token: m.signature_request_id ? tokenByReq[m.signature_request_id] || null : null,
      error: m.error,
      created_at: m.created_at,
    })),
  });
}
