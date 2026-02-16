#!/usr/bin/env npx tsx
/**
 * Build Persona for the_dekel
 * בניית פרסונה מלאה מכל התוכן שנסרק (GPT-5.2 Pro)
 */

// ⚡ CRITICAL: Load .env FIRST!
import { config } from 'dotenv';
import { resolve } from 'path';
const envPath = resolve(__dirname, '../.env');
console.log(`📁 Loading environment from: ${envPath}`);
const envResult = config({ path: envPath });
if (envResult.error) {
  console.error('❌ Failed to load .env:', envResult.error);
  process.exit(1);
}

import { preprocessInstagramData } from '../src/lib/scraping/preprocessing';
import { buildPersonaWithGemini, savePersonaToDatabase } from '../src/lib/ai/gemini-persona-builder';
import { createClient } from '../src/lib/supabase/server';

const DEKEL_ACCOUNT_ID = 'e5a5076a-faaf-4e67-8bdd-61c15153fb20';
const DEKEL_USERNAME = 'the_dekel';

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🧠 Building FULL PERSONA for the_dekel with GPT-5.2 Pro');
  console.log('='.repeat(80) + '\n');

  console.log('📊 This will analyze:');
  console.log('   - ~98 Posts with captions');
  console.log('   - ~97 Highlights');
  console.log('   - ~712 Highlight items');
  console.log('   - ~614 Transcriptions (~324K characters!)');
  console.log('   - Websites (linkis with coupons & brands)');
  console.log('   - Comments & engagement patterns\n');

  // Validate API keys
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('❌ OPENAI_API_KEY is required for GPT-5.2 Pro');
  }
  console.log('✅ OpenAI API Key found\n');

  const supabase = await createClient();

  try {
    // Step 1: Load profile data
    console.log('📥 [Step 1/4] Loading profile data...');
    const { data: profile } = await supabase
      .from('accounts')
      .select('id, type, config')
      .eq('id', DEKEL_ACCOUNT_ID)
      .single();

    if (!profile) {
      throw new Error('Account not found');
    }
    console.log(`✅ Profile loaded: ${profile.config?.display_name || DEKEL_USERNAME}\n`);

    // Step 2: Preprocess all content
    console.log('⚙️  [Step 2/4] Preprocessing content (this takes 30-60s)...');
    console.log('   - Analyzing posts & captions');
    console.log('   - Clustering topics');
    console.log('   - Loading transcriptions');
    console.log('   - Analyzing engagement patterns');
    console.log('   - Extracting FAQ candidates\n');

    const preprocessed = await preprocessInstagramData(DEKEL_ACCOUNT_ID);

    console.log('✅ Preprocessing complete!');
    console.log(`   - ${preprocessed.stats.totalPosts} posts analyzed`);
    console.log(`   - ${preprocessed.topics.length} topics identified`);
    console.log(`   - ${preprocessed.topTerms.length} top terms extracted`);
    console.log(`   - ${preprocessed.transcriptions?.length || 0} transcriptions loaded`);
    console.log(`   - ${preprocessed.websites?.length || 0} websites loaded`);
    console.log(`   - ${preprocessed.faqCandidates.length} FAQ candidates\n`);

    // Step 3: Build persona with GPT-5.2 Pro (this is the LONG step!)
    console.log('🧠 [Step 3/4] Building persona with GPT-5.2 Pro...');
    console.log('   ⏰ This may take 2-5 minutes (HIGH reasoning mode)');
    console.log('   🔥 GPT-5.2 Pro is analyzing:');
    console.log('      - Identity & voice');
    console.log('      - Knowledge map & topics');
    console.log('      - Boundaries & evolution');
    console.log('      - Products, coupons & brands');
    console.log('      - Response policies\n');
    console.log('   ⏳ Please wait...\n');

    const personaStartTime = Date.now();
    const persona = await buildPersonaWithGemini(preprocessed, profile);
    const personaDuration = ((Date.now() - personaStartTime) / 1000).toFixed(2);

    console.log(`✅ Persona built in ${personaDuration}s!\n`);

    // Step 4: Save to database
    console.log('💾 [Step 4/4] Saving persona to database...');
    
    await savePersonaToDatabase(
      supabase,
      DEKEL_ACCOUNT_ID,
      persona,
      preprocessed,
      JSON.stringify(persona) // Save the full output as raw
    );

    console.log('✅ Persona saved successfully!\n');

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('🎉 PERSONA BUILD COMPLETE!');
    console.log('='.repeat(80));
    console.log('\n📊 Summary:');
    console.log(`   ✅ Identity: ${persona.identity?.who || 'N/A'}`);
    console.log(`   ✅ Tone: ${persona.voice?.tone || 'N/A'}`);
    console.log(`   ✅ Core Topics: ${persona.knowledgeMap?.coreTopics?.length || 0}`);
    console.log(`   ✅ Products: ${persona.products?.length || 0}`);
    console.log(`   ✅ Coupons: ${persona.coupons?.length || 0}`);
    console.log(`   ✅ Brands: ${persona.brands?.length || 0}`);
    console.log(`   ✅ Recurring Phrases: ${persona.voice?.recurringPhrases?.length || 0}`);
    console.log(`\n⏱  Total time: ${((Date.now() - Date.now()) / 1000).toFixed(2)}s`);
    console.log('='.repeat(80) + '\n');

    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();
