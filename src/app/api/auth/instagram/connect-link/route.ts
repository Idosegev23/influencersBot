/**
 * Mint a signed Instagram connect link.
 * GET /api/auth/instagram/connect-link?accountId=<uuid>&returnTo=<path>&username=<optional>
 *
 * This is the ONLY way to obtain a working /api/auth/instagram/connect URL.
 * The connect route no longer accepts a raw accountId, so the authorization
 * check lives here, once: an admin may mint a link for any account; an
 * influencer may mint one only for their own.
 *
 * Returns an absolute URL so the admin "copy connect link" button can hand it
 * straight to an influencer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { signConnectToken } from '@/lib/instagram-graph/connect-token';
import { isSafeReturnTo } from '@/lib/meta-review/util';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId') || '';
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '';

  if (!UUID_RE.test(accountId)) {
    return NextResponse.json({ error: 'Invalid accountId' }, { status: 400 });
  }

  // Admin — may mint for any account.
  const adminDenied = await requireAdminAuth();
  if (adminDenied) {
    // Not an admin: fall back to the influencer who owns this account. Their
    // session is keyed by username, so `?username=` must be present AND the
    // account it resolves to must be the one being requested — otherwise a
    // logged-in influencer could mint a link for a different tenant.
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) return auth.response!;
    if (auth.accountId !== accountId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const url = new URL('/api/auth/instagram/connect', req.nextUrl.origin);
  url.searchParams.set('token', signConnectToken(accountId));
  if (isSafeReturnTo(returnTo)) url.searchParams.set('returnTo', returnTo);

  return NextResponse.json({ url: url.toString() });
}
