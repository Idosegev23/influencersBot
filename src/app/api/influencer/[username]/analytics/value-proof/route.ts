/**
 * GET /api/influencer/[username]/analytics/value-proof?days=30
 *
 * Brand-facing value proof: 7 of the 10 metrics. Answer accuracy, setup time and
 * the brand's own usage are admin-only — they are OUR product metrics, and
 * telling a brand "you opened the system twice this month" works against us.
 * The audience gate lives in buildValueProof, so those keys are never serialised.
 *
 * Scope comes from the influencer session cookie via checkInfluencerAuth, which
 * verifies the cookie matches the requested username. An IDOR of exactly this
 * shape was found and fixed on dm-settings — never resolve the account from a
 * query parameter alone.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { createClient } from '@/lib/supabase/server';
import { buildValueProof } from '@/lib/analytics/value-proof/metrics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 3650);
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const supabase = await createClient();
  const config = (influencer as any)?.config || {};
  const costPerTicket = Number(config?.support?.cost_per_ticket) || null;

  const { data: raw, error } = await supabase.rpc('value_proof_summary', {
    p_account_id: influencer.id, p_since: since, p_until: new Date().toISOString(),
  });
  if (error) {
    console.error('[influencer/analytics/value-proof] rpc error:', error.message);
    return NextResponse.json({ error: 'aggregation_failed' }, { status: 500 });
  }

  return NextResponse.json({
    brand: {
      name: config.brandName || config.name || config.username || '',
      username: config.username || '',
      logo: config.profilePic || config.custom_logo_url || null,
      primaryColor: config?.widget?.primaryColor || config.primaryColor || null,
    },
    ...buildValueProof(raw, { audience: 'brand', costPerTicket }),
  });
}
