/**
 * Instagram OAuth — Start Connection Flow
 * GET /api/auth/instagram/connect?accountId=xxx
 *
 * מפנה את האינפלואנסר לעמוד ההרשאות של אינסטגרם.
 * אחרי שהוא מאשר — הוא חוזר ל-/api/auth/instagram/callback
 */

import { NextRequest, NextResponse } from 'next/server';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID || '';

// Scopes to request — these are the permissions we need
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
  'instagram_business_content_publish',
  'instagram_business_manage_insights',
].join(',');

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId') || '';

  if (!INSTAGRAM_APP_ID) {
    return NextResponse.json(
      { error: 'Instagram App ID not configured' },
      { status: 500 },
    );
  }

  // Hardcoded redirect_uri — MUST match exactly in Meta Developer Console + callback route
  const redirectUri = 'https://influencers-bot.vercel.app/api/auth/instagram/callback';

  // State parameter — passed through OAuth flow and returned in callback
  // Contains the accountId so we can link the connection to the right account
  const state = encodeURIComponent(JSON.stringify({ accountId }));

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
