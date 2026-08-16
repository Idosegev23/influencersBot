/**
 * Turning an Embedded Signup handshake into a working channel.
 *
 * Two rules govern this file:
 *   1. The browser is untrusted. It supplies waba_id and phone_number_id; only Meta's own
 *      view of the token decides whether the customer may act on them.
 *   2. The ES code lives ~30 seconds. Exchange it in the request that received it — never
 *      queue it, never retry it later.
 */

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}`;

/**
 * Exchange the Embedded Signup code for a business-integration system-user token.
 *
 * Sent as a POST body rather than a query string: the app secret would otherwise land in
 * access logs, proxies and error traces along the way.
 */
export async function exchangeEsCode(code: string): Promise<string> {
  const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('NEXT_PUBLIC_FB_APP_ID and WHATSAPP_APP_SECRET are required to exchange an ES code');
  }

  const res = await fetch(`${GRAPH}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: appId, client_secret: appSecret, code }).toString(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    // Deliberately does not echo the body — it can contain the code and error detail we
    // do not want in logs. The status is enough to triage.
    throw new Error(`ES code exchange failed (status ${res.status})`);
  }
  return data.access_token as string;
}

/**
 * Prove the customer actually owns the WABA they claim.
 *
 * Any failure throws. Absence of `granular_scopes` is NOT permission — a malformed or
 * unexpected response must never be read as "probably fine".
 */
export async function assertWabaOwnership(token: string, wabaId: string): Promise<void> {
  const url = `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`debug_token failed (status ${res.status})`);

  const granted: string[] = (data?.data?.granular_scopes ?? []).flatMap((g: any) => g?.target_ids ?? []);
  if (!granted.includes(wabaId)) {
    throw new Error(`token does not grant access to WABA ${wabaId}`);
  }
}

// ---------------------------------------------------------------------------
// Provisioning chain (spec §5)
// ---------------------------------------------------------------------------

export interface ProvisionResult {
  ok: boolean;
  channelId?: string;
  state: Record<string, boolean>;
  failedStep?: string;
}

async function graph(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/**
 * Idempotent, resumable. Progress is written to whatsapp_channels.provision_state so a retry
 * can tell what already happened. Runs inline (seconds) — no queue, because the ES code that
 * produced the token has already been spent and cannot be replayed.
 */
export async function runProvisioningChain(args: {
  accountId: string; accessToken: string; wabaId: string; phoneNumberId: string;
}): Promise<ProvisionResult> {
  const { accountId, accessToken, wabaId, phoneNumberId } = args;
  const { supabase } = await import('@/lib/supabase');
  const { storeToken } = await import('@/lib/whatsapp-cloud/channel-tokens');
  const { createCsTemplates } = await import('@/lib/whatsapp-cloud/cs-templates');
  const state: Record<string, boolean> = {};

  // 1. token → Vault. Nothing else may happen while the credential is still in memory only.
  let secretId: string;
  try { secretId = await storeToken(accessToken); state.vault = true; }
  catch (e) { console.error('[provision] vault store failed', e); return { ok: false, state, failedStep: 'vault' }; }

  // 2. Subscribe our webhook to THEIR WABA. Without this no inbound ever arrives, so a channel
  //    row created past this point would look connected while being deaf — halt instead.
  const sub = await graph(`/${wabaId}/subscribed_apps`, accessToken, { method: 'POST' });
  state.subscribed_apps = sub.ok;
  if (!sub.ok) {
    console.error('[provision] subscribed_apps failed', sub.status, sub.data);
    return { ok: false, state, failedStep: 'subscribed_apps' };
  }

  // 3. Channel row — 'pending' until the billing probe promotes it.
  const { data: row, error } = await supabase
    .from('whatsapp_channels')
    .upsert({
      account_id: accountId, waba_id: wabaId, phone_number_id: phoneNumberId,
      token_secret_id: secretId, onboarding_mode: 'coexistence', status: 'pending',
      connected_at: new Date().toISOString(), provision_state: state,
    }, { onConflict: 'account_id' })
    .select('id')
    .single();
  if (error || !row) {
    console.error('[provision] channel row upsert failed', error);
    return { ok: false, state, failedStep: 'channel_row' };
  }
  state.channel_row = true;
  const channelId = (row as any).id as string;

  // 4. Coexistence sync — mandatory and time-boxed: Meta offboards the customer if the business
  //    does not initiate within 24h. The payloads that come back are ACKed and DISCARDED (D6).
  const syncs = await Promise.all([
    graph(`/${phoneNumberId}/smb_app_data`, accessToken, {
      method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'smb_app_state_sync' }),
    }),
    graph(`/${phoneNumberId}/smb_app_data`, accessToken, {
      method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'history' }),
    }),
  ]);
  state.coexistence_sync = syncs.every((s) => s.ok);
  await supabase.from('whatsapp_channels')
    // Only stamp the clock when it actually started. A false stamp would hide a missed deadline.
    .update({ sync_initiated_at: state.coexistence_sync ? new Date().toISOString() : null, provision_state: { ...state } })
    .eq('id', channelId);

  if (!state.coexistence_sync) {
    // 24h is unforgiving, so this has to reach a person rather than only a log. Uses the
    // approved support_freeform_message template — params must be newline-free.
    try {
      const { sendSupportFreeformMessage } = await import('@/lib/whatsapp-notify');
      const ops = process.env.ITAMAR_WHATSAPP_NUMBER;
      if (ops) {
        await sendSupportFreeformMessage({
          to: ops,
          customerFirstName: 'צוות',
          brand: 'Bestie',
          content: `Coexistence sync FAILED for account ${accountId} (phone_number_id ${phoneNumberId}). 24h deadline before Meta offboards this customer.`,
        });
      } else {
        console.error('[provision] no ops number configured — coexistence sync failure is LOG ONLY');
      }
    } catch (e) { console.error('[provision] ops alert failed', e); }
  }

  // 5. Templates — best effort. Reply-only still works, so a rejection must not fail the connect.
  state.templates = await createCsTemplates(accessToken, wabaId, accountId).catch(() => false);

  await supabase.from('whatsapp_channels').update({ provision_state: { ...state } }).eq('id', channelId);
  return { ok: true, channelId, state };
}
