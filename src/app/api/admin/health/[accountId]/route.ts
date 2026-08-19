/**
 * Per-account drill-down: which origins and paths we actually run on, the
 * script-version breakdown, and the most recent client errors.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;
  const { accountId } = await params;

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const sinceDay = since.slice(0, 10);

  // Origins: a display list, so .limit(100) here is fine and intentional
  // (Ruling R16). The version breakdown below is NOT a display list — it's an
  // aggregate over the same table — so it goes through a Postgres RPC with no
  // row cap instead of being reduce()'d over this bounded fetch. install_pings
  // is one row per account per ORIGIN per DAY: a 30-day window already costs
  // ~90 rows for a 3-origin account, and .limit(100) ordered last_seen_at desc
  // would silently drop the OLDEST rows first — exactly where a stale
  // widget_version would show up.
  const [originsRes, errorsRes, versionsRes] = await Promise.all([
    supabase
      .from('install_pings')
      .select('origin, last_seen_at, active_minutes, sample_path')
      .eq('account_id', accountId)
      .gte('day', sinceDay)
      .order('last_seen_at', { ascending: false })
      .limit(100),
    supabase
      .from('widget_events')
      .select('type, payload, created_at')
      .eq('account_id', accountId)
      .in('type', ['client_error', 'config_load_failed', 'csp_blocked'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.rpc('account_install_versions', { p_account_id: accountId, p_since: sinceDay }),
  ]);

  const pings = originsRes.data || [];
  if (versionsRes.error) {
    console.error('[admin/health/:accountId] version rpc error:', versionsRes.error.message);
  }
  const versions = ((versionsRes.data || []) as Array<{ version: string; loads: number }>).map((v) => ({
    version: v.version,
    loads: Number(v.loads) || 0,
  }));

  return NextResponse.json({
    origins: pings.map((p: any) => ({
      origin: p.origin,
      lastSeen: p.last_seen_at,
      activeMinutes: p.active_minutes,
      samplePath: p.sample_path,
    })),
    versions,
    errors: (errorsRes.data || []).map((e: any) => ({
      type: e.type,
      message: e.payload?.message || '',
      stack: e.payload?.stack || null,
      at: e.created_at,
    })),
  });
}
