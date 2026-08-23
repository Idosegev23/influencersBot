/**
 * GET …/conversations/sessions — the paginated conversation table behind the page.
 *
 * Accepts the same filters as the aggregation route, plus `topic`, `product_id`,
 * `keyword`, `page` and `page_size`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { parseRange } from '@/lib/conversation-analytics/range';
import { fetchClassificationPage, filtersFromParams } from '@/lib/conversation-analytics/query';

export const runtime = 'nodejs';

const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 200;

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  try {
    const sp = req.nextUrl.searchParams;
    const range = parseRange(sp, new Date());
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(MIN_PAGE_SIZE, parseInt(sp.get('page_size') || '50', 10) || 50)
    );

    const { rows, total } = await fetchClassificationPage({
      accountId: influencer.id,
      fromIso: range.fromIso,
      toIso: range.toIso,
      filters: filtersFromParams(sp),
      page,
      pageSize,
    });

    return NextResponse.json({ rows, total, page, pageSize });
  } catch (e: any) {
    console.error('[analytics/conversations/sessions]', e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
