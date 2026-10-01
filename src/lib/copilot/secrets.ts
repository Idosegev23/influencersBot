import { supabase } from '@/lib/supabase';

/** The association's identify/newsletter secret, from Vault. Null when not configured. */
export async function getIdentifySecret(accountId: string): Promise<string | null> {
  const { data: acc } = await supabase.from('accounts').select('config').eq('id', accountId).maybeSingle();
  const ref = (acc?.config as any)?.copilot?.identify_secret_ref;
  if (typeof ref !== 'string' || !ref) return null;
  const { data, error } = await supabase.rpc('copilot_read_secret', { p_secret_id: ref });
  if (error) {
    console.error('[copilot/secrets] read failed', accountId, error.message);
    return null;
  }
  return typeof data === 'string' && data ? data : null;
}
