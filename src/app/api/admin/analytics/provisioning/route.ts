/**
 * Admin endpoint to read + update analytics_provisioning config for one
 * account. Used by the analytics-setup admin page to wire Search Console.
 *
 * GET ?accountId=xxx        → current row
 * PUT { accountId, gscSiteUrl } → upsert site URL, status='pending' until cron verifies
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth();
  if (auth) return auth;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('analytics_provisioning')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ provisioning: data || null });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdminAuth();
  if (auth) return auth;

  const body = await req.json().catch(() => ({}));
  const { accountId, gscSiteUrl } = body || {};
  if (typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }
  if (gscSiteUrl != null && typeof gscSiteUrl !== 'string') {
    return NextResponse.json({ error: 'gscSiteUrl must be string' }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    gsc_site_url: gscSiteUrl ? gscSiteUrl.trim() : null,
    gsc_status: gscSiteUrl ? 'pending' : 'disabled',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('analytics_provisioning')
    .upsert({ account_id: accountId, ...update }, { onConflict: 'account_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
