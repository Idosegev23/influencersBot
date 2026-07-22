/**
 * QuickShop order-sync cron.
 *
 * WHY: QuickShop API keys issued to us are `orders:read` only — there is no `webhooks:write`
 * scope, so we cannot register QuickShop order webhooks (see Task B7/B8 in
 * docs/superpowers/plans/2026-07-21-whatsapp-customer-service.md). Instead this periodic
 * server-side poll keeps `brand_orders` populated + fresh, which is what makes order-number
 * lookup work at all: QuickShop has no server-side `order_number` filter, so `lookupOrder`
 * (`src/lib/orders/lookup.ts`) resolves number→id via `brand_orders`, not a live QuickShop
 * query. Server-side means no customer PII leaves the app.
 *
 * Reuses `backfillAccountOrders` (Task B8, `src/lib/orders/backfill.ts`) — does NOT reimplement
 * the QuickShop paging/upsert. Each run is bounded to `MAX_PAGES_PER_ACCOUNT` pages (~500
 * most-recent orders): QuickShop's list() returns newest-first and `upsertBrandOrders` is
 * idempotent on (account_id, order_number), so a bounded, frequent sweep keeps recent + new +
 * recently-updated orders fresh without unbounded per-run cost.
 *
 * Scope: only accounts that are CS-enabled AND QuickShop-integrated AND configured to source
 * orders from QuickShop (config.whatsapp_cs.order_source === 'quickshop') are synced — this is
 * a server-side filter, not an in-memory one, so the query never touches unrelated accounts.
 *
 * A single account's failure (bad creds, QuickShop outage, etc.) is caught and reported in
 * `errors` — it never aborts the sweep for the remaining accounts.
 *
 * Auth: CRON_SECRET via `Authorization: Bearer` — mirrors the other CRON_SECRET-gated cron
 * routes in this repo (e.g. widget-events-drain, widget-rollup, analytics-rollup).
 * Schedule: every 10 minutes (vercel.json).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { backfillAccountOrders } from '@/lib/orders/backfill';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ~500 most-recent orders per account per run. list() is newest-first and the upsert is
// idempotent on (account_id, order_number), so bounding this keeps each run cheap and fast
// while still catching new + recently-updated orders on the next 10-minute tick.
const MAX_PAGES_PER_ACCOUNT = 10;

function verifyCron(req: NextRequest): boolean {
  return (req.headers.get('authorization') || '') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .filter('config->whatsapp_cs->>enabled', 'eq', 'true')
    .filter('config->integrations->quickshop->>enabled', 'eq', 'true')
    .filter('config->whatsapp_cs->>order_source', 'eq', 'quickshop');

  if (error) {
    console.error('[cron/quickshop-order-sync] account query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const synced: { accountId: string; imported: number; pages: number }[] = [];
  const errors: { accountId: string; error: string }[] = [];

  for (const row of accounts || []) {
    const accountId = (row as any).id as string;
    try {
      const { imported, pages } = await backfillAccountOrders(accountId, { maxPages: MAX_PAGES_PER_ACCOUNT });
      synced.push({ accountId, imported, pages });
    } catch (e) {
      const message = (e as Error)?.message || 'unknown error';
      console.error('[cron/quickshop-order-sync] backfill failed for', accountId, message);
      errors.push({ accountId, error: message });
    }
  }

  return NextResponse.json({ ok: true, accounts: (accounts || []).length, synced, errors });
}
