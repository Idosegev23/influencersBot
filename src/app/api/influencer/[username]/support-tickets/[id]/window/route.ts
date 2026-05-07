import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getServiceWindow } from '@/lib/support/service-window';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await ctx.params;

  const isInfluencer = await checkInfluencerAuth(username);
  const isAdmin = (await requireAdminAuth()) === null;
  if (!isInfluencer && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: ticket } = await supabase
    .from('support_requests')
    .select('id, customer_phone')
    .eq('id', id)
    .eq('account_id', influencer.id)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const window = await getServiceWindow(influencer.id, ticket.customer_phone);
  return NextResponse.json(window);
}
