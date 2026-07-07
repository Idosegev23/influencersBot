/**
 * GET /api/agent/briefs — the agent's open briefs (forwarded inbound not yet
 * priced+sent). Each brief carries the parsed brand/amount + a suggested
 * influencer for the agent to confirm.
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const { data: briefs } = await supabaseAdmin
    .from('crm_inbound_messages')
    .select('id, channel, subject, raw_text, parsed_data, suggested_account_id, brief_status, deal_id, created_at')
    .eq('agent_id', agent.id)
    .in('brief_status', ['new', 'assigned'])
    .order('created_at', { ascending: false });

  const list = briefs || [];
  const acctIds = Array.from(new Set(list.map((b) => b.suggested_account_id).filter(Boolean)));
  let nameById: Record<string, string> = {};
  if (acctIds.length) {
    const { data: accts } = await supabaseAdmin.from('accounts').select('id, config').in('id', acctIds as string[]);
    nameById = Object.fromEntries((accts || []).map((a: any) => [a.id, a.config?.display_name || a.config?.username || '']));
  }

  return NextResponse.json({
    briefs: list.map((b) => {
      const parsed = (b.parsed_data as any) || {};
      return {
        id: b.id,
        channel: b.channel,
        brand_name: parsed.brandName || b.subject || 'מותג',
        amount: typeof parsed.totalAmount === 'number' ? parsed.totalAmount : null,
        suggested_account_id: b.suggested_account_id,
        suggested_client_name: b.suggested_account_id ? nameById[b.suggested_account_id] || null : null,
        status: b.brief_status,
        created_at: b.created_at,
      };
    }),
  });
}
