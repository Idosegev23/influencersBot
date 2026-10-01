import { supabase } from '@/lib/supabase';

/** The association's identify/newsletter secret, from Vault. Null when not configured. */
export async function getIdentifySecret(accountId: string): Promise<string | null> {
  const { data: acc, error: accErr } = await supabase.from('accounts').select('config').eq('id', accountId).maybeSingle();
  // A failed read is an outage, not "not configured": throw so the route answers 500, not 409.
  if (accErr) throw new Error(`account read failed: ${accErr.message}`);
  const ref = (acc?.config as any)?.copilot?.identify_secret_ref;
  if (typeof ref !== 'string' || !ref) return null;
  const { data, error } = await supabase.rpc('copilot_read_secret', { p_secret_id: ref });
  if (error) {
    console.error('[copilot/secrets] read failed', accountId, error.message);
    return null;
  }
  return typeof data === 'string' && data ? data : null;
}
