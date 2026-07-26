#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * One-off / re-runnable attribution refresh.
 *
 *   npx tsx scripts/refresh-attribution.ts <accountId> [<accountId> ...]
 *
 * Uses the same refreshAccountAttribution() the nightly cron uses.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { refreshAccountAttribution } from '@/lib/analytics/value-proof/refresh';

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('usage: refresh-attribution.ts <accountId> [<accountId> ...]');
    process.exit(1);
  }
  for (const id of ids) {
    const started = Date.now();
    const out = await refreshAccountAttribution(id);
    console.log(`${id}: ${out.orders} orders, ${out.carts} carts, tiers=${JSON.stringify(out.tiers)} in ${Math.round((Date.now() - started) / 1000)}s`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
