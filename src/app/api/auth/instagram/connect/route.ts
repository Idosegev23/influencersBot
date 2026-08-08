/**
 * Instagram OAuth — Start Connection Flow
 * GET /api/auth/instagram/connect?token=<signed>
 *
 * מפנה את האינפלואנסר לעמוד ההרשאות של אינסטגרם.
 * אחרי שהוא מאשר — הוא חוזר ל-/api/auth/instagram/callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { IG_OAUTH_SCOPE_PARAM } from '@/lib/instagram-graph/scopes';
import { verifyConnectToken } from '@/lib/instagram-graph/connect-token';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID || '';

// This route stays session-less on purpose — an influencer opens the shared
// link without a dashboard login. What it will NOT accept any more is a raw
// `?accountId=`: with Advanced Access on manage_messages, anyone can complete
// OAuth, so a guessed accountId would attach an attacker's Instagram to another
// tenant's account. The accountId now arrives inside an HMAC-signed, expiring
// token minted by /api/auth/instagram/connect-link, which is where the
// admin/owner authorization check happens.

// Scopes live in @/lib/instagram-graph/scopes — Advanced-Access permissions
// only. Requesting a Standard-Access permission here can fail the consent
// screen for anyone without a role in the Meta app (i.e. every real customer).

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '';

  const verified = verifyConnectToken(req.nextUrl.searchParams.get('token'));
  if (!verified) {
    console.warn('[IG OAuth] Rejected connect attempt with a missing/invalid/expired token');
    return NextResponse.redirect(
      new URL('/instagram/connected?error=invalid_or_expired_link', req.url),
    );
  }
  const accountId = verified.accountId;

  if (!INSTAGRAM_APP_ID) {
    return NextResponse.json(
      { error: 'Instagram App ID not configured' },
      { status: 500 },
    );
  }

  // redirect_uri — MUST match exactly an entry in Meta App Dashboard's
  // "Valid OAuth Redirect URIs" allowlist. Derive from the request origin so
  // the URI matches whichever domain the user is browsing on (and avoids the
  // trailing-newline bug in NEXT_PUBLIC_APP_URL on Vercel).
  const redirectUri = `${req.nextUrl.origin}/api/auth/instagram/callback`;

  // State parameter — passed through OAuth flow and returned in callback.
  // Carries the accountId (to link the connection) and an optional returnTo
  // (so the admin console can send the user back to itself after reconnect).
  const state = encodeURIComponent(JSON.stringify({ accountId, returnTo }));

  // Build Instagram OAuth URL
  const authUrl = new URL('https://www.instagram.com/oauth/authorize');
  authUrl.searchParams.set('client_id', INSTAGRAM_APP_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', IG_OAUTH_SCOPE_PARAM);
  authUrl.searchParams.set('state', state);

  console.log(`[IG OAuth] Redirecting to Instagram login for account ${accountId}`);

  return NextResponse.redirect(authUrl.toString());
}
