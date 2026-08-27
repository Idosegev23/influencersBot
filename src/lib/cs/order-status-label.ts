// Platform order statuses are English machine codes ("fulfilled", "partially_fulfilled").
// Both web CS surfaces used to print them verbatim inside an otherwise-Hebrew order card,
// so an Israeli shopper asking "איפה ההזמנה שלי" got back a chip reading `fulfilled`.
//
// The payload deliberately still carries the RAW code (it is data, not copy); the
// localisation happens here, at the presentation edge, and is called by both renderers.
//
// public/widget.js carries a copy of this table because it is dependency-free vanilla JS
// served straight from /public and cannot import from src/. Change one, change the other.

type Lang = 'he' | 'en';

const HE: Record<string, string> = {
  fulfilled: 'נשלחה',
  shipped: 'נשלחה',
  partially_fulfilled: 'נשלחה חלקית',
  unfulfilled: 'בהכנה',
  pending: 'ממתינה',
  in_transit: 'בדרך אלייך',
  out_for_delivery: 'יצאה למסירה',
  delivered: 'נמסרה',
  open: 'פתוחה',
  closed: 'הושלמה',
  paid: 'שולמה',
  on_hold: 'מוקפאת',
  cancelled: 'בוטלה',
  canceled: 'בוטלה',
  voided: 'בוטלה',
  refunded: 'זוכתה',
  partially_refunded: 'זוכתה חלקית',
  returned: 'הוחזרה',
};

const EN: Record<string, string> = {
  fulfilled: 'Fulfilled',
  shipped: 'Shipped',
  partially_fulfilled: 'Partially fulfilled',
  unfulfilled: 'Being prepared',
  pending: 'Pending',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  open: 'Open',
  closed: 'Completed',
  paid: 'Paid',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  voided: 'Cancelled',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  returned: 'Returned',
};

/**
 * Human label for a store's order status. An unmapped code is returned unchanged
 * rather than dropped: a shopper can still read it out to a human agent, and a
 * blank chip would be a worse answer than an ugly one.
 */
export function orderStatusLabel(status: string | null | undefined, lang: Lang): string {
  const raw = (status ?? '').trim();
  if (!raw) return '';
  const table = lang === 'en' ? EN : HE;
  return table[raw.toLowerCase()] ?? raw;
}
