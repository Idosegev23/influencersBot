/**
 * Widget Order Lookup — visitor enters order # + email, we call Shopify Admin
 * API and return a sanitized status DTO.
 * POST /api/widget/order-lookup
 *
 * Only works for accounts with Shopify integration configured at
 *   accounts.config.integrations.shopify = { shop_domain, admin_api_token, enabled: true }
 *
 * For accounts without integration, returns 503 with a clear `integration_missing`
 * code so the widget can fall back to "open support form to ask about your order".
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { lookupShopifyOrder, type ShopifyIntegrationConfig } from '@/lib/shopify/order-lookup';

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin') || '*') });
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin') || '*');
  try {
    const body = await req.json();
    const accountId: string | undefined = body?.accountId;
    const orderNumber: string | undefined = body?.orderNumber;
    const email: string | undefined = body?.email;

    if (!accountId || !orderNumber || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'accountId + orderNumber + valid email required' }, { status: 400, headers });
    }

    const supabase = await createClient();
    const { data: account } = await supabase
      .from('accounts')
      .select('config, language')
      .eq('id', accountId)
      .single();
    if (!account) {
      return NextResponse.json({ error: 'account not found' }, { status: 404, headers });
    }

    const cfg: any = account.config || {};
    const shopify: ShopifyIntegrationConfig | undefined = cfg?.integrations?.shopify;
    if (!shopify?.enabled || !shopify?.shop_domain || !shopify?.admin_api_token) {
      return NextResponse.json({
        error: 'Order tracking not available for this store',
        code: 'integration_missing',
      }, { status: 503, headers });
    }

    const result = await lookupShopifyOrder(shopify, orderNumber, email);
    return NextResponse.json(result, { headers });
  } catch (err: any) {
    console.error('[Widget Order Lookup] error:', err);
    return NextResponse.json({ error: err?.message || 'internal error' }, { status: 500, headers });
  }
}
