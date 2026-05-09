#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * One-off: finish Step 2 for footlocker without re-ingesting website RAG
 * (the 61K website chunks are already in DB from deep-scrape).
 *
 * Does:
 *   1. ingestAllForAccount with entityTypes EXCLUDING 'website'
 *   2. preprocessInstagramData → preprocessing_data
 *   3. buildPersonaWithGemini → initial persona
 *   4. savePersonaToDatabase → persist
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';

const ACCOUNT_ID = 'a610c713-0a17-47aa-a926-0e96d3d49b5a';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  console.log('═══ Finish Footlocker Step 2 (skip website RAG re-ingest) ═══\n');

  // ── 1. RAG ingestion for IG only (no website) ──
  console.log('🔍 [1/3] Ingesting IG content to RAG (post + transcription + partnership + coupon + knowledge_base + document)...');
  const { ingestAllForAccount } = await import('../src/lib/rag/ingest');
  const ragResult = await ingestAllForAccount(ACCOUNT_ID, {
    entityTypes: ['post', 'transcription', 'partnership', 'coupon', 'knowledge_base', 'document'],
  });
  console.log(`   ✅ Ingested ${ragResult.total} chunks. byType:`, ragResult.byType);
  if (ragResult.errors.length) console.log(`   ⚠️ errors:`, ragResult.errors);

  // ── 2. Preprocessing ──
  console.log('\n🔄 [2/3] Preprocessing Instagram data...');
  const { preprocessInstagramData } = await import('../src/lib/scraping/preprocessing');
  const preprocessed = await preprocessInstagramData(ACCOUNT_ID);
  console.log(`   ✅ Preprocessing complete: posts/transcriptions/topics counted`);

  // ── 3. Build & save persona ──
  console.log('\n🎭 [3/3] Building persona with GPT-5.4 + saving...');
  const { buildPersonaWithGemini, savePersonaToDatabase } = await import('../src/lib/ai/gemini-persona-builder');

  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', ACCOUNT_ID)
    .single();

  const profileData = account?.config ? {
    username: (account.config as any).username,
    full_name: (account.config as any).display_name || (account.config as any).username,
    bio: (account.config as any).bio,
    followers_count: (account.config as any).followers_count,
    category: (account.config as any).category,
  } : undefined;

  const persona = await buildPersonaWithGemini(preprocessed, profileData);

  await savePersonaToDatabase(
    supabase,
    ACCOUNT_ID,
    persona,
    preprocessed,
    JSON.stringify(persona)
  );

  console.log(`\n✅ Done!`);
  console.log(`   Identity: ${persona.identity.who}`);
  console.log(`   Tone: ${persona.voice.tone}`);
  console.log(`   Topics: ${persona.knowledgeMap.coreTopics.length}`);
  console.log(`   Products: ${persona.products?.length || 0}`);
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
