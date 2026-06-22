/**
 * GET /api/agent/partnerships — the agent's deals (active partnerships) with
 * client name + latest invoice + signature status, for the deals list + dashboard.
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const { data: parts } = await supabaseAdmin
    .from('partnerships')
    .select('id, brand_name, status, proposal_amount, contract_amount, currency, account_id, activity_completed_at, contract_signed_date, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false });

  const list = parts || [];
  const ids = list.map((p) => p.id);
  const accountIds = Array.from(new Set(list.map((p) => p.account_id).filter(Boolean)));

  const [{ data: invs }, { data: sigs }, { data: accts }] = await Promise.all([
    ids.length
      ? supabaseAdmin.from('invoices').select('partnership_id, status, due_date, paid_at, total_amount, payment_route, upload_token').in('partnership_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? supabaseAdmin.from('signature_requests').select('partnership_id, status, token').in('partnership_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    accountIds.length
      ? supabaseAdmin.from('accounts').select('id, config').in('id', accountIds as string[])
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const invByP: Record<string, any> = {};
  for (const i of invs || []) invByP[i.partnership_id] = i;
  const sigByP: Record<string, any> = {};
  for (const s of sigs || []) sigByP[s.partnership_id] = s;
  const nameById: Record<string, string> = {};
  for (const a of accts || []) nameById[a.id] = (a.config as any)?.display_name || (a.config as any)?.username || '';

  return NextResponse.json({
    deals: list.map((p) => ({
      ...p,
      client_name: p.account_id ? nameById[p.account_id] || null : null,
      invoice: invByP[p.id] || null,
      signature: sigByP[p.id] || null,
    })),
  });
}
