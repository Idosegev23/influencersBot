import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/influencer/products/dictionary?username=X
 *
 * Returns the account's master ingredient dictionary — the same hover-tooltip
 * data that appears on Dekel's site (function + rating per ingredient).
 *
 * Public-readable: this is editorial content surfaced in the follower-facing
 * catalog tab. Cached aggressively because it changes rarely.
 *
 * Response shape:
 *   {
 *     dictionary: { [ingredientName]: { function: string|null, rating: string|null, count: number } },
 *     total: number
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username')?.trim();
    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('config')
      .eq('config->>username', username)
      .maybeSingle();

    const dict =
      (account?.config as { ingredient_dictionary?: Record<string, unknown> } | null)
        ?.ingredient_dictionary || {};

    return NextResponse.json(
      { dictionary: dict, total: Object.keys(dict).length },
      {
        headers: {
          // Edge cache for 5 minutes; revalidate in background.
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('[products/dictionary] error:', error);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
