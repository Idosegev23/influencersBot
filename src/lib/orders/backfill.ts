// One-off QuickShop backfill: paginate GET /orders summaries into brand_orders (spec §7.3).
// Line items are NOT backfilled (lazy-filled on live pull). Rate limit honored by the adapter's list().
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getConnector } from './connectors/registry';
import './connectors/quickshop';
import { upsertBrandOrders } from './brand-orders';
import type { OrderConnectorCreds } from './connectors/types';

const INTER_PAGE_DELAY_MS = 200; // gentle guard on top of the adapter's X-RateLimit-* backoff

export async function backfillAccountOrders(
  accountId: string,
  opts: { maxPages?: number } = {},
): Promise<{ imported: number; pages: number }> {
  const { data, error } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).single();
  if (error || !data) throw new Error(`account not found: ${accountId}`);
  const qs = ((data as any).config?.integrations?.quickshop) || null;
  if (!qs?.api_key) throw new Error('quickshop integration not configured (missing api_key)');

  const creds: OrderConnectorCreds = { platform: 'quickshop', apiKey: qs.api_key, webhookSecret: qs.webhook_secret };
  const connector = getConnector('quickshop');
  if (!connector.list) throw new Error('quickshop connector has no list()');

  const maxPages = opts.maxPages ?? Infinity;
  let cursor: string | undefined = undefined;
  let imported = 0;
  let pages = 0;

  do {
    const { orders, next } = await connector.list(creds, cursor);
    imported += await upsertBrandOrders(accountId, orders, 'quickshop');
    pages += 1;
    cursor = next;
    if (cursor && pages < maxPages) await new Promise((r) => setTimeout(r, INTER_PAGE_DELAY_MS));
  } while (cursor && pages < maxPages);

  return { imported, pages };
}
