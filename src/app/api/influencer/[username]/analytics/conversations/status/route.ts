/**
 * GET …/conversations/status — is the conversation-analysis feature on for
 * this account, and should its link be shown?
 *
 * Two separate flags on purpose:
 *   enabled — the classification pipeline runs for this account
 *   visible — the brand is shown the result
 *
 * They are split so an account can be classified and hand-checked before
 * anyone is presented with a number. Never fold them into one.
 *
 * This lives behind influencer auth rather than on /api/influencer/profile,
 * which is unauthenticated and deliberately sanitized.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername, supabase } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const { data } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', influencer.id)
    .single();

  const cfg = (data as any)?.config?.conversation_analytics || {};
  return NextResponse.json({
    enabled: cfg.enabled === true,
    visible: cfg.visible === true,
  });
}
