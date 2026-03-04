/**
 * Re-embed all accounts — run locally with:
 *   npx tsx --tsconfig tsconfig.json scripts/re-embed-all.ts
 *
 * Requires .env.local with GEMINI_API_KEY + SUPABASE vars
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

// ---- Inline Supabase client (avoids path alias issues) ----
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ---- Inline Gemini client ----
import { GoogleGenAI } from '@google/genai';

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH = 100;
const MAX_CHARS = 8000 * 4;

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH).map(t =>
      t.length > MAX_CHARS ? t.substring(0, MAX_CHARS) : t
    );

    const response = await gemini.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch.map(t => ({ parts: [{ text: t }] })),
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });

    const embeddings = (response as any).embeddings
      ? (response as any).embeddings.map((e: any) => e.values)
      : [(response as any).embedding?.values];

    all.push(...embeddings);
  }
  return all;
}

// ---- Main logic ----
async function reEmbedAccount(accountId: string, accountName: string) {
  // Get all chunks for this account
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('id, chunk_text')
    .eq('account_id', accountId)
    .order('id');

  if (error) {
    console.error(`  ❌ Failed to fetch chunks: ${error.message}`);
    return { updated: 0, errors: 1 };
  }

  if (!chunks || chunks.length === 0) {
    console.log(`  ⏭️  No chunks found, skipping`);
    return { updated: 0, errors: 0 };
  }

  console.log(`  📦 Found ${chunks.length} chunks, generating embeddings...`);

  let updated = 0;
  let errors = 0;
  const BATCH_SIZE = 50; // Gemini rate-friendly batches

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.chunk_text || '');

    try {
      const embeddings = await generateEmbeddings(texts);

      // Update each chunk with new embedding
      for (let j = 0; j < batch.length; j++) {
        const { error: updateError } = await supabase
          .from('document_chunks')
          .update({ embedding: JSON.stringify(embeddings[j]) })
          .eq('id', batch[j].id);

        if (updateError) {
          console.error(`  ❌ Chunk ${batch[j].id}: ${updateError.message}`);
          errors++;
        } else {
          updated++;
        }
      }

      const progress = Math.min(i + BATCH_SIZE, chunks.length);
      console.log(`  ✅ ${progress}/${chunks.length} chunks updated`);

      // Small delay to respect rate limits (100 RPM free tier)
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(r => setTimeout(r, 700));
      }
    } catch (err: any) {
      console.error(`  ❌ Batch ${i}-${i + BATCH_SIZE} failed: ${err.message}`);
      errors += batch.length;

      // Wait longer on error (likely rate limit)
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  return { updated, errors };
}

async function main() {
  console.log('🔄 Re-embedding all accounts with Gemini embeddings\n');

  // Get all active accounts (username is in config JSONB, not a column)
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

    const { updated, errors } = await reEmbedAccount(acc.id, name);
    totalUpdated += updated;
    totalErrors += errors;

    console.log(`  Done: ${updated} updated, ${errors} errors\n`);
  }

  console.log('═══════════════════════════════════');
  console.log(`✅ Complete: ${totalUpdated} chunks re-embedded across ${accounts.length} accounts`);
  if (totalErrors > 0) {
    console.log(`⚠️  ${totalErrors} errors`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
