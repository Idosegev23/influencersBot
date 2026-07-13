/**
 * Instagram OAuth — Start Connection Flow
 * GET /api/auth/instagram/connect?accountId=xxx
 *
 * מפנה את האינפלואנסר לעמוד ההרשאות של אינסטגרם.
 * אחרי שהוא מאשר — הוא חוזר ל-/api/auth/instagram/callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID || '';

/**
 * Only the account's owner (influencer session) or an admin may start an OAuth
 * that links Instagram to this accountId — otherwise anyone could connect their
 * own Instagram to someone else's account (connect-IDOR).
 * Returns the account's username (for a friendly login redirect) when unauthorized.
 */
async function authorizeConnect(accountId: string): Promise<{ ok: boolean; username: string | null }> {
  if (!accountId) return { ok: false, username: null };
  const denied = await requireAdminAuth();
  if (!denied) return { ok: true, username: null }; // admin session
  const { data: acct } = await supabase.from('accounts').select('config').eq('id', accountId).maybeSingle();
  const username = ((acct?.config as any)?.username as string) || null;
  if (username && (await checkInfluencerAuth(username))) return { ok: true, username };
  return { ok: false, username };
}

// Scopes to request — these are the permissions we need
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
  'instagram_business_manage_insights',
].join(',');

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId') || '';
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '';

  if (!INSTAGRAM_APP_ID) {
    return NextResponse.json(
      { error: 'Instagram App ID not configured' },
      { status: 500 },
    );
  }

  // Only the owner of this account (or an admin) may start the connect flow.
  const authz = await authorizeConnect(accountId);
  if (!authz.ok) {
    const dest = authz.username ? `/influencer/${authz.username}/login` : '/';
    return NextResponse.redirect(new URL(dest, req.nextUrl.origin));
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
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);

  console.log(`[IG OAuth] Redirecting to Instagram login for account ${accountId}`);

  return NextResponse.redirect(authUrl.toString());
}
