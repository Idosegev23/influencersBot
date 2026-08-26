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
 * Exchange the Embedded Signup code for a business integration system-user token.
 *
 * Meta rejects our documented-form request with "Invalid verification code format" even though
 * the code arrives intact (430 chars, correct prefix, no whitespace) and the app secret is
 * provably right — the same secret validates every inbound webhook signature. That message is
 * also returned for a WRONG secret and for a malformed code alike, so it carries no signal.
 *
 * Rather than guess again, try the plausible request shapes in order and record which one Meta
 * accepts. A rejected code is not consumed, so a failed attempt costs nothing. Once production
 * tells us the answer, collapse this back to the single winning form.
 */
export async function exchangeEsCode(code: string, redirectUri?: string): Promise<string> {
  // TRIM. Vercel persists env values with a trailing newline often enough that
  // src/lib/whatsapp-cloud/signature.ts already defends against it — and because that file
  // trimmed and this one did not, webhook signatures verified perfectly while every code
  // exchange came back "Error validating client secret". The same secret, two behaviours.
  const appId = (process.env.NEXT_PUBLIC_FB_APP_ID || '').trim();
  const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!appId || !appSecret) {
    throw new Error('NEXT_PUBLIC_FB_APP_ID and WHATSAPP_APP_SECRET are required to exchange an ES code');
  }

  // Character classes only — the code is single-use and short-lived but still a credential.
  console.log('[wa-connect] exchanging code', {
    length: code?.length ?? 0,
    prefix: typeof code === 'string' ? code.slice(0, 6) : null,
    hasWhitespace: /\s/.test(code),
    hasPlus: code.includes('+'), hasSlash: code.includes('/'),
    hasEquals: code.includes('='), hasPercent: code.includes('%'), hasHash: code.includes('#'),
    redirectUri: redirectUri ?? null,
    appId,
    secretTrimmed: (process.env.WHATSAPP_APP_SECRET || '').length !== appSecret.length,
    appIdTrimmed: (process.env.NEXT_PUBLIC_FB_APP_ID || '').length !== appId.length,
  });

  const base: Record<string, string> = { client_id: appId, client_secret: appSecret, code };
  const attempts: Array<{ name: string; params: Record<string, string> }> = [
    { name: 'plain', params: base },
    { name: 'grant_type', params: { ...base, grant_type: 'authorization_code' } },
  ];
  if (redirectUri) {
    attempts.push({ name: 'redirect_uri', params: { ...base, redirect_uri: redirectUri } });
    attempts.push({ name: 'redirect_uri+grant_type', params: { ...base, redirect_uri: redirectUri, grant_type: 'authorization_code' } });
  }

  const failures: Array<Record<string, unknown>> = [];
  for (const attempt of attempts) {
    const res = await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams(attempt.params)}`, { method: 'GET' });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.access_token) {
      console.log('[wa-connect] exchange SUCCEEDED via', attempt.name);
      return data.access_token as string;
    }
    const e = data?.error ?? {};
    failures.push({
      attempt: attempt.name, status: res.status, code: e.code ?? null,
      subcode: e.error_subcode ?? null, type: e.type ?? null,
      message: typeof e.message === 'string' ? e.message.slice(0, 200) : null,
      fbtrace_id: e.fbtrace_id ?? null,
    });
  }

  console.error('[wa-connect] ES code exchange failed — every variant rejected', failures);
  const err: any = new Error('ES code exchange failed');
  err.metaDetail = failures;
  throw err;
}

/**
 * Prove the customer actually owns the WABA they claim.
 *
 * Any failure throws. Absence of `granular_scopes` is NOT permission — a malformed or
 * unexpected response must never be read as "probably fine".
 */
export async function assertWabaOwnership(token: string, wabaId: string): Promise<void> {
  // debug_token must be AUTHENTICATED BY THE APP, not by the token under inspection: Meta
  // answers "(#100) You must provide an app access token, or a user access token that is an
  // owner or developer of the app" otherwise. Inspecting a customer's token with itself works
  // only for our own system-user token, which is why it passed by hand and failed in the flow.
  const appId = (process.env.NEXT_PUBLIC_FB_APP_ID || '').trim();
  const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  const appToken = `${appId}|${appSecret}`;

  const url = `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => null);

  const scopes: any[] = data?.data?.granular_scopes ?? [];
  const granted = scopes.flatMap((g: any) => g?.target_ids ?? []);

  // Scope names and target ids are identifiers, not secrets. Without them a rejection here is
  // indistinguishable from a genuine ownership failure — and the claimed id may simply live
  // under a scope shape we did not anticipate.
  console.log('[wa-connect] ownership check', {
    claimedWabaId: wabaId,
    tokenType: data?.data?.type ?? null,
    appId: data?.data?.app_id ?? null,
    isValid: data?.data?.is_valid ?? null,
    scopeNames: scopes.map((g: any) => g?.scope),
    grantedTargetIds: granted,
    plainScopes: data?.data?.scopes ?? null,
    debugError: data?.error ?? data?.data?.error ?? null,
  });

  if (!granted.includes(wabaId)) {
    const err: any = new Error(`token does not grant access to WABA ${wabaId}`);
    err.ownershipDetail = { claimedWabaId: wabaId, grantedTargetIds: granted, scopeNames: scopes.map((g: any) => g?.scope) };
    throw err;
  }
}

/**
 * Coexistence's FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING event carries ONLY a waba_id — unlike
 * the standard flow, it never hands us a phone_number_id. We resolve it ourselves, after
 * ownership has been proved, and take the single number on the WABA.
 */
export async function resolvePhoneNumberId(token: string, wabaId: string): Promise<string> {
  const res = await fetch(`${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`phone_numbers lookup failed (status ${res.status})`);

  const numbers: any[] = data?.data ?? [];
  if (numbers.length === 0) throw new Error(`WABA ${wabaId} has no phone numbers`);
  // v1 is one number per account (spec §2). More than one means a business we cannot model
  // yet, and silently picking the first would bind the wrong number to the customer.
  if (numbers.length > 1) throw new Error(`WABA ${wabaId} has ${numbers.length} phone numbers; v1 supports exactly one`);
  return String(numbers[0].id);
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

/**
 * Disconnect a customer's channel.
 *
 * Order matters: unsubscribe first so no further inbound arrives, then destroy the credential,
 * then mark the row. The Vault secret is DELETED, not flagged — a disconnected channel that
 * still holds a working token is a credential we have no reason to keep and no UI to see.
 *
 * A failed unsubscribe does NOT abort: leaving a live token behind because a remote call
 * errored would be the worse of the two outcomes.
 */
export async function disconnectChannel(channelId: string): Promise<void> {
  const { supabase } = await import('@/lib/supabase');
  const { deleteToken, readToken } = await import('@/lib/whatsapp-cloud/channel-tokens');

  const { data: row } = await supabase
    .from('whatsapp_channels')
    .select('id, waba_id, token_secret_id, account_id, phone_number_id')
    .eq('id', channelId)
    .maybeSingle();
  if (!row) return;

  const secretId = (row as any).token_secret_id as string | null;

  if (secretId) {
    try {
      const token = await readToken(secretId);
      const res = await fetch(`${GRAPH}/${(row as any).waba_id}/subscribed_apps`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) console.warn('[disconnect] unsubscribe failed; continuing to revoke', res.status);
    } catch (e) {
      console.warn('[disconnect] unsubscribe threw; continuing to revoke', e);
    }

    try { await deleteToken(secretId); }
    catch (e) { console.error('[disconnect] VAULT SECRET NOT DELETED — revoke manually', { channelId, secretId, e }); }
  }

  await supabase
    .from('whatsapp_channels')
    .update({ status: 'disconnected', token_secret_id: null, payment_ready: false })
    .eq('id', channelId);

  // Without this the 60s resolver cache would keep serving the channel — and keep sending
  // from a number we just revoked access to.
  const { invalidateChannelCache } = await import('@/lib/whatsapp-cloud/channels');
  await invalidateChannelCache({
    accountId: (row as any).account_id,
    phoneNumberId: (row as any).phone_number_id,
  }).catch(() => {});
}
