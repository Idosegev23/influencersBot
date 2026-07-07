/**
 * Clients (orderers) — the entity that ORDERS a campaign: a brand acting as its
 * own client, or an ad agency. GET list / POST create.
 * (Route named 'orderers' to avoid colliding with the talent roster at /agent/clients.)
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const { data } = await supabaseAdmin
    .from('clients')
    .select('id, name, type, notes, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false });

  const list = data || [];
  const ids = list.map((c) => c.id);
  const counts: Record<string, { contacts: number; campaigns: number }> = {};
  if (ids.length) {
    const [{ data: contacts }, { data: campaigns }] = await Promise.all([
      supabaseAdmin.from('client_contacts').select('client_id').in('client_id', ids),
      supabaseAdmin.from('campaigns').select('client_id').in('client_id', ids),
    ]);
    for (const id of ids) counts[id] = { contacts: 0, campaigns: 0 };
    for (const c of contacts || []) if (counts[c.client_id]) counts[c.client_id].contacts++;
    for (const c of campaigns || []) if (c.client_id && counts[c.client_id]) counts[c.client_id].campaigns++;
  }

  return NextResponse.json({
    clients: list.map((c) => ({ ...c, contacts: counts[c.id]?.contacts || 0, campaigns: counts[c.id]?.campaigns || 0 })),
  });
}

export async function POST(req: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const body = await req.json().catch(() => ({} as any));
  const name = String(body?.name ?? '').trim();
  const type = body?.type === 'agency' ? 'agency' : 'brand';
  if (!name) return NextResponse.json({ error: 'שם הלקוח נדרש' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({ agent_id: agent.id, name, type, notes: body?.notes || null })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
