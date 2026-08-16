import { supabase } from '@/lib/supabase';

/**
 * Access tokens for BYO WhatsApp channels live in Supabase Vault, never in a table column.
 * These three wrappers are the only way in or out — the underlying SECURITY DEFINER
 * functions are granted to service_role alone (migration 075).
 */

export async function storeToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('wa_channel_store_token', { p_token: token });
  if (error) throw new Error(`wa_channel_store_token failed: ${error.message}`);
  if (!data) throw new Error('wa_channel_store_token returned no secret id');
  return data as string;
}

export async function readToken(secretId: string): Promise<string> {
  const { data, error } = await supabase.rpc('wa_channel_read_token', { p_secret_id: secretId });
  if (error) throw new Error(`wa_channel_read_token failed: ${error.message}`);
  if (!data) throw new Error(`WhatsApp channel token not found for secret ${secretId}`);
  return data as string;
}

/** Disconnect DELETES the secret — flagging the row is not enough (spec §2). */
export async function deleteToken(secretId: string): Promise<void> {
  if (!secretId) return;
  const { error } = await supabase.rpc('wa_channel_delete_token', { p_secret_id: secretId });
  if (error) throw new Error(`wa_channel_delete_token failed: ${error.message}`);
}
