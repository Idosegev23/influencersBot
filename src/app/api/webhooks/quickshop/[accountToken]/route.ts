/**
 * QuickShop order webhook — HMAC-verified, per-account. Mirrors the shipping webhook.
 * Body: { event, timestamp, data } (top field `event`). Signature: X-Webhook-Signature: sha256=<hmac(raw)>.
 * Resolve brand by config.integrations.quickshop.webhook_token. READ-ONLY store side: we only ingest.
 * Bad token → 404; invalid signature → 401; no secret → skip; else → 200.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getConnector } from '@/lib/orders/connectors/registry';
import '@/lib/orders/connectors/quickshop';
import { upsertBrandOrder } from '@/lib/orders/brand-orders';

export const runtime = 'nodejs';
export const maxDuration = 30;

function verifySignature(rawBody: string, header: string | null, secret: string | null): boolean | null {
  if (!secret) return null;              // not configured → skip
  if (!header) return false;
  const [algo, provided] = header.split('=');
  if (algo !== 'sha256' || !provided) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function handleQuickShopWebhook(
  rawBody: string,
  sigHeader: string | null,
  accountToken: string,
): Promise<{ status: number; body: unknown }> {
  let payload: any;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return { status: 400, body: { error: 'bad_json' } };
  }

  const { data: account } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .eq('config->integrations->quickshop->>webhook_token', accountToken)
    .maybeSingle();

  if (!account) return { status: 404, body: { error: 'unknown_token' } };

  const secret = (account as any).config?.integrations?.quickshop?.webhook_secret || null;
  const sig = verifySignature(rawBody, sigHeader, secret);
  if (sig === false) return { status: 401, body: { error: 'invalid_signature' } };

  try {
    const normalized = getConnector('quickshop').normalizeWebhook!(payload);
    await upsertBrandOrder((account as any).id, normalized, 'quickshop');
  } catch (e) {
    console.warn('[quickshop-webhook] ingest failed', (e as Error).message);
    // Still 200 — avoid provider retry storms; error is logged.
  }
  return { status: 200, body: { ok: true } };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ accountToken: string }> }) {
  const { accountToken } = await ctx.params;
  const rawBody = await req.text();
  const sigHeader = req.headers.get('x-webhook-signature');
  const { status, body } = await handleQuickShopWebhook(rawBody, sigHeader, accountToken);
  return NextResponse.json(body, { status });
}
