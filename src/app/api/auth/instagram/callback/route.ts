/**
 * Instagram OAuth Callback
 * GET /api/auth/instagram/callback
 *
 * אחרי שהאינפלואנסר מאשר הרשאות באינסטגרם, הוא מופנה לכאן עם authorization code.
 * אנחנו מחליפים את הקוד ב-access token ושומרים בדאטאבייס.
 *
 * Flow:
 * 1. User clicks "Connect Instagram" → redirected to Instagram OAuth
 * 2. User approves permissions → redirected here with ?code=...
 * 3. We exchange code for short-lived token
 * 4. We exchange short-lived token for long-lived token (60 days)
 * 5. We fetch IG business account info and save everything to DB
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID || '';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';
const GRAPH_API_VERSION = 'v22.0';
const FB_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state'); // Contains accountId if we passed it

  // Parse state to get accountId for redirect
  let accountId = '';
  if (state) {
    try { accountId = JSON.parse(decodeURIComponent(state)).accountId || ''; } catch {}
  }
  const redirectBase = accountId ? `/admin/influencers/${accountId}` : '/admin/influencers';

  // Handle user declining permissions
  if (error) {
    console.error('[IG OAuth] User denied permissions:', error);
    return NextResponse.redirect(
      new URL(`/instagram/connected?error=${encodeURIComponent(error)}`, req.url),
    );
  }

  if (!code) {
    console.error('[IG OAuth] No authorization code received');
    return NextResponse.redirect(
      new URL(`/instagram/connected?error=no_code`, req.url),
    );
  }

  try {
    // Hardcoded redirect_uri — MUST match exactly in Meta Developer Console + connect route
    const redirectUri = 'https://influencers-bot.vercel.app/api/auth/instagram/callback';

    // 1. Exchange authorization code for short-lived access token
    console.log('[IG OAuth] Exchanging code for short-lived token...');
    const shortLivedToken = await exchangeCodeForToken(code, redirectUri);

    // 2. Exchange short-lived token for long-lived token (60 days)
    console.log('[IG OAuth] Exchanging for long-lived token...');
    const longLivedToken = await exchangeLongLivedToken(shortLivedToken.access_token);

    // 3. Get Instagram Business Account info
    console.log('[IG OAuth] Fetching IG business account info...');
    const igAccount = await getIGBusinessAccount(longLivedToken.access_token);

    // 4. Save to database
    console.log('[IG OAuth] Saving connection to database...');
    const supabase = await createClient();

    const connectionData = {
      ig_business_account_id: igAccount.ig_id,
      ig_username: igAccount.username,
      ig_name: igAccount.name,
      ig_profile_pic: igAccount.profile_picture_url,
      ig_followers_count: igAccount.followers_count,
      access_token: longLivedToken.access_token,
      token_expires_at: new Date(Date.now() + longLivedToken.expires_in * 1000).toISOString(),
      token_type: 'long_lived',
      permissions: shortLivedToken.permissions || [],
      is_active: true,
      connected_at: new Date().toISOString(),
    };

    // Upsert — update if same IG account already connected
    const { error: dbError } = await supabase
      .from('ig_graph_connections')
      .upsert(connectionData, { onConflict: 'ig_business_account_id' });

    if (dbError) {
      console.error('[IG OAuth] Database error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    // 5. If state contains an account_id, link the connection
    if (state) {
      try {
        const stateData = JSON.parse(decodeURIComponent(state));
        if (stateData.accountId) {
          await supabase
            .from('ig_graph_connections')
            .update({ account_id: stateData.accountId })
            .eq('ig_business_account_id', igAccount.ig_id);
        }
      } catch {
        // State parsing failed — not critical
      }
    }

    console.log(`[IG OAuth] Successfully connected @${igAccount.username} (${igAccount.ig_id})`);

    // Redirect influencer to a simple "thank you" page (not admin dashboard)
    return NextResponse.redirect(
      new URL(`/instagram/connected?username=${encodeURIComponent(igAccount.username)}`, req.url),
    );

  } catch (error: any) {
    console.error('[IG OAuth] Error:', error.message);
    return NextResponse.redirect(
      new URL(`/instagram/connected?error=${encodeURIComponent(error.message)}`, req.url),
    );
  }
}

// ============================================
// Token Exchange Functions
// ============================================

interface ShortLivedTokenResponse {
  access_token: string;
  user_id: string;
  permissions?: string[];
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds (typically 5184000 = 60 days)
}

/**
 * Exchange authorization code for short-lived access token
 */
async function exchangeCodeForToken(code: string, redirectUri: string): Promise<ShortLivedTokenResponse> {
  const params = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    client_secret: INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(`https://api.instagram.com/oauth/access_token`, {
    method: 'POST',
    body: params,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error_message: 'Unknown error' }));
    throw new Error(`Token exchange failed: ${error.error_message || JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * Exchange short-lived token for long-lived token (60 days)
 */
async function exchangeLongLivedToken(shortLivedToken: string): Promise<LongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: INSTAGRAM_APP_SECRET,
    access_token: shortLivedToken,
  });

  const response = await fetch(`${FB_GRAPH_BASE}/access_token?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(`Long-lived token exchange failed: ${error.error?.message || JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * Get Instagram Business Account details using the access token
 */
async function getIGBusinessAccount(accessToken: string): Promise<{
  ig_id: string;
  username: string;
  name: string;
  profile_picture_url: string;
  followers_count: number;
}> {
  // Get user's IG account info
  const fields = 'id,username,name,profile_picture_url,followers_count,media_count';
  const response = await fetch(
    `https://graph.instagram.com/me?fields=${fields}&access_token=${accessToken}`,
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(`IG profile fetch failed: ${error.error?.message || JSON.stringify(error)}`);
  }

  const data = await response.json();
  return {
    ig_id: data.id,
    username: data.username || '',
    name: data.name || '',
    profile_picture_url: data.profile_picture_url || '',
    followers_count: data.followers_count || 0,
  };
}
