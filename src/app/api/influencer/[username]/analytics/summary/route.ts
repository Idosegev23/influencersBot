/**
 * Per-account analytics summary for the owner's dashboard. Same shape as
 * the admin route but auth is the influencer cookie + ownership check.
 * Cost panel is excluded from this response (admin-only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { getAccountAnalyticsSummary } from '@/lib/analytics/summary';

export const runtime = 'nodejs';

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

  const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10);
  try {
    const data = await getAccountAnalyticsSummary({
      accountId: influencer.id,
      days: Number.isFinite(days) ? days : 30,
      includeCost: false,
    });
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[influencer/analytics/summary] error:', e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
