/**
 * Per-account webhook subscription.
 *
 * Storing a connection row is NOT enough to receive DMs: Instagram only
 * delivers `messages` webhooks for accounts that have explicitly subscribed the
 * app via POST /me/subscribed_apps. Without this call a freshly connected
 * account looks connected everywhere in the UI and silently receives nothing.
 *
 * Called from two places:
 *   - the OAuth callback, immediately after the connection is saved (the fix)
 *   - the ig-connection-health cron, as the daily self-heal net
 */

const GRAPH_BASE = 'https://graph.instagram.com/v22.0';

/**
 * Subscribe this app to the account's `messages` webhook field.
 * Returns true on success. Never throws — callers treat failure as non-fatal
 * (the health cron retries daily).
 */
export async function subscribeMessagesWebhook(token: string): Promise<boolean> {
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

/**
 * Which webhook fields the account currently has subscribed, or null if the
 * lookup itself failed (so callers can tell "not subscribed" from "unknown").
 */
export async function getSubscribedFields(token: string): Promise<Set<string> | null> {
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
