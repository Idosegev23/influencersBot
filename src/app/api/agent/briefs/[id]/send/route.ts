/**
 * POST /api/agent/briefs/[id]/send — the agent priced the brief; create the deal,
 * persist the line items, issue the quote (PDF + signature link), and close the
 * brief. Body: { account_id, brand_name?, campaign_name?, line_items: [...] }.
 *
 * Human-in-the-loop: nothing is sent until the agent has priced ≥1 deliverable.
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { issueQuote } from '@/lib/crm/quotes';
import { computeTotals, lineItemsToDeliverables, type LineItem } from '@/lib/crm/pricing';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;

  const { data: b } = await supabaseAdmin.from('crm_inbound_messages').select('*').eq('id', id).maybeSingle();
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (b.agent_id !== agent.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // A brief with an existing deal_id is an EDIT/RESEND (e.g. after the client
  // returned it for changes) — the deal is updated in place below.

  const body = await req.json().catch(() => ({} as any));
  const accountId = String(body?.account_id ?? '');
  if (!accountId || !(agent.managedAccountIds || []).includes(accountId)) {
    return NextResponse.json({ error: 'בחר/י מיוצג מתוך הרוסטר שלך' }, { status: 400 });
  }

  const items: LineItem[] = Array.isArray(body?.line_items) ? body.line_items : [];
  const hasPriced = items.some((li) => Number(li?.unit_price) > 0 && Number(li?.qty) > 0);
  if (!hasPriced) return NextResponse.json({ error: 'תמחר/י לפחות תוצר אחד (מחיר וכמות > 0)' }, { status: 400 });

  const totals = computeTotals(items);
  if (totals.total <= 0) return NextResponse.json({ error: 'הסכום חייב להיות גדול מ-0' }, { status: 400 });

  const parsed = (b.parsed_data as any) || {};
  const brandName = String(body?.brand_name || parsed.brandName || b.subject || 'מותג');
  const campaignName = body?.campaign_name || parsed.campaignName || null;

  const { data: acct } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).maybeSingle();
  const clientName = (acct?.config as any)?.display_name || (acct?.config as any)?.username || null;
  const deliverables = lineItemsToDeliverables(items);

  // Resolve the campaign / client / brand linkage.
  let campaignId: string | null = body?.campaign_id ? String(body.campaign_id) : null;
  let clientId: string | null = body?.client_id ? String(body.client_id) : null;
  let brandId: string | null = null;
  const newCampaignName = String(body?.new_campaign_name || '').trim();

  const resolveBrandId = async (): Promise<string | null> => {
    if (!brandName) return null;
    const { data: existingBrand } = await supabaseAdmin
      .from('brands')
      .select('id')
      .eq('agent_id', agent.id)
      .ilike('name', brandName)
      .maybeSingle();
    if (existingBrand) return existingBrand.id;
    const { data: nb } = await supabaseAdmin.from('brands').insert({ agent_id: agent.id, name: brandName }).select('id').single();
    return nb?.id || null;
  };

  if (campaignId) {
    const { data: camp } = await supabaseAdmin
      .from('campaigns')
      .select('brand_id, client_id')
      .eq('id', campaignId)
      .eq('agent_id', agent.id)
      .maybeSingle();
    if (camp) {
      brandId = camp.brand_id || null;
      if (!clientId) clientId = camp.client_id || null;
    } else {
      campaignId = null; // not owned by this agent
    }
  } else if (newCampaignName) {
    brandId = await resolveBrandId();
    const { data: nc } = await supabaseAdmin
      .from('campaigns')
      .insert({ agent_id: agent.id, name: newCampaignName, brand_id: brandId, client_id: clientId })
      .select('id')
      .single();
    campaignId = nc?.id || null;
  }

  // 1) create the deal — or update it in place on an edit/resend
  const existingDealId = (b.deal_id as string | null) || null;
  let partnershipId: string;

  if (existingDealId) {
    await supabaseAdmin
      .from('partnerships')
      .update({
        account_id: accountId,
        brand_name: brandName,
        status: 'proposal',
        proposal_amount: totals.total,
        deliverables: deliverables.length ? deliverables : null,
        campaign_id: campaignId,
        client_id: clientId,
        brand_id: brandId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingDealId)
      .eq('agent_id', agent.id);
    // replace old line items + cancel the returned-for-edit signature
    await supabaseAdmin.from('deal_line_items').delete().eq('partnership_id', existingDealId);
    await supabaseAdmin
      .from('signature_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('partnership_id', existingDealId)
      .eq('status', 'pending');
    partnershipId = existingDealId;
  } else {
    const { data: partnership, error: pErr } = await supabaseAdmin
      .from('partnerships')
      .insert({
        account_id: accountId,
        agent_id: agent.id,
        brand_name: brandName,
        brand_contact_name: parsed?.contactPerson?.name || null,
        brand_contact_email: parsed?.contactPerson?.email || null,
        brand_contact_phone: parsed?.contactPerson?.phone || null,
        status: 'proposal',
        proposal_amount: totals.total,
        currency: 'ILS',
        brief: b.raw_text || null,
        deliverables: deliverables.length ? deliverables : null,
        campaign_id: campaignId,
        client_id: clientId,
        brand_id: brandId,
        proposal_date: new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .single();
    if (pErr || !partnership) return NextResponse.json({ error: pErr?.message || 'יצירת העסקה נכשלה' }, { status: 500 });
    partnershipId = partnership.id;
  }

  // 2) persist priced line items
  const rows = items.map((li, i) => ({
    partnership_id: partnershipId,
    account_id: accountId,
    platform: li?.platform || null,
    deliverable_type: li?.deliverable_type || null,
    qty: Math.max(1, Math.round(Number(li?.qty) || 1)),
    unit_price: Math.max(0, Number(li?.unit_price) || 0),
    vat_rate: li?.vat_rate == null ? 0.18 : Number(li.vat_rate),
    notes: li?.notes || null,
    sort_order: i,
  }));
  await supabaseAdmin.from('deal_line_items').insert(rows);

  // 3) issue the quote (PDF + signature) for this partnership
  let result;
  try {
    result = await issueQuote(partnershipId, {
      agentId: agent.id,
      accountId,
      brandName,
      clientName,
      campaignName,
      amount: totals.total,
      currency: 'ILS',
      deliverables,
      notes: b.raw_text || null,
      brandContactName: parsed?.contactPerson?.name || null,
      brandContactEmail: parsed?.contactPerson?.email || null,
      brandContactPhone: parsed?.contactPerson?.phone || null,
      agentName: agent.fullName,
      parsedData: parsed,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'הפקת ההצעה נכשלה' }, { status: 500 });
  }

  // 4) close the brief
  await supabaseAdmin
    .from('crm_inbound_messages')
    .update({
      deal_id: partnershipId,
      partnership_id: partnershipId,
      signature_request_id: result.signatureRequestId,
      suggested_account_id: accountId,
      brief_status: 'sent',
    })
    .eq('id', id);

  return NextResponse.json({ success: true, signUrl: result.signUrl, partnershipId, totals });
}
