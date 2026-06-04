// scripts/purge-coupon-chunks.ts
// One-time: remove every entity_type='coupon' document_chunk + parent document.
// Coupons are no longer RAG content (see src/lib/rag/ingest.ts) — they are read
// live from the coupons table at chat time, date-filtered. Run with --all or an
// account id:
//   npx tsx scripts/purge-coupon-chunks.ts --all [--dry-run]
//   npx tsx scripts/purge-coupon-chunks.ts <account_id> [--dry-run]
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const accountId = args.find(a => !a.startsWith('--'));
  if (!all && !accountId) {
    console.error('Usage: purge-coupon-chunks.ts (--all | <account_id>) [--dry-run]');
    process.exit(1);
  }

  let chunkQuery = supabase
    .from('document_chunks')
    .select('id, document_id', { count: 'exact' })
    .eq('entity_type', 'coupon');
  if (!all) chunkQuery = chunkQuery.eq('account_id', accountId!);
  const { data: chunks, count } = await chunkQuery;
  const docIds = [...new Set((chunks || []).map(c => c.document_id).filter(Boolean))];
  console.log(`Found ${count ?? chunks?.length ?? 0} coupon chunks across ${docIds.length} documents${all ? ' (ALL accounts)' : ` for ${accountId}`}.`);

  if (dryRun) { console.log('Dry run — nothing deleted.'); return; }

  let delChunks = supabase.from('document_chunks').delete().eq('entity_type', 'coupon');
  if (!all) delChunks = delChunks.eq('account_id', accountId!);
  const { error: e1 } = await delChunks;
  if (e1) throw e1;

  if (docIds.length > 0) {
    const { error: e2 } = await supabase.from('documents').delete().eq('entity_type', 'coupon').in('id', docIds);
    if (e2) throw e2;
  }
  console.log('✅ Purged coupon chunks + documents.');
}

main().catch(e => { console.error(e); process.exit(1); });
