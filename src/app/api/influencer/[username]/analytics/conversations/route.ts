/**
 * GET /api/influencer/[username]/analytics/conversations
 *
 * Aggregated conversation report for a date range. Same auth shape as the
 * existing analytics/summary route: influencer cookie + ownership.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { buildReport } from '@/lib/conversation-analytics/aggregate';
import { parseRange } from '@/lib/conversation-analytics/range';
import {
  fetchClassificationRows,
  fetchConnectedChannels,
  fetchInsights,
  filtersFromParams,
} from '@/lib/conversation-analytics/query';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  try {
    const sp = req.nextUrl.searchParams;
    const range = parseRange(sp, new Date());
    const filters = filtersFromParams(sp);

    const [current, previous, channels, insights] = await Promise.all([
      fetchClassificationRows({ accountId: influencer.id, fromIso: range.fromIso, toIso: range.toIso, filters }),
      fetchClassificationRows({ accountId: influencer.id, fromIso: range.prevFromIso, toIso: range.prevToIso, filters }),
      fetchConnectedChannels(influencer.id),
      // Insights are never filtered — they describe the period, not a slice of it.
      fetchInsights({ accountId: influencer.id, fromIso: range.fromIso, toIso: range.toIso }),
    ]);

    return NextResponse.json({
      range,
      report: buildReport({ current, previous, connectedChannels: channels }),
      insights,
    });
  } catch (e: any) {
    console.error('[analytics/conversations]', e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
