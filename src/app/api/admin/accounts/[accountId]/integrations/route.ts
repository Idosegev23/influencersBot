/**
 * Store API integration config for an account.
 *
 *  GET  /api/admin/accounts/[id]/integrations
 *    → { integrations: { shopify?: {...}, quickshop?: {...}, ... } }
 *      (api_token / admin_api_token / api_key / webhook_secret are masked —
 *      never returned in full; webhook_token is not a secret, it's the path
 *      segment the QuickShop webhook route resolves the account by)
 *
 *  PUT  /api/admin/accounts/[id]/integrations
 *    body (shopify):   { platform: 'shopify', shop_domain, api_token?, enabled }
 *    body (quickshop):  { platform: 'quickshop', api_key?, webhook_secret?, webhook_token?, enabled }
 *    → merges into accounts.config.integrations[platform]
 *
 * This is the "field to interface from in the future" — it persists store
 * credentials now (reusing the config.integrations.shopify shape that
 * /api/shopify order-lookup already reads, and the config.integrations.quickshop
 * shape the QuickShop webhook route + lookupOrder facade read) so runtime
 * lookups actually work once provisioned. Admin-only; secrets are write-only
 * from the UI's perspective — a masked/empty submitted value never overwrites
 * the stored secret (see buildIntegrationPatch).
 *
 * Shopify reconcile: the admin form historically sent `api_token` but the
 * lookup (`lookupShopifyOrder` / `src/lib/orders/lookup.ts`) reads
 * `admin_api_token`. This route now persists Shopify writes under
 * `admin_api_token` (accepting `api_token` from the request body, or
 * `admin_api_token` directly) so the two agree.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

const SUPPORTED_PLATFORMS = ['shopify', 'quickshop', 'woocommerce', 'other'] as const;
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

function maskToken(t: unknown): string | null {
  if (typeof t !== 'string' || !t) return null;
  if (t.length <= 4) return '••••';
  return '••••' + t.slice(-4);
}

/**
 * Build the merged integration config for a platform.
 * - Shopify: writes admin_api_token (the field lookupShopifyOrder reads) from the UI's api_token.
 * - QuickShop: writes api_key / webhook_secret / webhook_token.
 * Secret fields are only overwritten when a fresh, non-masked value is provided.
 */
export function buildIntegrationPatch(
  platform: Platform,
  existing: Record<string, any>,
  body: Record<string, any>,
): Record<string, any> {
  const fresh = (v: unknown): v is string =>
    typeof v === 'string' && v.trim() !== '' && !v.startsWith('••••');

  const next: Record<string, any> = {
    ...existing,
    shop_domain: typeof body.shop_domain === 'string' ? body.shop_domain.trim() : existing.shop_domain || '',
    enabled: body.enabled === true,
  };

  if (platform === 'shopify') {
    // Reconcile: the admin UI sends `api_token`; the lookup reads `admin_api_token`.
    if (fresh(body.api_token)) next.admin_api_token = body.api_token.trim();
    else if (fresh(body.admin_api_token)) next.admin_api_token = body.admin_api_token.trim();
  } else if (platform === 'quickshop') {
    if (fresh(body.api_key)) next.api_key = body.api_key.trim();
    if (fresh(body.webhook_secret)) next.webhook_secret = body.webhook_secret.trim();
    if (typeof body.webhook_token === 'string' && body.webhook_token.trim()) next.webhook_token = body.webhook_token.trim();
  } else {
    if (fresh(body.api_token)) next.api_token = body.api_token.trim();
  }

  return next;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: 'account not found' }, { status: 404 });
  }

  const integrations = ((account.config as any)?.integrations || {}) as Record<string, any>;
  // Mask tokens before returning.
  const safe: Record<string, any> = {};
  for (const [platform, cfg] of Object.entries(integrations)) {
    const c = (cfg || {}) as any;
    safe[platform] = {
      ...c,
      api_token: maskToken(c.api_token),
      admin_api_token: maskToken(c.admin_api_token),
      api_key: maskToken(c.api_key),
      webhook_secret: maskToken(c.webhook_secret),
      has_token: !!(c.api_token || c.admin_api_token || c.api_key),
    };
  }
  return NextResponse.json({ integrations: safe });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const platform = String(body?.platform || '') as Platform;
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'unsupported_platform' }, { status: 400 });
  }

  const supabase = await createClient();
  // Read-merge-write: preserve the rest of config (and other integrations).
  const { data: account, error: readErr } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  if (readErr || !account) {
    return NextResponse.json({ error: 'account not found' }, { status: 404 });
  }

  const config = (account.config || {}) as Record<string, any>;
  const integrations = (config.integrations || {}) as Record<string, any>;
  const existing = (integrations[platform] || {}) as Record<string, any>;

  const next = buildIntegrationPatch(platform, existing, body);

  const updatedConfig = {
    ...config,
    integrations: { ...integrations, [platform]: next },
  };

  const { error: writeErr } = await supabase
    .from('accounts')
    .update({ config: updatedConfig })
    .eq('id', accountId);
  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    platform,
    integration: {
      ...next,
      api_token: maskToken(next.api_token),
      admin_api_token: maskToken(next.admin_api_token),
      api_key: maskToken(next.api_key),
      webhook_secret: maskToken(next.webhook_secret),
      has_token: !!(next.api_token || next.admin_api_token || next.api_key),
    },
  });
}
