#!/usr/bin/env node
/**
 * Verify (and, if missing, create) the Instagram `messages` webhook subscription
 * for an account's ACTIVE ig_graph_connections row.
 *
 * Instagram API with Instagram Login uses graph.instagram.com and the per-user
 * `me/subscribed_apps` edge. Our OAuth callback never subscribes the account to
 * the `messages` field, so a freshly-connected account receives no DM webhooks
 * until this runs once.
 *
 * Usage:
 *   node --env-file=.env scripts/ig-webhook-check.mjs <accountId> [--subscribe]
 *
 *   (no flag)      check only — report which fields are subscribed
 *   --subscribe    subscribe to `messages` if not already subscribed
 *
 * The access token is read from the DB and never printed.
 */

const GRAPH_BASE = 'https://graph.instagram.com/v22.0';

const accountId = process.argv[2];
const doSubscribe = process.argv.includes('--subscribe');

if (!accountId) {
  console.error('Usage: node --env-file=.env scripts/ig-webhook-check.mjs <accountId> [--subscribe]');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Use PostgREST directly (avoids supabase-js realtime/websocket dep on Node < 22).
const restUrl =
  `${SUPABASE_URL}/rest/v1/ig_graph_connections` +
  `?account_id=eq.${accountId}&is_active=eq.true` +
  `&select=ig_username,ig_business_account_id,access_token,token_expires_at,is_active` +
  `&order=connected_at.desc&limit=1`;

const dbRes = await fetch(restUrl, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
});
if (!dbRes.ok) { console.error('DB error:', dbRes.status, await dbRes.text()); process.exit(1); }
const rows = await dbRes.json();
const conn = Array.isArray(rows) ? rows[0] : null;
if (!conn) { console.error('No active ig_graph_connections row for account', accountId); process.exit(1); }

const token = conn.access_token;
console.log(`Active connection: @${conn.ig_username} (ig_business_account_id=${conn.ig_business_account_id})`);
console.log(`Token expires: ${conn.token_expires_at}`);

async function getSubscribedFields() {
  const res = await fetch(`${GRAPH_BASE}/me/subscribed_apps?access_token=${encodeURIComponent(token)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('GET subscribed_apps failed:', res.status, JSON.stringify(json));
    return null;
  }
  const fields = new Set();
  for (const app of json.data || []) {
    for (const f of app.subscribed_fields || []) fields.add(f);
  }
  return fields;
}

let fields = await getSubscribedFields();
if (fields === null) process.exit(1);

console.log('Subscribed fields:', fields.size ? [...fields].join(', ') : '(none)');
const hasMessages = fields.has('messages');
console.log(hasMessages ? '✓ messages webhook IS subscribed' : '✗ messages webhook NOT subscribed');

if (!hasMessages && doSubscribe) {
  console.log('Subscribing to `messages`...');
  const res = await fetch(
    `${GRAPH_BASE}/me/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(token)}`,
    { method: 'POST' },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    console.error('Subscribe failed:', res.status, JSON.stringify(json));
    process.exit(1);
  }
  console.log('Subscribe response:', JSON.stringify(json));
  fields = await getSubscribedFields();
  console.log('Subscribed fields now:', fields && fields.size ? [...fields].join(', ') : '(none)');
  console.log(fields && fields.has('messages') ? '✓ confirmed messages subscribed' : '✗ still not subscribed — check App-level webhook config in Meta dashboard');
} else if (!hasMessages) {
  console.log('Run again with --subscribe to subscribe.');
}
