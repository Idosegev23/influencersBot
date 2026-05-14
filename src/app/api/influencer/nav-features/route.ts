import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * GET /api/influencer/nav-features?username=X
 *
 * Returns the per-account flags the influencer-side NavigationMenu uses to decide
 * which tabs to render. Single endpoint so the menu only triggers one fetch.
 *
 * Response:
 *   {
 *     archetype: 'influencer' | 'brand' | 'service_provider' | 'local_business' | 'media_news' | null,
 *     hasProducts: boolean
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(request);
    if (!auth.authorized) return auth.response!;

    const { data: account } = await supabase
      .from('accounts')
      .select('config, language')
      .eq('id', auth.accountId)
      .single();

    const archetype = (account?.config as { archetype?: string } | null)?.archetype || null;
    const language = (account as any)?.language || 'he';

    const { count } = await supabase
      .from('widget_products')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', auth.accountId)
      .not('slug', 'is', null);

    return NextResponse.json({
      archetype,
      hasProducts: (count ?? 0) > 0,
      language,
    });
  } catch (error) {
    console.error('[nav-features] error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
