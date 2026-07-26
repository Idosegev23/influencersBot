/**
 * QuickShop abandoned-cart sync. Mirrors /api/cron/quickshop-order-sync, but
 * scoped to QuickShop-integrated accounts only — cart metrics do not require
 * WhatsApp CS to be enabled, unlike order lookup.
 *
 * Auth: CRON_SECRET via Authorization: Bearer.
 * Schedule: hourly (vercel.json) — carts move far slower than orders.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { backfillAccountCarts } from '@/lib/carts/backfill';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_PAGES_PER_ACCOUNT = 20; // ~2,000 most-recent carts per hourly run

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || (req.headers.get('authorization') || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .filter('config->integrations->quickshop->>enabled', 'eq', 'true');

  if (error) {
    console.error('[cron/quickshop-cart-sync] account query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const synced: { accountId: string; imported: number; pages: number }[] = [];
  const errors: { accountId: string; error: string }[] = [];

  for (const row of accounts || []) {
    const accountId = (row as any).id as string;
    try {
      synced.push({ accountId, ...(await backfillAccountCarts(accountId, { maxPages: MAX_PAGES_PER_ACCOUNT })) });
    } catch (e) {
      const message = (e as Error)?.message || 'unknown error';
      console.error('[cron/quickshop-cart-sync] failed for', accountId, message);
      errors.push({ accountId, error: message });
    }
  }

  return NextResponse.json({ ok: true, accounts: (accounts || []).length, synced, errors });
}
