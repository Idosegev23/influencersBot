// Canonical, platform-agnostic order shapes for the CS order layer (spec §7.2).
export type StorePlatform = 'quickshop' | 'shopify' | 'woocommerce' | 'magento';

export interface NormalizedLineItem {
  name: string;
  sku: string | null;
  quantity: number;
  price: string | null;   // per-unit, string-formatted
  total: string | null;   // line total
  imageUrl: string | null;
}

export interface NormalizedOrder {
  orderNumber: string;                 // human-facing (# stripped) → brand_orders.order_number
  externalId: string;                  // platform primary id → brand_orders.external_id
  status: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  lineItems: NormalizedLineItem[];     // [] when summary-only (list/backfill)
  trackingNumber: string | null;
  trackingUrl: string | null;
  total: string | null;
  currency: string | null;
  placedAt: string | null;             // ISO timestamp
  raw: unknown;                        // untouched platform payload → brand_orders.raw
}

// Per-account credentials from accounts.config.integrations.<platform>.
export interface OrderConnectorCreds {
  platform: StorePlatform;
  apiKey?: string;         // QuickShop qs_live_…
  shopDomain?: string;     // Shopify mystore.myshopify.com
  adminApiToken?: string;  // Shopify shpat_…
  webhookSecret?: string;  // HMAC secret for inbound order webhook
  [k: string]: unknown;
}

export interface OrderConnector {
  platform: StorePlatform;
  installMode: 'manual_token' | 'oauth' | 'platform_partner' | 'snippet';
  supportsDirectLookup: boolean;
  // Fetch ONE order fresh (full detail incl. line items). ref.id preferred; orderNumber fallback.
  pull(creds: OrderConnectorCreds, ref: { id?: string; orderNumber?: string }): Promise<NormalizedOrder | null>;
  // Backfill/sync paging. Present on QuickShop; absent on Shopify (direct lookup).
  list?(creds: OrderConnectorCreds, cursor?: string): Promise<{ orders: NormalizedOrder[]; next?: string }>;
  // Push feeders — map an inbound webhook body → NormalizedOrder.
  normalizeWebhook?(payload: unknown): NormalizedOrder;
  // Optional programmatic webhook registration (needs webhooks:write scope).
  registerWebhooks?(creds: OrderConnectorCreds, url: string, secret: string): Promise<void>;
}
