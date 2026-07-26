/**
 * Pages QuickShop's abandoned-cart list into brand_abandoned_carts.
 * Unbounded by default (first run imports the full history — ~80 pages for
 * Argania's 7,993 carts); the cron passes a bound for routine sweeps.
 */
import { supabase } from '@/lib/supabase';
import { listAbandonedCarts } from '@/lib/orders/connectors/quickshop';
import { upsertBrandCarts } from '@/lib/carts/brand-carts';

const HARD_PAGE_CAP = 500; // runaway backstop, not a business limit

export async function backfillAccountCarts(
  accountId: string,
  opts: { maxPages?: number } = {}
): Promise<{ imported: number; pages: number }> {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new Error(`account load failed: ${error.message}`);

  const qs = (account as any)?.config?.integrations?.quickshop;
  if (!qs?.enabled || !qs?.api_key) throw new Error('quickshop not configured for account');

  const cap = Math.min(opts.maxPages ?? HARD_PAGE_CAP, HARD_PAGE_CAP);
  let cursor: string | undefined;
  let imported = 0;
  let pages = 0;

  while (pages < cap) {
    const { carts, next } = await listAbandonedCarts({ platform: 'quickshop', apiKey: qs.api_key } as any, cursor);
    pages += 1;
    imported += await upsertBrandCarts(accountId, carts);
    if (!next) break;
    cursor = next;
  }

  // A bounded run that stopped early is not a complete history — say so rather
  // than let the caller assume full coverage.
  if (pages >= cap) console.warn('[carts/backfill] page cap reached for', accountId, 'pages:', pages);

  return { imported, pages };
}
