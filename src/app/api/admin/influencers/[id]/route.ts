import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Get account with persona
    const { data: account, error } = await supabase
      .from('accounts')
      .select(`
        *,
        chatbot_persona(*)
      `)
      .eq('id', id)
      .single();

    if (error || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    const config = account.config || {};
    const persona = (account.chatbot_persona as any)?.[0];
    const geminiOutput = persona?.gemini_raw_output || {};

    // Get stats
    const [
      { count: postsCount },
      { count: transCount },
      { count: couponsCount },
      { count: partnershipsCount },
      { count: websitesCount }
    ] = await Promise.all([
      supabase.from('instagram_posts').select('*', { count: 'exact', head: true }).eq('account_id', id),
      supabase.from('instagram_transcriptions').select('*', { count: 'exact', head: true }).eq('account_id', id).eq('processing_status', 'completed'),
      supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('account_id', id).eq('is_active', true),
      supabase.from('partnerships').select('*', { count: 'exact', head: true }).eq('account_id', id),
      supabase.from('instagram_bio_websites').select('*', { count: 'exact', head: true }).eq('account_id', id)
    ]);

    const influencer = {
      id: account.id,
      username: config.username || account.id,
      displayName: config.display_name || config.username || 'Unknown',
      type: config.influencer_type || 'other',
      status: account.status,
      persona: {
        name: persona?.name || 'N/A',
        tone: persona?.tone || 'N/A',
        instagramUsername: persona?.instagram_username || null,
        hasGemini: !!geminiOutput.identity,
        productsCount: geminiOutput.products?.length || 0,
        brandsCount: geminiOutput.brands?.length || 0,
        couponsInGemini: geminiOutput.coupons?.length || 0
      },
      stats: {
        posts: postsCount || 0,
        transcriptions: transCount || 0,
        coupons: couponsCount || 0,
        partnerships: partnershipsCount || 0,
        websites: websitesCount || 0
      },
      chatConfig: {
        greeting: config.greeting_message || persona?.greeting_message || '',
        questions: config.suggested_questions || [],
        theme: {
          primary: config.theme?.colors?.primary || '#6366f1',
          background: config.theme?.colors?.background || '#0f172a'
        }
      }
    };

    return NextResponse.json({
      success: true,
      influencer
    });

  } catch (error: any) {
    console.error('[Admin Influencer Detail] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load influencer' },
      { status: 500 }
    );
  }
}
