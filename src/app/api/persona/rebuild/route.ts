/**
 * POST /api/persona/rebuild
 * מריץ מחדש את בניית הפרסונה עם כל הנתונים (תמלולים + פוסטים)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { preprocessInstagramData } from '@/lib/scraping/preprocessing';
import { buildPersonaWithGemini } from '@/lib/ai/gemini-persona-builder';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    console.log('\n=== REBUILDING PERSONA ===');
    console.log(`Account ID: ${accountId}`);

    const supabase = await createClient();

    // Step 1: Preprocess data (including transcriptions!)
    console.log('\n📊 Step 1: Preprocessing data...');
    const preprocessedData = await preprocessInstagramData(accountId);

    console.log(`✅ Loaded:`);
    console.log(`   - ${preprocessedData.posts?.length || 0} posts`);
    console.log(`   - ${preprocessedData.transcriptions?.length || 0} transcriptions`);
    console.log(`   - ${preprocessedData.websites?.length || 0} websites`);
    console.log(`   - ${preprocessedData.comments?.length || 0} comments`);

    // Step 2: Build persona with Gemini
    console.log('\n🤖 Step 2: Building persona with Gemini (including products/brands/coupons)...');
    const persona = await buildPersonaWithGemini(preprocessedData);

    console.log(`\n✅ Persona built!`);
    console.log(`   - ${persona.products?.length || 0} products`);
    console.log(`   - ${persona.brands?.length || 0} brands`);
    console.log(`   - ${persona.coupons?.length || 0} coupons`);

    // Step 3: Save to database
    console.log('\n💾 Step 3: Saving to database...');
    
    const { error: saveError } = await supabase
      .from('chatbot_persona')
      .update({
        gemini_raw_output: persona,
        preprocessing_data: preprocessedData,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId);

    if (saveError) {
      throw new Error(`Failed to save persona: ${saveError.message}`);
    }

    console.log('✅ Persona saved successfully!\n');

    return NextResponse.json({
      success: true,
      message: 'Persona rebuilt successfully',
      stats: {
        transcriptions: preprocessedData.transcriptions?.length || 0,
        posts: preprocessedData.posts?.length || 0,
        websites: preprocessedData.websites?.length || 0,
        products: persona.products?.length || 0,
        brands: persona.brands?.length || 0,
        coupons: persona.coupons?.length || 0,
      },
    });

  } catch (error: any) {
    console.error('\n❌ Error rebuilding persona:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to rebuild persona',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
