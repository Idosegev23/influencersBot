/**
 * Instagram connection health + self-heal.
 *
 * The recurring, silent failure mode for IG DM bots is: a long-lived token
 * expires (60 days) or the per-account `messages` webhook subscription drops,
 * and nobody notices until someone says "the bot stopped replying" — weeks
 * later. This module is the safety net, run by the ig-connection-health cron:
 *
 *   1. Refresh tokens that are about to expire (keeps connections alive).
 *   2. For every active connection whose account has the DM bot ON, verify the
 *      token (/me) and that the `messages` webhook is subscribed — re-subscribe
 *      automatically if it fell off.
 *   3. Count inbound DMs that could not be routed to an account in the last 24h
 *      (logged to ig_webhook_issues by the webhook handler) so silent drops
 *      become a visible signal.
 *
 * Anything it can't self-heal is returned in `problems` for the cron to email.
 */

import { supabase } from '@/lib/supabase';
import { refreshExpiringTokens } from './token-refresh';

const GRAPH_BASE = 'https://graph.instagram.com/v22.0';

export interface IgHealthReport {
  refreshed: number;
  refreshFailed: number;
  checked: number;          // active connections with dm_bot ON that we inspected
  resubscribed: string[];   // accounts we auto-fixed (re-added messages webhook)
  problems: string[];       // anything needing human attention
  unresolvedWebhooks24h: number;
}

async function meCheck(token: string): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me?fields=id,username,user_id&access_token=${encodeURIComponent(token)}`);
    if (res.ok) return { ok: true, status: res.status };
    const body = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, error: body?.error?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message || 'fetch failed' };
  }
}

async function getSubscribedFields(token: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me/subscribed_apps?access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    const fields = new Set<string>();
    for (const app of json.data || []) for (const f of app.subscribed_fields || []) fields.add(f);
    return fields;
  } catch {
    return null;
  }
}

async function subscribeMessages(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/me/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(token)}`,
      { method: 'POST' },
    );
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    return json.success !== false;
  } catch {
    return false;
  }
}

export async function runIgConnectionHealth(): Promise<IgHealthReport> {
  // 1. Keep tokens alive — the core recurring failure.
  const refresh = await refreshExpiringTokens();

  const report: IgHealthReport = {
    refreshed: refresh.refreshed,
    refreshFailed: refresh.failed,
    checked: 0,
    resubscribed: [],
    problems: refresh.errors.map((e) => `token refresh: ${e}`),
    unresolvedWebhooks24h: 0,
  };

  // 2. Verify token + webhook subscription for every active connection whose
  //    account is actively relying on DMs (dm_bot_enabled === true).
  const { data: conns } = await supabase
    .from('ig_graph_connections')
    .select('account_id, ig_username, access_token, token_expires_at')
    .eq('is_active', true);

  for (const conn of conns || []) {
    const { data: acct } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', conn.account_id)
      .maybeSingle();
    if ((acct?.config as any)?.dm_bot_enabled !== true) continue;
    report.checked++;

    const label = `@${conn.ig_username}`;

    if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now()) {
      report.problems.push(`${label}: token EXPIRED (${conn.token_expires_at}) — needs reconnect`);
      continue;
    }

    const me = await meCheck(conn.access_token);
    if (!me.ok) {
      report.problems.push(`${label}: token invalid (/me ${me.status}: ${me.error}) — needs reconnect`);
      continue;
    }

    const fields = await getSubscribedFields(conn.access_token);
    if (fields === null) {
      report.problems.push(`${label}: could not read webhook subscription`);
      continue;
    }
    if (!fields.has('messages')) {
      const ok = await subscribeMessages(conn.access_token);
      if (ok) report.resubscribed.push(label);
      else report.problems.push(`${label}: messages webhook MISSING and auto re-subscribe failed`);
    }
  }

  // 3. Surface silent drops — inbound DMs that matched no account in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('ig_webhook_issues')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  report.unresolvedWebhooks24h = count || 0;

  return report;
}
