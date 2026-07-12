import { supabase } from '@/lib/supabase';

export interface IgConnection {
  igId: string;
  accessToken: string;
  username: string;
}

/**
 * Resolve the newest ACTIVE Instagram connection for an account.
 * Returns null when none is connected. Uses order + limit + maybeSingle so it
 * tolerates the historical "two active rows" state (never throws like .single()).
 */
export async function getIgConnectionForAccount(accountId: string): Promise<IgConnection | null> {
  const { data, error } = await supabase
    .from('ig_graph_connections')
    .select('ig_business_account_id, access_token, ig_username, is_active, connected_at')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.access_token || !data.ig_business_account_id) return null;
  return {
    igId: data.ig_business_account_id,
    accessToken: data.access_token,
    username: data.ig_username,
  };
}
