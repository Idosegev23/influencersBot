import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { exchangeCodeForTokens } from '@/lib/integrations/google-calendar';

/**
 * GET /api/integrations/google-calendar/callback
 * Callback מGoogle OAuth - שומר את הtokens
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${error}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=missing_code', request.url)
    );
  }

  const userId = state;
  const supabase = createClient();

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to get tokens from Google');
    }

    // Get user's account
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', userId)
      .single();

    if (!account) {
      throw new Error('Account not found');
    }

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expiry_date || 3600));

    // Save or update connection
    const { error: upsertError } = await supabase
      .from('calendar_connections')
      .upsert({
        user_id: userId,
        account_id: account.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        calendar_id: 'primary',
        sync_enabled: true,
        last_sync_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (upsertError) throw upsertError;

    // Redirect back to settings with success
    return NextResponse.redirect(
      new URL('/settings/integrations?calendar_connected=true', request.url)
    );
  } catch (error: any) {
    console.error('Error in calendar callback:', error);
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}
