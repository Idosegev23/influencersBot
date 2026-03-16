import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CATEGORY_MAP, DISCOVERY_CATEGORIES, resolveCategoryTitle } from '@/lib/discovery/categories';
import { executeDataQuery } from '@/lib/discovery/data-queries';
import { cachedDataList, cachedAIList, cachedCategories } from '@/lib/discovery/discovery-cache';
import { checkDataAvailability } from '@/lib/discovery/data-queries';
import type { DiscoveryItem, DiscoveryCategoryAvailability } from '@/lib/discovery/types';

interface DiscoveryRow {
  category: {
    slug: string;
    title: string;
    subtitle: string;
    type: string;
    icon: string;
    color: string;
  };
  items: DiscoveryItem[];
}

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 });
  }

  try {
    const supabase = createClient();

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

    // Get available categories first
    const categories = await cachedCategories(accountId, async () => {
      const availability = await checkDataAvailability(accountId);
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
          available = false; // Skip questions in all-lists
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

    // Fetch items for each available category in parallel
    const rowPromises = categories.map(async (cat): Promise<DiscoveryRow | null> => {
      const categoryDef = CATEGORY_MAP.get(cat.slug);
      if (!categoryDef) return null;

      try {
        let items: DiscoveryItem[] = [];

        if (categoryDef.type === 'data_driven') {
          items = await cachedDataList(accountId, cat.slug, () => executeDataQuery(cat.slug, accountId));
        } else if (categoryDef.type === 'ai_generated') {
          const listData = await cachedAIList(accountId, cat.slug, async () => {
            const { data: row } = await supabase
              .from('discovery_lists')
              .select('*')
              .eq('account_id', accountId)
              .eq('category_slug', cat.slug)
              .maybeSingle();
            return row;
          });
          items = listData?.items || [];
        }

        if (items.length === 0) return null;

        return {
          category: {
            slug: cat.slug,
            title: cat.title,
            subtitle: cat.subtitle,
            type: cat.type,
            icon: cat.icon,
            color: cat.color,
          },
          items,
        };
      } catch (err) {
        console.error(`[all-lists] Error loading ${cat.slug}:`, err);
        return null;
      }
    });

    const results = await Promise.all(rowPromises);
    const rows = results.filter((r): r is DiscoveryRow => r !== null && r.items.length > 0);

    return NextResponse.json({ rows, influencerName });
  } catch (err) {
    console.error('[Discovery All Lists]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
