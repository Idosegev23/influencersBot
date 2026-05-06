import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * GET /api/influencer/products/facets?username=X
 * Returns counts per claim / category / brand so the UI can render filter chips.
 * Also returns total product count.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(request);
    if (!auth.authorized) return auth.response!;

    const { data, error } = await supabase
      .from('widget_products')
      .select('claims, category, brand')
      .eq('account_id', auth.accountId)
      .not('slug', 'is', null);

    if (error) {
      console.error('[products/facets] error:', error.message);
      return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
    }

    const claimCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    const brandCounts = new Map<string, number>();

    for (const row of data || []) {
      for (const c of row.claims || []) {
        claimCounts.set(c, (claimCounts.get(c) || 0) + 1);
      }
      if (row.category) categoryCounts.set(row.category, (categoryCounts.get(row.category) || 0) + 1);
      if (row.brand) brandCounts.set(row.brand, (brandCounts.get(row.brand) || 0) + 1);
    }

    const sortDesc = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));

    return NextResponse.json({
      total: data?.length || 0,
      claims: sortDesc(claimCounts),
      categories: sortDesc(categoryCounts),
      brands: sortDesc(brandCounts),
    });
  } catch (error) {
    console.error('[products/facets] error:', error);
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
