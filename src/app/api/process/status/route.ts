/**
 * API: Get Content Processing Status
 * מחזיר סטטוס העיבוד והפרסונה של חשבון
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/process/status?accountId=xxx
 * Get processing status for an account
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'Missing accountId' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get persona
    const { data: persona, error: personaError } = await supabase
      .from('chatbot_persona')
      .select('*')
      .eq('account_id', accountId)
      .single();

    // Get transcriptions count
    const { count: transcriptionsCount } = await supabase
      .from('instagram_transcriptions')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('processing_status', 'completed');

    // Get pending transcriptions count
    const { count: pendingTranscriptionsCount } = await supabase
      .from('instagram_transcriptions')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('processing_status', 'pending');

    // Get posts count
    const { count: postsCount } = await supabase
      .from('instagram_posts')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId);

    // Get highlights count
    const { count: highlightsCount } = await supabase
      .from('instagram_highlight_items')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId);

    const hasPersona = !!persona && !personaError;
    const lastUpdated = persona?.updated_at || persona?.last_full_scrape_at;

    return NextResponse.json({
      success: true,
      status: {
        hasPersona,
        personaLastUpdated: lastUpdated,
        
        content: {
          posts: postsCount || 0,
          highlights: highlightsCount || 0,
        },
        
        transcriptions: {
          completed: transcriptionsCount || 0,
          pending: pendingTranscriptionsCount || 0,
        },
        
        persona: hasPersona ? {
          name: persona.name,
          tone: persona.tone,
          language: persona.language,
          topics: persona.knowledge_map?.coreTopics?.length || 0,
          products: persona.metadata?.products?.length || 0,
          coupons: persona.metadata?.coupons?.length || 0,
          brands: persona.metadata?.brands?.length || 0,
        } : null,
      },
    });

  } catch (error: any) {
    console.error('[Process Status API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
