/**
 * GET  /api/agent/orderers/[id] — client detail: contacts + campaigns.
 * POST /api/agent/orderers/[id] — { action: 'add_contact', name, role?, email?, phone? }
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

async function loadOwned(id: string, agentId: string) {
  const { data } = await supabaseAdmin.from('clients').select('*').eq('id', id).maybeSingle();
  if (!data) return { error: 'not found' as const };
  if (data.agent_id !== agentId) return { error: 'forbidden' as const };
  return { client: data };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const res = await loadOwned(id, gate.agent.id);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.error === 'forbidden' ? 403 : 404 });

  const [{ data: contacts }, { data: campaigns }] = await Promise.all([
    supabaseAdmin.from('client_contacts').select('id, name, role, email, phone').eq('client_id', id).order('created_at', { ascending: true }),
    supabaseAdmin.from('campaigns').select('id, name, season, status, brand_id').eq('client_id', id).order('created_at', { ascending: false }),
  ]);

  return NextResponse.json({ client: res.client, contacts: contacts || [], campaigns: campaigns || [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const res = await loadOwned(id, gate.agent.id);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.error === 'forbidden' ? 403 : 404 });

  const body = await req.json().catch(() => ({} as any));
  if (body?.action === 'add_contact') {
    const name = String(body?.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'שם איש קשר נדרש' }, { status: 400 });
    const { error } = await supabaseAdmin.from('client_contacts').insert({
      client_id: id,
      name,
      role: body?.role || null,
      email: body?.email || null,
      phone: body?.phone || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
