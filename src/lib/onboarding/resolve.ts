import { supabase } from '@/lib/supabase';

/** Statuses during which the onboarding token is still a live setup credential.
 *  Once the account is 'ready', the token no longer resolves (stale share links die). */
const ACTIVE_ONBOARDING = ['draft', 'filled', 'starting', 'scanning'];

/** Resolve a draft account by its onboarding token (the token IS the auth). */
export async function resolveDraftByToken(token: string): Promise<{ id: string; config: any } | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('config->onboarding->>token', token)
    .in('config->onboarding->>status', ACTIVE_ONBOARDING)
    .maybeSingle();
  return (data as { id: string; config: any } | null) || null;
}
