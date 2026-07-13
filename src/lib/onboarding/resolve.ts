import { supabase } from '@/lib/supabase';

/** Resolve a draft account by its onboarding token (the token IS the auth). */
export async function resolveDraftByToken(token: string): Promise<{ id: string; config: any } | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('config->onboarding->>token', token)
    .maybeSingle();
  return (data as { id: string; config: any } | null) || null;
}
