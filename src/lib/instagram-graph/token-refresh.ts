/**
 * Instagram Graph API — Token Refresh
 * Long-lived tokens last 60 days but need to be refreshed before expiry.
 * This should run as a cron job (e.g., weekly) to keep tokens alive.
 */

import { createClient } from '@/lib/supabase/server';

const GRAPH_API_VERSION = 'v22.0';
const FB_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Refresh all tokens that expire within the next 7 days
 */
export async function refreshExpiringTokens(): Promise<{
  refreshed: number;
  failed: number;
  errors: string[];
}> {
  const supabase = createClient();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find tokens expiring within 7 days
  const { data: connections, error } = await supabase
    .from('ig_graph_connections')
    .select('id, ig_business_account_id, ig_username, access_token, token_expires_at')
    .eq('is_active', true)
    .lt('token_expires_at', sevenDaysFromNow);

  if (error) {
    console.error('[Token Refresh] DB query error:', error);
    return { refreshed: 0, failed: 0, errors: [error.message] };
  }

  if (!connections?.length) {
    console.log('[Token Refresh] No tokens need refreshing');
    return { refreshed: 0, failed: 0, errors: [] };
  }

  console.log(`[Token Refresh] Found ${connections.length} tokens to refresh`);

  let refreshed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const conn of connections) {
    try {
      // Refresh the long-lived token
      const params = new URLSearchParams({
        grant_type: 'ig_refresh_token',
        access_token: conn.access_token,
      });

      const response = await fetch(`${FB_GRAPH_BASE}/refresh_access_token?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Update in database
      await supabase
        .from('ig_graph_connections')
        .update({
          access_token: data.access_token,
          token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
          token_type: 'long_lived',
        })
        .eq('id', conn.id);

      console.log(`[Token Refresh] Refreshed token for @${conn.ig_username}`);
      refreshed++;
    } catch (err: any) {
      console.error(`[Token Refresh] Failed for @${conn.ig_username}:`, err.message);
      errors.push(`@${conn.ig_username}: ${err.message}`);
      failed++;

      // If refresh completely fails, mark connection as needing re-auth
      if (err.message.includes('expired') || err.message.includes('invalid')) {
        await supabase
          .from('ig_graph_connections')
          .update({ is_active: false })
          .eq('id', conn.id);
      }
    }
  }

  return { refreshed, failed, errors };
}
