/**
 * Tenant isolation for the partner API: the one place that decides which
 * partner and association a request may act for.
 */
import { supabase } from '@/lib/supabase';

export interface Tenant { partnerId: string; accountId: string | null; host: string }
export interface AssociationTenant extends Tenant { accountId: string }

export type TenantResult =
  | { ok: true; tenant: Tenant }
  | { ok: false; status: 401 | 403 | 404; error: string };

export async function resolveTenant(keyHash: string, host: string): Promise<TenantResult> {
  const { data: key } = await supabase
    .from('partner_api_keys').select('id, partner_id, status').eq('key_hash', keyHash).maybeSingle();
  if (!key || key.status !== 'active') return { ok: false, status: 401, error: 'invalid_key' };

  const { data: dom } = await supabase
    .from('tenant_domains').select('host, partner_id, account_id').eq('host', host).maybeSingle();
  if (!dom) return { ok: false, status: 404, error: 'unknown_host' };
  if (dom.partner_id !== key.partner_id) return { ok: false, status: 403, error: 'host_not_owned' };

  supabase.from('partner_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)
    .then(() => {}, (e: unknown) => console.error('[copilot/tenant] last_used_at', e));

  return { ok: true, tenant: { partnerId: key.partner_id, accountId: dom.account_id, host } };
}
