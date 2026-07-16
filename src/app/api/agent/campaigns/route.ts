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

  // A campaign is only meaningful through its DEALS: which talents, how much, and how far along the
  // quote→signature→active path each one is. Without this the tab was just a name + a status chip.
  const campaignIds = list.map((c) => c.id);
  const { data: deals } = campaignIds.length
    ? await supabaseAdmin
        .from('partnerships')
        .select('id, campaign_id, account_id, status, proposal_amount, contract_amount, currency')
        .in('campaign_id', campaignIds)
    : { data: [] as any[] };

  const dealRows = (deals || []) as any[];
  const acctIds = Array.from(new Set(dealRows.map((d) => d.account_id).filter(Boolean)));
  const dealIds = dealRows.map((d) => d.id);
  const [{ data: accts }, { data: sigs }] = await Promise.all([
    acctIds.length ? supabaseAdmin.from('accounts').select('id, config').in('id', acctIds as string[]) : Promise.resolve({ data: [] as any[] }),
    dealIds.length ? supabaseAdmin.from('signature_requests').select('partnership_id, status').in('partnership_id', dealIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const talentName: Record<string, string> = Object.fromEntries(
    (accts || []).map((a: any) => [a.id, (a.config as any)?.display_name || (a.config as any)?.username || ''])
  );
  const sigByDeal: Record<string, string> = {};
  for (const s of (sigs || []) as any[]) sigByDeal[s.partnership_id] = s.status;

  type Agg = { deals: number; value: number; signed: number; awaiting_signature: number; draft: number; talents: string[] };
  const agg: Record<string, Agg> = {};
  for (const d of dealRows) {
    const a = (agg[d.campaign_id] ||= { deals: 0, value: 0, signed: 0, awaiting_signature: 0, draft: 0, talents: [] });
    a.deals += 1;
    a.value += Number(d.contract_amount ?? d.proposal_amount ?? 0);
    // 'active' = the signature landed and it became a real deal; a sent-but-unsigned quote is
    // awaiting; anything else is still being built.
    if (d.status === 'active') a.signed += 1;
    else if (sigByDeal[d.id] && sigByDeal[d.id] !== 'signed') a.awaiting_signature += 1;
    else a.draft += 1;
    const n = d.account_id ? talentName[d.account_id] : '';
    if (n && !a.talents.includes(n)) a.talents.push(n);
  }
  const empty: Agg = { deals: 0, value: 0, signed: 0, awaiting_signature: 0, draft: 0, talents: [] };

  return NextResponse.json({
    campaigns: list.map((c) => ({
      ...c,
      brand_name: c.brand_id ? brandName[c.brand_id] || null : null,
      client_name: c.client_id ? clientName[c.client_id] || null : null,
      ...(agg[c.id] || empty),
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
