/**
 * Admin health board. One row per paying customer, one chip per SOLD channel.
 * Sorted worst-first by the account's most severe channel — the whole point of
 * the screen is that the accounts needing a phone call are at the top.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

// Worst first. Mirrors the precedence in src/lib/health/status.ts.
const SEVERITY: Record<string, number> = {
  never_installed: 0, silent: 1, erroring: 2, dormant: 3, live: 4,
};

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '14', 10) || 14, 90);
  const { data, error } = await supabase.rpc('admin_health_board', { p_days: days });
  if (error) {
    console.error('[admin/health] rpc error:', error.message);
    return NextResponse.json({ error: 'aggregation_failed' }, { status: 500 });
  }

  const rows = ((data || []) as any[]).map((r) => ({
    accountId: r.account_id,
    name: r.name,
    contractEnd: r.contractEnd ?? null,
    trialEnd: r.trialEnd ?? null,
    owner: r.owner ?? null,
    channels: r.channels || [],
  }));

  const worst = (r: any) => Math.min(
    ...[...(r.channels || []).map((c: any) => SEVERITY[c.status] ?? 9), 9],
  );
  rows.sort((a, b) => worst(a) - worst(b) || a.name.localeCompare(b.name, 'he'));

  return NextResponse.json({ rows });
}
