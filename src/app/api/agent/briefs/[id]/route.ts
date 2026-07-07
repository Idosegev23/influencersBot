/**
 * GET /api/agent/briefs/[id] — brief detail for the pricing screen:
 * parsed summary + suggested influencer + the agent's roster (selector) +
 * seed line items derived from the parsed deliverables (agent prices them).
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

function seedLineItems(parsed: any) {
  const d = parsed?.deliverables;
  if (!Array.isArray(d) || !d.length) {
    return [{ platform: '', deliverable_type: '', qty: 1, unit_price: 0, notes: '' }];
  }
  return d.map((x: any) =>
    typeof x === 'string'
      ? { platform: '', deliverable_type: x, qty: 1, unit_price: 0, notes: '' }
      : {
          platform: x?.platform || '',
          deliverable_type: x?.type || x?.description || '',
          qty: Number(x?.quantity) > 0 ? Math.round(Number(x.quantity)) : 1,
          unit_price: 0,
          notes: x?.description || '',
        }
  );
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
      brand_contact_name: parsed?.contactPerson?.name || null,
      brand_contact_email: parsed?.contactPerson?.email || null,
      brand_contact_phone: parsed?.contactPerson?.phone || null,
    },
    roster,
    seed_line_items: seedLineItems(parsed),
  });
}
