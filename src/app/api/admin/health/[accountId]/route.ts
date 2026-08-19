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

  const [originsRes, errorsRes] = await Promise.all([
    supabase
      .from('install_pings')
      .select('origin, last_seen_at, active_minutes, sample_path, widget_version')
      .eq('account_id', accountId)
      .gte('day', since.slice(0, 10))
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
  ]);

  const pings = originsRes.data || [];
  const versions = Object.entries(
    pings.reduce((acc: Record<string, number>, p: any) => {
      const v = p.widget_version || 'unknown';
      acc[v] = (acc[v] || 0) + (p.active_minutes || 0);
      return acc;
    }, {}),
  ).map(([version, loads]) => ({ version, loads }));

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
