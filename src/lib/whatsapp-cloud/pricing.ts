/**
 * WhatsApp Cloud API — message pricing.
 *
 * Meta tells us per-message whether the message was billable and which
 * category it falls into via the `pricing` field on every status event:
 *
 *   { type: 'regular', billable: true, category: 'utility', pricing_model: 'PMP' }
 *
 * What Meta does NOT send is the actual $ amount — that comes from a
 * country-specific rate sheet published at
 * https://developers.facebook.com/docs/whatsapp/pricing.
 *
 * This file owns the rate lookup. The numbers below are Meta's
 * published per-message rates for Israel (IL) as of mid-2025; update
 * the table when Meta adjusts pricing or when adding more markets.
 *
 * Pricing models:
 *   - PMP (Per-Message Pricing) — current default. One charge per
 *     message, regardless of whether it opens/closes a conversation.
 *   - CBP (Conversation-Based Pricing) — legacy. One charge per
 *     conversation per 24h window. Only present on very old rows.
 *
 * Categories (Meta's classification, mirrored from the webhook):
 *   - marketing       — promotional, opt-in required
 *   - utility         — order updates, appointments, status pings
 *   - authentication  — OTPs, login codes
 *   - service         — replies during the 24h customer-service window
 *                       (typically billable=false → free)
 */

export type PricingCategory = 'marketing' | 'utility' | 'authentication' | 'service';
export type PricingModel = 'PMP' | 'CBP';

interface RateRow {
  marketing: number;
  utility: number;
  authentication: number;
  service: number;
}

// USD per message (PMP). Source: Meta's published rate card. Verified
// 2025-05 — re-check quarterly.
const PMP_USD: Record<string, RateRow> = {
  IL: {
    marketing: 0.0379,
    utility: 0.008,
    authentication: 0.0086,
    service: 0,
  },
  // Default fallback — used when country detection isn't possible.
  // Set to Israel rates because that's the only active market today.
  default: {
    marketing: 0.0379,
    utility: 0.008,
    authentication: 0.0086,
    service: 0,
  },
};

// CBP fallback rates. We rarely see CBP today; kept for backfilled
// historical rows. Numbers are Israel's CBP per-conversation rates.
const CBP_USD: Record<string, RateRow> = {
  IL: {
    marketing: 0.0379,
    utility: 0.008,
    authentication: 0.0086,
    service: 0,
  },
  default: {
    marketing: 0.0379,
    utility: 0.008,
    authentication: 0.0086,
    service: 0,
  },
};

interface CostInput {
  billable: boolean | null | undefined;
  category: string | null | undefined;
  pricing_model: string | null | undefined;
  recipient_country?: string | null;
}

/**
 * Compute the USD cost for a single outbound message. Returns 0 when
 * Meta marked the message as not billable (e.g. service-window
 * follow-ups), unknown pricing data, or unknown category.
 */
export function messageCostUsd(input: CostInput): number {
  if (input.billable !== true) return 0;
  const category = (input.category || '').toLowerCase() as PricingCategory;
  if (!isCategory(category)) return 0;

  const country = (input.recipient_country || 'IL').toUpperCase();
  const model = (input.pricing_model || 'PMP').toUpperCase() as PricingModel;
  const table = model === 'CBP' ? CBP_USD : PMP_USD;
  const rates = table[country] || table.default;
  return rates[category] ?? 0;
}

function isCategory(c: string): c is PricingCategory {
  return c === 'marketing' || c === 'utility' || c === 'authentication' || c === 'service';
}

/** USD → ILS using a static rate. Set USD_ILS_RATE in env to override. */
export function usdToIls(usd: number): number {
  const rate = Number(process.env.USD_ILS_RATE || '3.7');
  return usd * rate;
}
