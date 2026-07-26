/**
 * Nightly attribution refresh. Recomputes bestie_attribution for every
 * QuickShop-integrated account. Idempotent — a re-run overwrites in place.
 *
 * Auth: CRON_SECRET via Authorization: Bearer. Schedule: nightly (vercel.json).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { refreshAccountAttribution } from '@/lib/analytics/value-proof/refresh';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || (req.headers.get('authorization') || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .filter('config->integrations->quickshop->>enabled', 'eq', 'true');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const refreshed: any[] = [];
  const errors: { accountId: string; error: string }[] = [];
  for (const row of accounts || []) {
    const accountId = (row as any).id as string;
    try {
      refreshed.push({ accountId, ...(await refreshAccountAttribution(accountId)) });
    } catch (e) {
      errors.push({ accountId, error: (e as Error)?.message || 'unknown error' });
    }
  }
  return NextResponse.json({ ok: true, refreshed, errors });
}
