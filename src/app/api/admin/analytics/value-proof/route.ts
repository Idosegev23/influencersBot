/**
 * GET /api/admin/analytics/value-proof?accountId=xxx&days=30
 *
 * All 10 value-proof metrics for the admin analytics "הוכחת ערך" tab. Reads the
 * value_proof_summary RPC (aggregated in Postgres — PostgREST truncates a row
 * fetch at 1000, which would silently cut 26K orders) and wraps it in the
 * measured/lowConfidence envelope.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { buildValueProof } from '@/lib/analytics/value-proof/metrics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 3650);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const until = new Date().toISOString();

  const supabase = await createClient();

  const { data: account } = await supabase.from('accounts').select('config').eq('id', accountId).maybeSingle();
  const costPerTicket = Number((account as any)?.config?.support?.cost_per_ticket) || null;

  const { data: raw, error } = await supabase.rpc('value_proof_summary', {
    p_account_id: accountId, p_since: since, p_until: until,
  });
  if (error) {
    console.error('[admin/analytics/value-proof] rpc error:', error.message);
    return NextResponse.json({ error: 'aggregation_failed' }, { status: 500 });
  }

  return NextResponse.json({
    brand: {
      name: (account as any)?.config?.brandName || (account as any)?.config?.name || (account as any)?.config?.username || '',
      username: (account as any)?.config?.username || '',
      logo: (account as any)?.config?.profilePic || (account as any)?.config?.custom_logo_url || null,
      primaryColor: (account as any)?.config?.widget?.primaryColor || (account as any)?.config?.primaryColor || null,
    },
    ...buildValueProof(raw, { audience: 'admin', costPerTicket }),
  });
}
