// Shopify adapter (LA BEAUTÉ, deferred). Thin wrapper over the existing lookupShopifyOrder,
// which returns items + tracking in one direct call by order name. READ-ONLY.
import { lookupShopifyOrder, type OrderLookupResult, type ShopifyIntegrationConfig } from '@/lib/shopify/order-lookup';
import type { NormalizedOrder, OrderConnector, OrderConnectorCreds } from './types';
import { registerConnector } from './registry';

function credsToConfig(creds: OrderConnectorCreds): ShopifyIntegrationConfig {
  return {
    shop_domain: creds.shopDomain || '',
    admin_api_token: creds.adminApiToken || '',
    enabled: true,
  };
}

function mapResult(r: OrderLookupResult, ref: { orderNumber?: string }): NormalizedOrder | null {
  if (!r.found) return null;
  const number = (r.orderNumber || ref.orderNumber || '').replace(/^#/, '');
  return {
    orderNumber: number,
    externalId: number,           // Shopify direct lookup keys by name; no separate id surfaced
    status: r.status ?? null,
    financialStatus: null,
    fulfillmentStatus: r.status ?? null,
    customerName: null,
    customerPhone: null,          // OrderLookupResult sanitizes phone out; verification is upstream
    customerEmail: null,
    lineItems: [],                // itemSummary is a string; detailed items not exposed by the DTO
    trackingNumber: r.trackingNumbers?.[0] ?? null,
    trackingUrl: r.trackingUrls?.[0] ?? null,
    total: r.total ?? null,
    currency: null,
    placedAt: r.placedAt ?? null,
    raw: r,
  };
}

export const shopifyConnector: OrderConnector = {
  platform: 'shopify',
  installMode: 'oauth',
  supportsDirectLookup: true,      // by order name → no backfill needed

  async pull(creds, ref) {
    if (!ref.orderNumber) return null;
    const result = await lookupShopifyOrder(credsToConfig(creds), ref.orderNumber, '');
    return mapResult(result, ref);
  },
  // no list() — direct lookup means no backfill/sync paging.
};

registerConnector(shopifyConnector);
