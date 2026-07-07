/**
 * Pure pricing math for a deal's line items (human-in-the-loop per-deliverable
 * pricing). Dependency-free so it is unit-testable and reusable on client + server.
 *
 * Money is kept in the deal currency (default ILS). VAT default 18% (since 1/1/25);
 * each line can override its rate.
 */

export interface LineItem {
  platform?: string | null;
  deliverable_type?: string | null;
  qty?: number | null;
  unit_price?: number | null; // per unit, before VAT
  vat_rate?: number | null; // e.g. 0.18
  notes?: string | null;
}

export interface PricingTotals {
  subtotal: number; // sum of qty * unit_price, before VAT
  vat: number; // sum of per-line VAT
  total: number; // subtotal + vat
}

export const DEFAULT_VAT_RATE = 0.18;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** qty * unit_price, before VAT (never negative). */
export function lineSubtotal(li: LineItem): number {
  const qty = Math.max(0, num(li?.qty));
  const price = Math.max(0, num(li?.unit_price));
  return round2(qty * price);
}

/** Sum line items into subtotal / VAT / total. VAT is computed per line. */
export function computeTotals(items: LineItem[], defaultVat = DEFAULT_VAT_RATE): PricingTotals {
  let subtotal = 0;
  let vat = 0;
  for (const li of items || []) {
    const sub = lineSubtotal(li);
    const rate = li?.vat_rate == null ? defaultVat : num(li.vat_rate, defaultVat);
    subtotal += sub;
    vat += round2(sub * rate);
  }
  subtotal = round2(subtotal);
  vat = round2(vat);
  return { subtotal, vat, total: round2(subtotal + vat) };
}

/** Human-readable deliverable lines for the quote PDF, e.g. "3× reel · instagram — 15,000 ₪". */
export function lineItemsToDeliverables(items: LineItem[], currencySymbol = '₪'): string[] {
  return (items || [])
    .map((li) => {
      const qty = Math.max(1, Math.round(num(li?.qty, 1)));
      const kind = [li?.deliverable_type, li?.platform].filter(Boolean).join(' · ');
      const amount = lineSubtotal(li);
      const priceStr = amount ? ` — ${amount.toLocaleString('en-US')} ${currencySymbol}` : '';
      const label = kind || 'תוצר';
      return `${qty}× ${label}${priceStr}`;
    })
    .filter(Boolean);
}
