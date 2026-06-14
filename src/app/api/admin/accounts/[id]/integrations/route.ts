/**
 * Store API integration config for an account.
 *
 *  GET  /api/admin/accounts/[id]/integrations
 *    → { integrations: { shopify?: {...}, quickshop?: {...}, ... } }
 *      (api_token is masked — never returned in full)
 *
 *  PUT  /api/admin/accounts/[id]/integrations
 *    body: { platform, shop_domain, api_token?, enabled }
 *    → merges into accounts.config.integrations[platform]
 *
 * This is the "field to interface from in the future" — it persists store
 * credentials now (reusing the config.integrations.shopify shape that
 * /api/widget/order-lookup already reads) so a future sync can use them.
 * Admin-only; tokens are write-only from the UI's perspective.
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { id } = await params;
  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', id)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: 'account not found' }, { status: 404 });
  }

  const integrations = ((account.config as any)?.integrations || {}) as Record<string, any>;
  // Mask tokens before returning.
  const safe: Record<string, any> = {};
  for (const [platform, cfg] of Object.entries(integrations)) {
    safe[platform] = {
      ...cfg,
      api_token: maskToken((cfg as any)?.api_token),
      has_token: !!(cfg as any)?.api_token,
    };
  }
  return NextResponse.json({ integrations: safe });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { id } = await params;
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
    .eq('id', id)
    .single();
  if (readErr || !account) {
    return NextResponse.json({ error: 'account not found' }, { status: 404 });
  }

  const config = (account.config || {}) as Record<string, any>;
  const integrations = (config.integrations || {}) as Record<string, any>;
  const existing = (integrations[platform] || {}) as Record<string, any>;

  const next: Record<string, any> = {
    ...existing,
    shop_domain: typeof body.shop_domain === 'string' ? body.shop_domain.trim() : existing.shop_domain || '',
    enabled: body.enabled === true,
  };
  // Only overwrite the token when a non-empty new value is sent; an empty/
  // masked value leaves the stored token untouched.
  if (typeof body.api_token === 'string' && body.api_token.trim() && !body.api_token.startsWith('••••')) {
    next.api_token = body.api_token.trim();
  }

  const updatedConfig = {
    ...config,
    integrations: { ...integrations, [platform]: next },
  };

  const { error: writeErr } = await supabase
    .from('accounts')
    .update({ config: updatedConfig })
    .eq('id', id);
  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    platform,
    integration: { ...next, api_token: maskToken(next.api_token), has_token: !!next.api_token },
  });
}
