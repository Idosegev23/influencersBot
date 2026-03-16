import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DISCOVERY_CATEGORIES, resolveCategoryTitle } from '@/lib/discovery/categories';
import { checkDataAvailability } from '@/lib/discovery/data-queries';
import { cachedCategories } from '@/lib/discovery/discovery-cache';
import type { DiscoveryCategoryAvailability } from '@/lib/discovery/types';

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 });
  }

  try {
    const supabase = createClient();

    // Resolve username to account
    const { data: account } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('config->>username', username)
      .eq('status', 'active')
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const accountId = account.id;
    const influencerName = account.config?.display_name || account.config?.username || username;

    const categories = await cachedCategories(accountId, async () => {
      // Check data availability for data-driven categories
      const availability = await checkDataAvailability(accountId);

      // Check AI lists in DB
      const { data: aiLists } = await supabase
        .from('discovery_lists')
        .select('category_slug, item_count')
        .eq('account_id', accountId)
        .eq('category_type', 'ai_generated');

      const aiListMap = new Map((aiLists || []).map(l => [l.category_slug, l.item_count]));

      const result: DiscoveryCategoryAvailability[] = [];

      for (const cat of DISCOVERY_CATEGORIES) {
        let available = false;
        let itemCount = 0;
        const minItems = cat.minItems ?? 5;

        if (cat.type === 'data_driven') {
          switch (cat.requiredData) {
            case 'posts_with_views':
              available = availability.postsWithViews >= minItems;
              itemCount = Math.min(availability.postsWithViews, 5);
              break;
            case 'posts_any':
              available = availability.postsAny >= minItems;
              itemCount = Math.min(availability.postsAny, 5);
              break;
            case 'reels':
              available = availability.reels >= minItems;
              itemCount = Math.min(availability.reels, 5);
              break;
          }
        } else if (cat.type === 'ai_generated') {
          const count = aiListMap.get(cat.slug) ?? 0;
          available = count >= 3;
          itemCount = count;
        } else if (cat.type === 'interactive') {
          // Questions always available
          available = true;
          itemCount = 0;
        }

        if (available) {
          result.push({
            slug: cat.slug,
            title: resolveCategoryTitle(cat.titleTemplate, influencerName),
            subtitle: resolveCategoryTitle(cat.subtitle, influencerName),
            icon: cat.icon,
            type: cat.type,
            color: cat.color,
            bgColor: cat.bgColor,
            available: true,
            itemCount,
          });
        }
      }

      return result;
    });

    return NextResponse.json({
      categories,
      influencerName,
      totalCategories: categories.length,
    });
  } catch (err) {
    console.error('[Discovery Categories]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
