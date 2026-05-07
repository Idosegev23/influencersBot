/**
 * Daily Search Console fetch. Iterates analytics_provisioning rows that
 * have gsc_site_url set, calls GSC API, upserts top queries to
 * gsc_query_daily. Updates gsc_status + gsc_last_fetch on each row.
 *
 * Schedule: daily 04:00 UTC.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchGscForAccount } from '@/lib/analytics/gsc';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') || '';
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const { data: provisioned, error } = await supabase
    .from('analytics_provisioning')
    .select('account_id, gsc_site_url')
    .not('gsc_site_url', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ accountId: string; status: string; fetched: number; error?: string }> = [];
  for (const row of provisioned || []) {
    const result = await fetchGscForAccount({
      accountId: row.account_id,
      siteUrl: row.gsc_site_url!,
    });

    const newStatus =
      result.status === 'ok'
        ? 'connected'
        : result.status === 'permission_denied'
        ? 'permission_denied'
        : result.status === 'auth_failed'
        ? 'auth_failed'
        : 'error';

    await supabase
      .from('analytics_provisioning')
      .update({
        gsc_status: newStatus,
        gsc_last_fetch: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', row.account_id);

    results.push({
      accountId: row.account_id,
      status: result.status,
      fetched: result.fetched,
      error: result.error,
    });
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - startedAt,
    accounts_processed: results.length,
    results,
  });
}
