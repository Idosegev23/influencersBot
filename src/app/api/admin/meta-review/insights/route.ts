import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { callGraph, GRAPH_BASE } from '@/lib/meta-review/graph';

// instagram_business_manage_insights — account insights + follower demographics.
// Each metric group is fetched independently; a partial failure (e.g. demographics
// needs 100+ followers) is surfaced in the response, not fatal. Showing real,
// sometimes-partial data further proves the call is live.
export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  // NOTE: profile_views was removed from IG insights in v21+/v22 — including it makes
  // Graph reject the ENTIRE request (#100), blanking every metric. Keep only metrics
  // that support metric_type=total_value on graph.instagram.com.
  const account = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me/insights?metric=reach,accounts_engaged,total_interactions&period=day&metric_type=total_value`,
    accessToken: conn.accessToken,
  });
  const demographics = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&timeframe=this_month&breakdown=city`,
    accessToken: conn.accessToken,
  });

  return NextResponse.json({
    requests: [account.request, demographics.request],
    response: { account: account.response, demographics: demographics.response },
    // Whole call is "ok" if the primary account insights returned; demographics is best-effort.
    ok: account.ok,
  });
}
