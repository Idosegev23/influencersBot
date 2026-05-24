/**
 * Backfill Gemini Embedding 2 (3072-dim) into document_chunks.embedding_gemini
 * for the LDRS account ONLY. Used by the internal /internal/ab/<token> A/B page.
 *
 * Safe to re-run — skips rows whose embedding_gemini is already populated.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-gemini-embeddings-ldrs.ts [--force]
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';
const MODEL = 'gemini-embedding-2';
const DIMS = 3072;
const BATCH_SIZE = 50;       // gemini-embedding-2 accepts batches; keep modest for rate limits
const SLEEP_MS_BETWEEN = 750; // be gentle with quota

const FORCE = process.argv.includes('--force');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await gemini.models.embedContent({
    model: MODEL,
    contents: texts,
    config: { outputDimensionality: DIMS },
  } as any);
  const embeddings = (res.embeddings || []).map((e: any) => e.values as number[]);
  if (embeddings.length !== texts.length) {
    throw new Error(`Gemini returned ${embeddings.length} embeddings for ${texts.length} inputs`);
  }
  return embeddings;
}

async function main() {
  console.log('Backfilling Gemini Embedding 2 for LDRS chunks...');
  console.log(`  model=${MODEL} dim=${DIMS} batch=${BATCH_SIZE} force=${FORCE}`);

  // Fetch chunks needing embedding — paginate past Supabase's 1000-row default cap
  const PAGE = 1000;
  const chunks: { id: string; chunk_text: string }[] = [];
  let offset = 0;
  while (true) {
    let q = supabase
      .from('document_chunks')
      .select('id, chunk_text')
      .eq('account_id', LDRS_ACCOUNT_ID)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (!FORCE) q = q.is('embedding_gemini', null);
    const { data, error } = await q;
    if (error) {
      console.error('Failed to fetch chunks:', error);
      process.exit(1);
    }
    if (!data?.length) break;
    chunks.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (chunks.length === 0) {
    console.log('Nothing to backfill — all LDRS chunks already have a Gemini embedding.');
    return;
  }

  console.log(`Found ${chunks.length} chunks to embed.`);

  let processed = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => (c.chunk_text || '').slice(0, 30_000));

    try {
      const embeddings = await embedBatch(texts);

      // Update each row with its embedding
      for (let j = 0; j < batch.length; j++) {
        const { error: upErr } = await supabase
          .from('document_chunks')
          .update({ embedding_gemini: JSON.stringify(embeddings[j]) })
          .eq('id', batch[j].id);
        if (upErr) {
          console.warn(`  ⚠️  Update failed for ${batch[j].id}: ${upErr.message}`);
          failed++;
        } else {
          processed++;
        }
      }

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const pct = ((processed + failed) / chunks.length * 100).toFixed(1);
      console.log(`  [${pct}%] ${processed} embedded, ${failed} failed — ${elapsed}s elapsed`);
    } catch (err: any) {
      console.error(`  ❌ Batch ${i / BATCH_SIZE} failed: ${err.message}`);
      failed += batch.length;
    }

    if (i + BATCH_SIZE < chunks.length) await sleep(SLEEP_MS_BETWEEN);
  }

  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone. ${processed} embedded, ${failed} failed in ${totalSec}s.`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
