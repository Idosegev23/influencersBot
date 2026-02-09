import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Get all accounts with their data
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select(`
        *,
        chatbot_persona(
          id,
          name,
          instagram_username,
          gemini_raw_output
        )
      `)
      .eq('type', 'creator')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Enrich with stats
    const influencers = await Promise.all((accounts || []).map(async (account) => {
      const config = account.config || {};
      const persona = (account.chatbot_persona as any)?.[0];

      // Get stats
      const [
        { count: postsCount },
        { count: transCount },
        { count: couponsCount }
      ] = await Promise.all([
        supabase.from('instagram_posts').select('*', { count: 'exact', head: true }).eq('account_id', account.id),
        supabase.from('instagram_transcriptions').select('*', { count: 'exact', head: true }).eq('account_id', account.id).eq('processing_status', 'completed'),
        supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('account_id', account.id).eq('is_active', true)
      ]);

      return {
        id: account.id,
        username: config.username || account.id,
        displayName: config.display_name || config.username || 'Unknown',
        type: config.influencer_type || 'other',
        status: account.status,
        stats: {
          posts: postsCount || 0,
          transcriptions: transCount || 0,
          coupons: couponsCount || 0,
          hasGemini: !!persona?.gemini_raw_output
        }
      };
    }));

    return NextResponse.json({
      success: true,
      influencers
    });

  } catch (error: any) {
    console.error('[Admin Influencers] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load influencers' },
      { status: 500 }
    );
  }
}
