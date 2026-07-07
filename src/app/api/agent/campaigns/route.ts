/**
 * Campaigns — a campaign belongs to a brand + a client (orderer).
 * GET list (with brand/client names) / POST create (resolves or creates the brand by name).
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const { data } = await supabaseAdmin
    .from('campaigns')
    .select('id, name, season, status, brand_id, client_id, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false });

  const list = data || [];
  const brandIds = Array.from(new Set(list.map((c) => c.brand_id).filter(Boolean)));
  const clientIds = Array.from(new Set(list.map((c) => c.client_id).filter(Boolean)));
  const [{ data: brands }, { data: clients }] = await Promise.all([
    brandIds.length ? supabaseAdmin.from('brands').select('id, name').in('id', brandIds as string[]) : Promise.resolve({ data: [] as any[] }),
    clientIds.length ? supabaseAdmin.from('clients').select('id, name').in('id', clientIds as string[]) : Promise.resolve({ data: [] as any[] }),
  ]);
  const brandName: Record<string, string> = Object.fromEntries((brands || []).map((b: any) => [b.id, b.name]));
  const clientName: Record<string, string> = Object.fromEntries((clients || []).map((c: any) => [c.id, c.name]));

  return NextResponse.json({
    campaigns: list.map((c) => ({
      ...c,
      brand_name: c.brand_id ? brandName[c.brand_id] || null : null,
      client_name: c.client_id ? clientName[c.client_id] || null : null,
    })),
  });
}

export async function POST(req: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const body = await req.json().catch(() => ({} as any));
  const name = String(body?.name ?? '').trim();
  const brandNameRaw = String(body?.brand_name ?? '').trim();
  const clientId = body?.client_id ? String(body.client_id) : null;
  if (!name) return NextResponse.json({ error: 'שם הקמפיין נדרש' }, { status: 400 });

  // resolve or create the brand for this agent
  let brandId: string | null = null;
  if (brandNameRaw) {
    const { data: existing } = await supabaseAdmin
      .from('brands')
      .select('id')
      .eq('agent_id', agent.id)
      .ilike('name', brandNameRaw)
      .maybeSingle();
    if (existing) brandId = existing.id;
    else {
      const { data: nb } = await supabaseAdmin.from('brands').insert({ agent_id: agent.id, name: brandNameRaw }).select('id').single();
      brandId = nb?.id || null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .insert({ agent_id: agent.id, name, season: body?.season || null, brand_id: brandId, client_id: clientId })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
