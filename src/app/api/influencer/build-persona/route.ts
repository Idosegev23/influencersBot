/**
 * POST /api/influencer/build-persona
 * בניית פרסונה מחדש מתוכן קיים
 */

import { NextRequest, NextResponse } from 'next/server';
import { preprocessInstagramData } from '@/lib/scraping/preprocessing';
import { buildPersonaWithGemini, savePersonaToDatabase } from '@/lib/ai/gemini-persona-builder';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, username } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    console.log('\n' + '='.repeat(70));
    console.log(`🧠 [Persona Builder] Starting for ${username || accountId}`);
    console.log('='.repeat(70) + '\n');

    const startTime = Date.now();
    const supabase = await createClient();

    // Step 1: Load profile
    console.log('📥 [1/4] Loading profile...');
    const { data: profile } = await supabase
      .from('accounts')
      .select('id, type, config')
      .eq('id', accountId)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }
    console.log(`✅ Profile: ${profile.config?.display_name || username}`);

    // Step 2: Preprocess content
    console.log('\n⚙️  [2/4] Preprocessing content...');
    const preprocessed = await preprocessInstagramData(accountId);
    
    console.log(`✅ Preprocessed:`);
    console.log(`   - ${preprocessed.stats.totalPosts} posts`);
    console.log(`   - ${preprocessed.topics.length} topics`);
    console.log(`   - ${preprocessed.transcriptions?.length || 0} transcriptions`);
    console.log(`   - ${preprocessed.websites?.length || 0} websites`);

    // Step 3: Build persona with GPT-5.2 Pro
    console.log('\n🧠 [3/4] Building persona with GPT-5.2 Pro (HIGH reasoning)...');
    console.log('   ⏰ This may take 2-5 minutes...');
    
    const personaStartTime = Date.now();
    const persona = await buildPersonaWithGemini(preprocessed, profile);
    const personaDuration = ((Date.now() - personaStartTime) / 1000).toFixed(2);
    
    console.log(`✅ Persona built in ${personaDuration}s!`);

    // Step 4: Save to database
    console.log('\n💾 [4/4] Saving to database...');
    await savePersonaToDatabase(
      supabase,
      accountId,
      persona,
      preprocessed,
      JSON.stringify(persona)
    );

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 PERSONA BUILD COMPLETE!');
    console.log('='.repeat(70));
    console.log(`\n📊 Results:`);
    console.log(`   - Identity: ${persona.identity?.who || 'N/A'}`);
    console.log(`   - Tone: ${persona.voice?.tone || 'N/A'}`);
    console.log(`   - Topics: ${persona.knowledgeMap?.coreTopics?.length || 0}`);
    console.log(`   - Products: ${persona.products?.length || 0}`);
    console.log(`   - Coupons: ${persona.coupons?.length || 0}`);
    console.log(`   - Brands: ${persona.brands?.length || 0}`);
    console.log(`   - Duration: ${totalDuration}s\n`);

    return NextResponse.json({
      success: true,
      persona: {
        identity: persona.identity,
        voice: persona.voice,
        topicsCount: persona.knowledgeMap?.coreTopics?.length || 0,
        productsCount: persona.products?.length || 0,
        couponsCount: persona.coupons?.length || 0,
        brandsCount: persona.brands?.length || 0,
      },
      stats: {
        postsAnalyzed: preprocessed.stats.totalPosts,
        topicsIdentified: preprocessed.topics.length,
        transcriptionsUsed: preprocessed.transcriptions?.length || 0,
        websitesUsed: preprocessed.websites?.length || 0,
        processingTimeSeconds: parseFloat(totalDuration),
      },
    });

  } catch (error: any) {
    console.error('\n❌ Error building persona:', error);
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to build persona',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}
