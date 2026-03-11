/**
 * Rebuild persona using GPT-5.4 for existing accounts.
 * Uses preprocessing_data already stored in chatbot_persona table.
 *
 * Usage: npx tsx scripts/rebuild-persona-gpt54.ts <account_id>
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const accountId = process.argv[2];
  if (!accountId) {
    console.error('Usage: npx tsx scripts/rebuild-persona-gpt54.ts <account_id>');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧠 Rebuilding persona with GPT-5.4 for ${accountId}`);
  console.log(`${'='.repeat(60)}\n`);

  // 1. Load existing preprocessing data
  const { data: persona, error } = await supabase
    .from('chatbot_persona')
    .select('preprocessing_data, name')
    .eq('account_id', accountId)
    .single();

  if (error || !persona?.preprocessing_data) {
    console.error('No preprocessing_data found:', error?.message || 'empty');
    process.exit(1);
  }

  console.log(`✅ Loaded preprocessing data for "${persona.name}"`);
  console.log(`📊 Size: ${JSON.stringify(persona.preprocessing_data).length} chars`);

  // 2. Load profile data from accounts table
  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();

  const profileData = account?.config ? {
    username: account.config.username,
    full_name: account.config.display_name || account.config.username,
    bio: account.config.bio,
    followers_count: account.config.followers_count,
    category: account.config.category,
  } : undefined;

  // 3. Rebuild with GPT-5.4
  console.log('\n🧠 Building persona with GPT-5.4...');
  const startTime = Date.now();

  // Dynamic import to pick up the updated builder
  const { buildPersonaWithGemini, savePersonaToDatabase } = await import('../src/lib/ai/gemini-persona-builder');

  const newPersona = await buildPersonaWithGemini(persona.preprocessing_data, profileData);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ Persona built in ${elapsed}s`);
  console.log(`🎭 Identity: ${newPersona.identity.who}`);
  console.log(`🎯 Entity type: ${newPersona.identity.entityType || 'not specified'}`);
  console.log(`📝 Tone: ${newPersona.voice.tone}`);
  console.log(`📚 Topics: ${newPersona.knowledgeMap.coreTopics.length}`);
  console.log(`🛍️ Products: ${newPersona.products?.length || 0}`);
  console.log(`🏷️ Brands: ${newPersona.brands?.length || 0}`);
  console.log(`🎫 Coupons: ${newPersona.coupons?.length || 0}`);

  // 4. Save to database
  console.log('\n💾 Saving to database...');
  await savePersonaToDatabase(
    supabase,
    accountId,
    newPersona,
    persona.preprocessing_data,
    JSON.stringify(newPersona)
  );

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 Done! Persona rebuilt with GPT-5.4 in ${elapsed}s`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
