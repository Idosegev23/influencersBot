import { describe, it, expect } from 'vitest';
import { lineSubtotal, computeTotals, lineItemsToDeliverables, DEFAULT_VAT_RATE } from '@/lib/crm/pricing';

describe('lineSubtotal', () => {
  it('multiplies qty by unit_price', () => {
    expect(lineSubtotal({ qty: 3, unit_price: 5000 })).toBe(15000);
  });
  it('treats missing/negative as 0', () => {
    expect(lineSubtotal({})).toBe(0);
    expect(lineSubtotal({ qty: -2, unit_price: 100 })).toBe(0);
  });
  it('rounds to 2 decimals', () => {
    expect(lineSubtotal({ qty: 3, unit_price: 10.333 })).toBe(31);
  });
});

describe('computeTotals', () => {
  it('sums subtotal + 18% VAT by default', () => {
    const t = computeTotals([
      { qty: 3, unit_price: 5000 }, // 15000
      { qty: 1, unit_price: 5000 }, // 5000
    ]);
    expect(t.subtotal).toBe(20000);
    expect(t.vat).toBe(3600); // 18%
    expect(t.total).toBe(23600);
  });
  it('honors a per-line vat_rate override (e.g. 0 for exempt)', () => {
    const t = computeTotals([{ qty: 1, unit_price: 1000, vat_rate: 0 }]);
    expect(t).toEqual({ subtotal: 1000, vat: 0, total: 1000 });
  });
  it('empty list → all zeros', () => {
    expect(computeTotals([])).toEqual({ subtotal: 0, vat: 0, total: 0 });
  });
  it('DEFAULT_VAT_RATE is 18%', () => {
    expect(DEFAULT_VAT_RATE).toBe(0.18);
  });
});

describe('lineItemsToDeliverables', () => {
  it('formats a readable deliverable line', () => {
    expect(lineItemsToDeliverables([{ qty: 3, deliverable_type: 'reel', platform: 'instagram', unit_price: 5000 }]))
      .toEqual(['3× reel · instagram — 15,000 ₪']);
  });
  it('falls back to a generic label with no price', () => {
    expect(lineItemsToDeliverables([{ qty: 1 }])).toEqual(['1× תוצר']);
  });
});
