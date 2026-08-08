import { NextRequest, NextResponse } from 'next/server';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { signConnectToken } from '@/lib/instagram-graph/connect-token';

export const dynamic = 'force-dynamic';

/**
 * GET /api/onboard/[token]/connect — token-scoped Instagram connect.
 * Resolves the account from the token SERVER-SIDE (never trusts a client accountId),
 * then hands off to the OAuth connect route with a returnTo back to the wizard.
 * This binds the connect step to the onboarding token (closes the connect-IDOR for
 * the wizard flow — the client never sees or supplies a raw accountId).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const draft = await resolveDraftByToken(token);
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // The onboarding token already proved which account this is, so we can mint
  // the signed connect token directly instead of round-tripping through
  // /api/auth/instagram/connect-link (which authorizes admins/influencers).
  const url = new URL('/api/auth/instagram/connect', req.nextUrl.origin);
  url.searchParams.set('token', signConnectToken(draft.id));
  url.searchParams.set('returnTo', `/onboard/${token}`);
  return NextResponse.redirect(url);
}
