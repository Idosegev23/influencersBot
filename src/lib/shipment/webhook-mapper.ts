/**
 * Shipping carrier status → normalised mapped_status.
 *
 * Different carriers use different vocabularies (Hebrew/English, free
 * text). We map them to a small enum the rest of the app understands.
 * Unknown values are preserved on `shipment_events.raw_status` for the
 * audit trail; we just refuse to derive ticket transitions from them.
 */

export type MappedStatus =
  | 'dispatched'
  | 'in_transit'
  | 'at_branch'
  | 'out_for_delivery'
  | 'delivered'
  | 'returned'
  | 'cancelled'
  | 'failed_delivery'
  | 'unknown';

/** Hebrew labels per mapped status — used in history feed + UI. */
export const STATUS_HE: Record<MappedStatus, string> = {
  dispatched: 'נקלט / שובץ',
  in_transit: 'בדרך אליכם',
  at_branch: 'הגיע לסניף',
  out_for_delivery: 'יצא למשלוח אחרון',
  delivered: 'נמסר ללקוחה',
  returned: 'הוחזר',
  cancelled: 'בוטל',
  failed_delivery: 'מסירה נכשלה',
  unknown: 'עדכון משלוח',
};

const RAW_TO_MAPPED: Array<[RegExp, MappedStatus]> = [
  // English (most carriers / Make.com normalised)
  [/^delivered$/i, 'delivered'],
  [/^picked[\s_-]?up|^received[\s_-]?at[\s_-]?carrier$/i, 'dispatched'],
  [/^in[\s_-]?transit|^transit$/i, 'in_transit'],
  [/^arrived[\s_-]?at[\s_-]?branch|^at[\s_-]?branch|^at[\s_-]?facility$/i, 'at_branch'],
  [/^out[\s_-]?for[\s_-]?delivery$/i, 'out_for_delivery'],
  [/^returned$/i, 'returned'],
  [/^cancell?ed$/i, 'cancelled'],
  [/^failed[\s_-]?delivery|^delivery[\s_-]?failed|^undelivered$/i, 'failed_delivery'],
  [/^dispatched$/i, 'dispatched'],
  // Hebrew (Focus + manual)
  [/^נמסר/, 'delivered'],
  [/^בדרך/, 'in_transit'],
  [/בסניף/, 'at_branch'],
  [/יצא למשלוח/, 'out_for_delivery'],
  [/^הוחזר/, 'returned'],
  [/^בוטל/, 'cancelled'],
  [/^נקלט|^חדש|^שובץ/, 'dispatched'],
  [/לא נמסר|כשל/, 'failed_delivery'],
];

export function mapShipmentStatus(raw: string | null | undefined): MappedStatus {
  if (!raw) return 'unknown';
  const trimmed = raw.toString().trim();
  if (!trimmed) return 'unknown';
  for (const [pattern, mapped] of RAW_TO_MAPPED) {
    if (pattern.test(trimmed)) return mapped;
  }
  return 'unknown';
}

/** Normalise tracking numbers across carriers — uppercase, strip whitespace,
 *  drop common decorative characters. The same normalisation is applied to
 *  the lookup against support_requests.tracking_number. */
export function normalizeTracking(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.toString().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
}
