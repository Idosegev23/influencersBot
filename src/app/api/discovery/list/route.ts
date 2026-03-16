import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CATEGORY_MAP, resolveCategoryTitle } from '@/lib/discovery/categories';
import { executeDataQuery } from '@/lib/discovery/data-queries';
import { cachedDataList, cachedAIList } from '@/lib/discovery/discovery-cache';
import type { DiscoveryListData } from '@/lib/discovery/types';

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  const slug = req.nextUrl.searchParams.get('slug');

  if (!username || !slug) {
    return NextResponse.json({ error: 'Missing username or slug' }, { status: 400 });
  }

  const category = CATEGORY_MAP.get(slug);
  if (!category) {
    return NextResponse.json({ error: 'Unknown category' }, { status: 404 });
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

    let data: DiscoveryListData;

    if (category.type === 'data_driven') {
      const items = await cachedDataList(accountId, slug, () => executeDataQuery(slug, accountId));

      data = {
        category: {
          slug,
          title: resolveCategoryTitle(category.titleTemplate, influencerName),
          subtitle: category.subtitle,
          type: category.type,
          icon: category.icon,
          color: category.color,
        },
        items,
        generatedAt: new Date().toISOString(),
        isStale: false,
      };
    } else if (category.type === 'ai_generated') {
      const listData = await cachedAIList(accountId, slug, async () => {
        const { data: row } = await supabase
          .from('discovery_lists')
          .select('*')
          .eq('account_id', accountId)
          .eq('category_slug', slug)
          .maybeSingle();

        return row;
      });

      if (!listData) {
        return NextResponse.json({ error: 'List not generated yet', status: 'pending' }, { status: 202 });
      }

      data = {
        category: {
          slug,
          title: resolveCategoryTitle(category.titleTemplate, influencerName),
          subtitle: resolveCategoryTitle(category.subtitle, influencerName),
          type: category.type,
          icon: category.icon,
          color: category.color,
        },
        items: listData.items || [],
        generatedAt: listData.generated_at,
        isStale: new Date(listData.expires_at) < new Date(),
      };
    } else {
      return NextResponse.json({ error: 'Use /api/discovery/questions for interactive categories' }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[Discovery List]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
