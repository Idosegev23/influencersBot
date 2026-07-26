#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * One-off / re-runnable abandoned-cart backfill.
 *
 *   npx tsx scripts/backfill-carts.ts <accountId> [<accountId> ...]
 *
 * Uses the same backfillAccountCarts() the hourly cron uses — no separate
 * import path that could drift from production behaviour.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { backfillAccountCarts } from '@/lib/carts/backfill';

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('usage: backfill-carts.ts <accountId> [<accountId> ...]');
    process.exit(1);
  }
  for (const id of ids) {
    const started = Date.now();
    const { imported, pages } = await backfillAccountCarts(id);
    console.log(`${id}: imported ${imported} carts over ${pages} pages in ${Math.round((Date.now() - started) / 1000)}s`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
