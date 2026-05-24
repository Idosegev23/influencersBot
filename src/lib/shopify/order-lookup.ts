/**
 * Shopify Order Lookup — called from /api/widget/order-lookup when a visitor
 * asks about an order. Per-account integration: each store's Admin API token
 * lives in `accounts.config.integrations.shopify.admin_api_token`.
 *
 * Security:
 *   - Token is NEVER returned to the client; only used server-side.
 *   - Visitor must provide BOTH order number AND a matching email — Shopify
 *     filters on both server-side, so guessing one isn't useful without the
 *     other. This is the standard Shopify customer order-lookup pattern.
 *
 * Returns a sanitized DTO suitable for direct render in the widget — strips
 * line-item costs that aren't needed, omits internal Shopify IDs.
 */

export interface ShopifyIntegrationConfig {
  shop_domain: string;          // e.g. "mystore.myshopify.com" — no protocol
  admin_api_token: string;      // shpat_... — Admin API access token
  enabled?: boolean;
}

export interface OrderLookupResult {
  found: boolean;
  orderNumber?: string;
  status?: string;              // financial_status / fulfillment_status combined
  placedAt?: string;            // ISO date
  total?: string;               // formatted with currency
  itemSummary?: string;         // "2× Argan Oil, 1× Hair Mask"
  trackingUrls?: string[];      // public tracking links if shipped
  trackingNumbers?: string[];
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

const SHOPIFY_API_VERSION = '2024-01';
const SHOPIFY_TIMEOUT_MS = 7000;

/**
 * Look up a Shopify order by name + matching customer email.
 *
 * Throws on configuration errors (missing token, bad domain). Network errors
 * and "not found" both return `{found: false}` so the widget can show a clean
 * message without leaking diagnostic details to the visitor.
 */
export async function lookupShopifyOrder(
  cfg: ShopifyIntegrationConfig,
  orderNumber: string,
  email: string,
): Promise<OrderLookupResult> {
  if (!cfg?.shop_domain || !cfg?.admin_api_token) {
    throw new Error('Shopify integration not configured for this account');
  }

  // Shopify stores orders with a "name" like "#1234". Strip the leading '#'
  // if visitor pasted with or without it.
  const normalized = orderNumber.trim().replace(/^#/, '');
  const url = `https://${cfg.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?` +
    `name=${encodeURIComponent('#' + normalized)}&email=${encodeURIComponent(email.trim().toLowerCase())}&status=any&limit=1`;

  let res: Response;
  try {
    res = await Promise.race([
      fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': cfg.admin_api_token,
          'Content-Type': 'application/json',
        },
      }),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('shopify timeout')), SHOPIFY_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.warn('[Shopify Lookup] network error:', (err as Error).message);
    return { found: false };
  }

  if (!res.ok) {
    console.warn('[Shopify Lookup] non-OK:', res.status, await res.text().catch(() => ''));
    return { found: false };
  }

  const data = await res.json().catch(() => null) as any;
  const order = data?.orders?.[0];
  if (!order) return { found: false };

  // Combine financial + fulfillment status into a single human-readable label
  const fin = order.financial_status || 'pending';
  const ful = order.fulfillment_status || 'unfulfilled';
  const statusMap: Record<string, string> = {
    'unfulfilled': 'Processing',
    'partial': 'Partially shipped',
    'fulfilled': 'Shipped',
    'restocked': 'Refunded',
  };
  const status = (ful === 'fulfilled' && fin === 'refunded') ? 'Refunded' : (statusMap[ful] || ful);

  // Tracking — Shopify nests under fulfillments
  const fulfillments: any[] = Array.isArray(order.fulfillments) ? order.fulfillments : [];
  const trackingUrls = fulfillments
    .flatMap((f) => Array.isArray(f.tracking_urls) ? f.tracking_urls : (f.tracking_url ? [f.tracking_url] : []))
    .filter(Boolean) as string[];
  const trackingNumbers = fulfillments
    .flatMap((f) => Array.isArray(f.tracking_numbers) ? f.tracking_numbers : (f.tracking_number ? [f.tracking_number] : []))
    .filter(Boolean) as string[];

  const items = Array.isArray(order.line_items) ? order.line_items : [];
  const itemSummary = items.slice(0, 4).map((it: any) => `${it.quantity}× ${it.title}`).join(', ')
    + (items.length > 4 ? `, +${items.length - 4} more` : '');

  return {
    found: true,
    orderNumber: order.name || ('#' + normalized),
    status,
    placedAt: order.created_at || null,
    total: order.total_price ? `${order.currency || ''}${order.total_price}` : undefined,
    itemSummary,
    trackingUrls: trackingUrls.length ? trackingUrls : undefined,
    trackingNumbers: trackingNumbers.length ? trackingNumbers : undefined,
    shippedAt: fulfillments[0]?.created_at || null,
    deliveredAt: fulfillments.find((f) => f.shipment_status === 'delivered')?.updated_at || null,
  };
}
