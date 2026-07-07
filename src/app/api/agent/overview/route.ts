/**
 * GET /api/agent/overview — month-close overview: sales + commission summary,
 * and deals bucketed into 4 tables (multi/single-month × signed/not-signed),
 * with per-deal cross-cut names (talent / campaign / client).
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { classifyProjectType, statusBucket, commissionOf } from '@/lib/crm/overview';

export async function GET() {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const { data: parts } = await supabaseAdmin
    .from('partnerships')
    .select('id, brand_name, status, proposal_amount, contract_amount, currency, account_id, campaign_id, client_id, project_type, commission_pct, moved_to_month, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false });

  const deals = parts || [];
  const ids = deals.map((d) => d.id);
  const accountIds = Array.from(new Set(deals.map((d) => d.account_id).filter(Boolean)));
  const campaignIds = Array.from(new Set(deals.map((d) => d.campaign_id).filter(Boolean)));
  const clientIds = Array.from(new Set(deals.map((d) => d.client_id).filter(Boolean)));

  const [{ data: lineItems }, { data: accts }, { data: camps }, { data: clis }, { data: agentRow }] = await Promise.all([
    ids.length ? supabaseAdmin.from('deal_line_items').select('partnership_id, notes, deliverable_type').in('partnership_id', ids) : Promise.resolve({ data: [] as any[] }),
    accountIds.length ? supabaseAdmin.from('accounts').select('id, config').in('id', accountIds as string[]) : Promise.resolve({ data: [] as any[] }),
    campaignIds.length ? supabaseAdmin.from('campaigns').select('id, name').in('id', campaignIds as string[]) : Promise.resolve({ data: [] as any[] }),
    clientIds.length ? supabaseAdmin.from('clients').select('id, name').in('id', clientIds as string[]) : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin.from('users').select('agency').eq('id', agent.id).maybeSingle(),
  ]);

  const liByDeal: Record<string, any[]> = {};
  for (const li of lineItems || []) (liByDeal[li.partnership_id] ||= []).push(li);
  const talentName: Record<string, string> = {};
  for (const a of accts || []) talentName[a.id] = (a.config as any)?.display_name || (a.config as any)?.username || '—';
  const campName: Record<string, string> = {};
  for (const c of camps || []) campName[c.id] = c.name;
  const cliName: Record<string, string> = {};
  for (const c of clis || []) cliName[c.id] = c.name;
  const defaultPct = Number((agentRow?.agency as any)?.commission_pct) || 0;

  const rows = deals.map((d) => {
    const amount = Number(d.contract_amount ?? d.proposal_amount ?? 0);
    const pct = d.commission_pct != null ? Number(d.commission_pct) : defaultPct;
    return {
      id: d.id,
      brand_name: d.brand_name,
      campaign_name: d.campaign_id ? campName[d.campaign_id] || null : null,
      talent_name: d.account_id ? talentName[d.account_id] || null : null,
      client_name: d.client_id ? cliName[d.client_id] || null : null,
      amount,
      commission: commissionOf(amount, pct),
      commission_pct: pct,
      currency: d.currency || 'ILS',
      project_type: classifyProjectType(d, liByDeal[d.id] || []),
      bucket: statusBucket(d),
      moved_to_month: d.moved_to_month || null,
    };
  });

  const signed = rows.filter((r) => r.bucket === 'signed');
  const multi = rows.filter((r) => r.project_type === 'multi_month');
  const single = rows.filter((r) => r.project_type === 'single_month');

  return NextResponse.json({
    summary: {
      sales_total: signed.reduce((s, r) => s + r.amount, 0),
      commission_total: signed.reduce((s, r) => s + r.commission, 0),
      signed_count: signed.length,
      open_count: rows.filter((r) => r.bucket === 'open').length,
      default_commission_pct: defaultPct,
    },
    tables: {
      multi_not_signed: multi.filter((r) => r.bucket !== 'signed'),
      multi_signed: multi.filter((r) => r.bucket === 'signed'),
      single_not_signed: single.filter((r) => r.bucket !== 'signed'),
      single_signed: single.filter((r) => r.bucket === 'signed'),
    },
  });
}
