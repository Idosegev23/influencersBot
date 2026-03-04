/**
 * Re-embed all accounts with OpenAI embeddings — run locally with:
 *   npx tsx --tsconfig tsconfig.json scripts/re-embed-all.ts
 *
 * Requires .env.local with OPENAI_API_KEY + SUPABASE vars
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ---- Inline Supabase client (avoids path alias issues) ----
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ---- OpenAI client ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH = 100; // OpenAI limit per request
const MAX_TOKENS_PER_INPUT = 8191;

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH).map(t =>
      t.length > MAX_TOKENS_PER_INPUT * 4 ? t.substring(0, MAX_TOKENS_PER_INPUT * 4) : t
    );

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const embeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);

    all.push(...embeddings);
  }
  return all;
}

// ---- Main logic ----
async function reEmbedAccount(accountId: string) {
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('id, chunk_text')
    .eq('account_id', accountId)
    .order('id');

  if (error) {
    console.error(`  Failed to fetch chunks: ${error.message}`);
    return { updated: 0, errors: 1 };
  }

  if (!chunks || chunks.length === 0) {
    console.log(`  No chunks found, skipping`);
    return { updated: 0, errors: 0 };
  }

  console.log(`  Found ${chunks.length} chunks, generating OpenAI embeddings...`);

  let updated = 0;
  let errors = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.chunk_text || '');

    try {
      const embeddings = await generateEmbeddings(texts);

      for (let j = 0; j < batch.length; j++) {
        const { error: updateError } = await supabase
          .from('document_chunks')
          .update({ embedding: JSON.stringify(embeddings[j]) })
          .eq('id', batch[j].id);

        if (updateError) {
          console.error(`  Chunk ${batch[j].id}: ${updateError.message}`);
          errors++;
        } else {
          updated++;
        }
      }

      const progress = Math.min(i + BATCH_SIZE, chunks.length);
      console.log(`  ${progress}/${chunks.length} chunks updated`);

      // Small delay between batches
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err: any) {
      console.error(`  Batch ${i}-${i + BATCH_SIZE} failed: ${err.message}`);
      errors += batch.length;
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  return { updated, errors };
}

async function main() {
  console.log('Re-embedding all accounts with OpenAI text-embedding-3-small\n');

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config, status')
    .eq('status', 'active')
    .order('created_at');

  if (error || !accounts) {
    console.error('Failed to fetch accounts:', error?.message);
    process.exit(1);
  }

  console.log(`Found ${accounts.length} active accounts\n`);

  let totalUpdated = 0;
  let totalErrors = 0;

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const cfg = (acc.config || {}) as Record<string, any>;
    const name = cfg.display_name || cfg.username || acc.id;
    console.log(`[${i + 1}/${accounts.length}] ${name} (${acc.id})`);

    const { updated, errors } = await reEmbedAccount(acc.id);
    totalUpdated += updated;
    totalErrors += errors;

    console.log(`  Done: ${updated} updated, ${errors} errors\n`);
  }

  console.log('='.repeat(40));
  console.log(`Complete: ${totalUpdated} chunks re-embedded across ${accounts.length} accounts`);
  if (totalErrors > 0) {
    console.log(`${totalErrors} errors`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
