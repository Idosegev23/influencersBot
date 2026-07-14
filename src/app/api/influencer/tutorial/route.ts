import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';
import { shouldShowTutorial } from '@/lib/onboarding/tutorial';

/**
 * GET  /api/influencer/tutorial?username=  → { show }  (first-run tour eligibility)
 * POST /api/influencer/tutorial?username=  → mark the tour as seen ({ ok })
 * requireInfluencerAuth reads ?username= from the query string.
 */
export async function GET(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;
  const { data } = await supabase.from('accounts').select('config').eq('id', auth.accountId).maybeSingle();
  return NextResponse.json({ show: shouldShowTutorial((data as any)?.config) });
}

export async function POST(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response!;
  const { data } = await supabase.from('accounts').select('config').eq('id', auth.accountId).maybeSingle();
  const config = (data as any)?.config || {};
  const { error } = await supabase
    .from('accounts')
    .update({ config: { ...config, tutorial_seen: true } })
    .eq('id', auth.accountId);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
