/**
 * Is this address one we know mail cannot reach?
 *
 * Read-only, one address at a time, and behind the same auth pair as every sibling route
 * in this directory. A customer's address is not public, and an unauthenticated caller
 * could otherwise use this endpoint to test which addresses a brand holds.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getDeliverability } from '@/lib/support/email-deliverability-store';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string }> },
) {
  const { username } = await ctx.params;
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const isInfluencer = await checkInfluencerAuth(username);
  const isAdmin = (await requireAdminAuth()) === null;
  if (!isInfluencer && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const address = req.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ status: 'unknown' });

  const map = await getDeliverability([address]);
  // "Nothing recorded" and "recorded as fine" both mean the agent should just write to it.
  const status = [...map.values()][0] || 'unknown';
  return NextResponse.json({ status });
}
