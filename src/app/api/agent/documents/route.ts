/**
 * GET /api/agent/documents?partnershipId=X — list documents (quote/agreement/invoice)
 * for one of the agent's deals, with stream URLs.
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const partnershipId = new URL(req.url).searchParams.get('partnershipId');
  if (!partnershipId) return NextResponse.json({ error: 'partnershipId required' }, { status: 400 });

  const { data: p } = await supabaseAdmin
    .from('partnerships')
    .select('id, agent_id')
    .eq('id', partnershipId)
    .maybeSingle();
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (p.agent_id !== agent.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: docs } = await supabaseAdmin
    .from('partnership_documents')
    .select('id, filename, document_type, mime_type, created_at')
    .eq('partnership_id', partnershipId)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    documents: (docs || []).map((d) => ({ ...d, url: `/api/agent/documents/${d.id}/file` })),
  });
}
