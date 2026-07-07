/**
 * GET /api/agent/briefs/[id] — brief detail for the pricing screen:
 * parsed summary + suggested influencer + the agent's roster (selector) +
 * seed line items derived from the parsed deliverables (agent prices them).
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

function seedLineItems(parsed: any) {
  const rows: any[] = [];
  const d = parsed?.deliverables;
  if (Array.isArray(d)) {
    for (const x of d) {
      if (typeof x === 'string') {
        rows.push({ platform: '', deliverable_type: x, qty: 1, unit_price: 0, notes: '' });
      } else {
        rows.push({
          platform: x?.platform || '',
          deliverable_type: x?.type || x?.description || '',
          qty: Number(x?.quantity) > 0 ? Math.round(Number(x.quantity)) : 1,
          unit_price: 0,
          notes: [x?.description, x?.cadence].filter(Boolean).join(' · '),
        });
      }
    }
  }
  // Every special term / right becomes an unpriced row so nothing in the brief is dropped.
  const terms = parsed?.specialTerms;
  if (Array.isArray(terms)) {
    for (const t of terms) {
      if (t) rows.push({ platform: '', deliverable_type: String(t), qty: 1, unit_price: 0, notes: 'תנאי/זכות' });
    }
  }
  if (!rows.length) rows.push({ platform: '', deliverable_type: '', qty: 1, unit_price: 0, notes: '' });
  return rows;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;

  const { data: b } = await supabaseAdmin.from('crm_inbound_messages').select('*').eq('id', id).maybeSingle();
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (b.agent_id !== agent.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = (b.parsed_data as any) || {};

  const ids = agent.managedAccountIds || [];
  let roster: { id: string; name: string }[] = [];
  if (ids.length) {
    const { data: accts } = await supabaseAdmin.from('accounts').select('id, config').in('id', ids);
    roster = (accts || []).map((a: any) => ({ id: a.id, name: a.config?.display_name || a.config?.username || 'ללא שם' }));
  }

  // On an edit (deal already exists), seed from the saved line items + surface
  // the client's change request; otherwise seed from the parsed deliverables.
  let seed = seedLineItems(parsed);
  let editNotes: string | null = null;
  if (b.deal_id) {
    const { data: existing } = await supabaseAdmin
      .from('deal_line_items')
      .select('platform, deliverable_type, qty, unit_price, notes')
      .eq('partnership_id', b.deal_id)
      .order('sort_order', { ascending: true });
    if (existing && existing.length) {
      seed = existing.map((x: any) => ({
        platform: x.platform || '',
        deliverable_type: x.deliverable_type || '',
        qty: x.qty || 1,
        unit_price: Number(x.unit_price) || 0,
        notes: x.notes || '',
      }));
    }
    const { data: sig } = await supabaseAdmin
      .from('signature_requests')
      .select('edit_notes, returned_for_edit')
      .eq('partnership_id', b.deal_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    editNotes = sig?.returned_for_edit ? sig.edit_notes || null : null;
  }

  return NextResponse.json({
    brief: {
      id: b.id,
      brand_name: parsed.brandName || b.subject || 'מותג',
      campaign_name: parsed.campaignName || null,
      amount: typeof parsed.totalAmount === 'number' ? parsed.totalAmount : null,
      raw_text: b.raw_text || null,
      suggested_account_id: b.suggested_account_id,
      status: b.brief_status,
      deal_id: b.deal_id,
      edit_notes: editNotes,
      brand_contact_name: parsed?.contactPerson?.name || null,
      brand_contact_email: parsed?.contactPerson?.email || null,
      brand_contact_phone: parsed?.contactPerson?.phone || null,
    },
    roster,
    seed_line_items: seed,
  });
}

/** DELETE — dismiss a brief from the inbox (soft delete). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;

  const { data: b } = await supabaseAdmin.from('crm_inbound_messages').select('id, agent_id').eq('id', id).maybeSingle();
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (b.agent_id !== agent.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  await supabaseAdmin.from('crm_inbound_messages').update({ brief_status: 'dismissed' }).eq('id', id);
  return NextResponse.json({ success: true });
}
