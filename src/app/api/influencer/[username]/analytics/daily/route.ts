/**
 * Daily chat stats + top products for the owner's analytics dashboard.
 *
 * The page used to call getDailyStats/getTopProducts straight from the browser,
 * which reached chat_sessions and events with the anon key. Same helpers, same
 * shape — just moved behind the influencer cookie so the tables can be locked down.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername, getDailyStats, getTopProducts } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';

export const runtime = 'nodejs';

const TOP_PRODUCTS_LIMIT = 5;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string }> }
) {
  const { username } = await ctx.params;
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const isAuth = await checkInfluencerAuth(username);
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const from = fromParam ? new Date(fromParam) : null;
  const to = toParam ? new Date(toParam) : null;

  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'from and to are required ISO dates' }, { status: 400 });
  }

  try {
    const [dailyStats, topProducts] = await Promise.all([
      getDailyStats(influencer.id, from, to),
      getTopProducts(influencer.id, from, to, TOP_PRODUCTS_LIMIT),
    ]);
    return NextResponse.json({ dailyStats, topProducts });
  } catch (e: any) {
    console.error('[influencer/analytics/daily] error:', e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
