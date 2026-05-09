#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Run preprocessing + persona only for footlocker.
 * RAG ingest already done; topic classification deferred to orchestrator Step 4.
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

  console.log('═══ Footlocker: preprocessing + persona ═══\n');

  console.log('🔄 [1/2] Preprocessing Instagram data...');
  const { preprocessInstagramData } = await import('../src/lib/scraping/preprocessing');
  const preprocessed = await preprocessInstagramData(ACCOUNT_ID);
  console.log(`   ✅ Preprocessing complete`);

  console.log('\n🎭 [2/2] Building persona with GPT-5.4 + saving...');
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
  console.log(`   Brands: ${persona.brands?.length || 0}`);
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
