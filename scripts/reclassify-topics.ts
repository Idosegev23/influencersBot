/**
 * Re-run topic classification for one account.
 *
 * Needed because `classifyChunkTopics` only touches chunks whose `topic` IS NULL,
 * so an account classified by the old (silently-falling-back) classifier keeps its
 * wrong topics forever. This clears them first.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/reclassify-topics.ts <accountId> [--dry]
 */
import { createClient } from '@supabase/supabase-js';
import { classifyChunkTopics } from '@/lib/rag/enrich';

async function main() {
  const accountId = process.argv[2];
  const dry = process.argv.includes('--dry');
  if (!accountId) {
    console.error('usage: reclassify-topics.ts <accountId> [--dry]');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  );

  const { data: before } = await supabase
    .from('document_chunks')
    .select('topic')
    .eq('account_id', accountId);
  const beforeCounts: Record<string, number> = {};
  for (const r of before || []) beforeCounts[(r as any).topic ?? 'NULL'] = (beforeCounts[(r as any).topic ?? 'NULL'] || 0) + 1;
  console.log('BEFORE:', beforeCounts);

  if (dry) return;

  const { error: clearErr } = await supabase
    .from('document_chunks')
    .update({ topic: null })
    .eq('account_id', accountId);
  if (clearErr) throw new Error(`clear failed: ${clearErr.message}`);
  console.log('cleared topics; reclassifying…');

  const n = await classifyChunkTopics(supabase as any, accountId);
  console.log(`classified ${n} chunks`);

  const { data: after } = await supabase
    .from('document_chunks')
    .select('topic')
    .eq('account_id', accountId);
  const afterCounts: Record<string, number> = {};
  for (const r of after || []) afterCounts[(r as any).topic ?? 'NULL'] = (afterCounts[(r as any).topic ?? 'NULL'] || 0) + 1;
  console.log('AFTER:', afterCounts);
}

main().catch((e) => { console.error(e); process.exit(1); });
