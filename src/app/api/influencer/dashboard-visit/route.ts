/**
 * POST /api/influencer/dashboard-visit?username=xxx
 *
 * Metric 10 — how often the brand opens its own system. There is no login or
 * page-view log anywhere in the product, so "client usage" reported as
 * NOT MEASURED; this is the collection that changes that.
 *
 * Scope comes from the influencer session cookie via checkInfluencerAuth, which
 * verifies the cookie matches the requested username — never from the query
 * parameter alone. An IDOR of exactly this shape was found and fixed on
 * dm-settings.
 *
 * Fire-and-forget by design: the caller ignores the response, and a failure here
 * must never affect the dashboard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const path = (await req.json().catch(() => ({})))?.path;

  const { error } = await supabaseAdmin.from('events').insert({
    type: 'dashboard_visit',
    category: 'session',
    account_id: influencer.id,
    mode: 'dashboard',
    payload: { path: typeof path === 'string' ? path.slice(0, 200) : null },
  });
  if (error) console.error('[influencer/dashboard-visit] insert failed:', error.message);

  return NextResponse.json({ ok: true });
}
