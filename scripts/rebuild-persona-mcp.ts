/**
 * Rebuild Persona using MCP-validated schema
 */

import { createClient } from '@supabase/supabase-js';
import { buildPersonaWithGemini, savePersonaToDatabase } from '../src/lib/ai/gemini-persona-builder';
import type { PreprocessedData } from '../src/lib/ai/gemini-persona-builder';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  console.log('============================================================');
  console.log('🔄 [Rebuild Persona] Starting persona rebuild from existing data...');
  console.log(`📍 Account ID: ${ACCOUNT_ID}`);
  console.log('============================================================\n');

  // 1. Get account
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', ACCOUNT_ID)
    .single();

  if (accountError || !account) {
    throw new Error(`Account not found: ${accountError?.message}`);
  }

  const username = account.config?.username || 'unknown';
  const displayName = account.config?.display_name || 'Unknown';

  console.log(`✅ Found account`);
  console.log(`📊 Username: ${username}`);
  console.log(`📊 Display name: ${displayName}`);

  // 2. Fetch existing preprocessing data from persona table
  console.log('\n📚 Loading existing preprocessing data...');
  
  const { data: persona } = await supabase
    .from('chatbot_persona')
    .select('preprocessing_data')
    .eq('account_id', ACCOUNT_ID)
    .single();

  let preprocessedData: PreprocessedData;

  if (persona?.preprocessing_data) {
    console.log('✅ Found existing preprocessing data from previous scan');
    preprocessedData = persona.preprocessing_data as PreprocessedData;
  } else {
    console.log('⚠️ No preprocessing data found, creating minimal structure...');
    
    // Fetch posts
    const { data: posts } = await supabase
      .from('instagram_posts')
      .select('*')
      .eq('account_id', ACCOUNT_ID)
      .order('posted_at', { ascending: false })
      .limit(150);

    // Fetch transcriptions
    const { data: transcriptions } = await supabase
      .from('instagram_transcriptions')
      .select('*')
      .eq('account_id', ACCOUNT_ID)
      .order('created_at', { ascending: false })
      .limit(100);

    console.log(`📝 Posts: ${posts?.length || 0}`);
    console.log(`🎬 Transcriptions: ${transcriptions?.length || 0}`);

    // Build minimal preprocessed data
    preprocessedData = {
      stats: {
        totalPosts: posts?.length || 0,
        totalComments: posts?.reduce((sum, p) => sum + (p.comments_count || 0), 0) || 0,
        totalLikes: posts?.reduce((sum, p) => sum + (p.likes_count || 0), 0) || 0,
        avgEngagement: posts?.length 
          ? (posts.reduce((sum, p) => sum + ((p.likes_count || 0) + (p.comments_count || 0)), 0) / posts.length) 
          : 0,
        timespan: {
          earliest: posts?.[posts.length - 1]?.posted_at || new Date().toISOString(),
          latest: posts?.[0]?.posted_at || new Date().toISOString(),
        },
      },
      
      topTerms: [],
      topics: [],
      timeline: [],
      
      ownerReplies: {
        ratio: 0,
        total: 0,
        avgLength: 0,
        samples: [],
        commonPhrases: [],
        replyPatterns: [],
      },
      
      contentPatterns: {
        postTypes: [],
        captionPatterns: { avgLength: 0, minLength: 0, maxLength: 0 },
        hashtagUsage: [],
        emojiUsage: [],
        mentionPatterns: [],
      },
      
      products: [],
      coupons: [],
      brands: [],
      faqCandidates: [],
      boundaries: {
        answeredTopics: [],
        uncertainTopics: [],
        avoidedTopics: [],
      },
      websites: [],
      transcriptions: transcriptions?.map(t => ({
        id: t.id,
        text: t.transcription || '',
        media_id: t.media_id,
      })) || [],
    };
  }

  console.log(`✅ Preprocessing data ready`);
  console.log(`📊 Stats: ${preprocessedData.stats.totalPosts} posts, ${preprocessedData.stats.totalLikes} likes`);
  console.log(`📊 Transcriptions: ${preprocessedData.transcriptions?.length || 0}`);

  // 3. Build persona with GPT-5.2 Pro
  console.log('\n🧠 Building persona with GPT-5.2 Pro...');
  console.log('⏳ This may take up to 10 minutes with reasoning effort: high');
  console.log('⏰ Timeout increased from 180s to 600s (10 minutes)');
  
  const personaData = await buildPersonaWithGemini(preprocessedData, {
    username,
    full_name: displayName,
    bio: null,
    followers_count: 0,
    category: null,
  });

  console.log('\n✅ Persona generated successfully!');
  console.log(`🎭 Identity: ${personaData.identity.who.substring(0, 100)}...`);
  console.log(`🎯 Target Audience: ${personaData.identity.targetAudience}`);
  console.log(`📝 Voice tone: ${personaData.voice.tone.substring(0, 100)}...`);
  console.log(`📚 Core topics: ${personaData.knowledgeMap.coreTopics.length}`);

  // 4. Save to database
  console.log('\n💾 Saving persona to database...');
  await savePersonaToDatabase(ACCOUNT_ID, personaData);

  console.log('\n============================================================');
  console.log('🎉 [Rebuild Persona] Completed successfully!');
  console.log('============================================================\n');
}

// Run
main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
