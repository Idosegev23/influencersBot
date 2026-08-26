/**
 * GET /api/influencer/[username]/content-insights
 *
 * Insights derived from the account's scanned content. Same auth shape as the
 * other owner-scoped analytics routes: influencer cookie + ownership.
 *
 * Unlike /analytics/conversations, this needs no traffic — it is what the
 * dashboard has to show on day one, before anybody has chatted.
 */

import { NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('content_insights')
    .select('insight_type, title, summary, rank, metrics, evidence, generated_at')
    .eq('account_id', influencer.id)
    .order('insight_type', { ascending: true })
    .order('rank', { ascending: true });

  if (error) {
    console.error('[content-insights] query failed:', error.message);
    return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 });
  }

  const insights = data || [];
  const byType: Record<string, typeof insights> = {};
  for (const row of insights) {
    (byType[row.insight_type] ||= []).push(row);
  }

  return NextResponse.json({
    insights,
    byType,
    generatedAt: insights[0]?.generated_at ?? null,
    // An empty result is a real state — the scan found nothing worth an
    // evidence-backed claim — and the UI is expected to say so, not spin.
    isEmpty: insights.length === 0,
  });
}
