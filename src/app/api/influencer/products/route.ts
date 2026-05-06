import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * GET /api/influencer/products?username=X
 *   &q=...        free-text search across name/brand/description
 *   &claim=...    filter by claim tag (e.g. "מאושר בהיריון")
 *   &category=... filter by category (e.g. "סרום לפנים")
 *   &brand=...    filter by brand
 *   &limit=...    pagination (default 60)
 *   &offset=...
 *
 * Read-only — products are populated by the catalog scraper.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(request);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const claim = searchParams.get('claim')?.trim();
    const category = searchParams.get('category')?.trim();
    const brand = searchParams.get('brand')?.trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '60', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = supabase
      .from('widget_products')
      .select(
        'id, slug, name, name_he, brand, category, description, usage, claims, ingredients, key_ingredients, image_url, product_url, is_on_sale, ai_profile, updated_at',
        { count: 'exact' }
      )
      .eq('account_id', auth.accountId)
      .not('slug', 'is', null);

    if (claim) query = query.contains('claims', [claim]);
    if (category) query = query.eq('category', category);
    if (brand) query = query.eq('brand', brand);
    if (q) {
      // Search name, brand, description
      const term = q.replace(/[%_]/g, '');
      query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%`);
    }

    query = query.order('name', { ascending: true }).range(offset, offset + limit - 1);
    const { data, count, error } = await query;
    if (error) {
      console.error('[products] GET error:', error.message);
      return NextResponse.json({ error: 'שגיאה בטעינת מוצרים' }, { status: 500 });
    }

    return NextResponse.json({
      products: data || [],
      total: count ?? null,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[products] GET error:', error);
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
