/**
 * The two classification axes.
 *
 * Axis 1 (inquiry type) is a CLOSED list shared by every account — that is what
 * makes week-over-week and account-over-account comparison possible. Axis 2
 * (topic) is free text discovered per account and lives in conversation_topics.
 *
 * "Complaint" is deliberately NOT just an inquiry type: a shipping complaint is
 * both `order_status` and a complaint. It is carried as a separate boolean so
 * neither the complaint breakdown nor the general picture loses it.
 */

export const INQUIRY_TYPES = [
  'complaint',
  'order_status',
  'return_refund',
  'product_question',
  'recommendation',
  'pricing_promo',
  'availability',
  'technical',
  'other',
] as const;

export type InquiryType = (typeof INQUIRY_TYPES)[number];

export const INQUIRY_TYPE_LABEL_HE: Record<InquiryType, string> = {
  complaint: 'תלונה',
  order_status: 'סטטוס הזמנה ומשלוח',
  return_refund: 'החזרה/החלפה/זיכוי',
  product_question: 'שאלה על מוצר',
  recommendation: 'בקשת המלצה והתאמה',
  pricing_promo: 'מחיר/מבצע/קופון',
  availability: 'זמינות ומלאי',
  technical: 'בעיה טכנית ותשלום',
  other: 'אחר',
};

export const COMPLAINT_KINDS = [
  'defective', 'wrong_item', 'shipping', 'quality', 'service', 'billing',
] as const;
export type ComplaintKind = (typeof COMPLAINT_KINDS)[number];

export const COMPLAINT_KIND_LABEL_HE: Record<ComplaintKind, string> = {
  defective: 'מוצר פגום',
  wrong_item: 'מוצר שגוי',
  shipping: 'בעיית משלוח',
  quality: 'איכות מוצר',
  service: 'שירות',
  billing: 'חיוב ותשלום',
};

export const SENTIMENTS = ['negative', 'neutral', 'positive'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const URGENCIES = ['low', 'normal', 'high'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const OUTCOMES = ['resolved_by_bot', 'escalated', 'abandoned', 'unknown'] as const;
export type Outcome = (typeof OUTCOMES)[number];

const MAX_KEYWORDS = 8;

function pick<T extends string>(allowed: readonly T[], v: unknown): T | null {
  if (typeof v !== 'string') return null;
  const k = v.trim().toLowerCase();
  return (allowed as readonly string[]).includes(k) ? (k as T) : null;
}

/** Anything the model invents lands in `other` — the DB CHECK would reject it otherwise. */
export function coerceInquiryType(v: unknown): InquiryType {
  return pick(INQUIRY_TYPES, v) ?? 'other';
}

export function coerceComplaintKind(v: unknown): ComplaintKind | null {
  return pick(COMPLAINT_KINDS, v);
}

export function coerceSentiment(v: unknown): Sentiment {
  return pick(SENTIMENTS, v) ?? 'neutral';
}

export function coerceUrgency(v: unknown): Urgency {
  return pick(URGENCIES, v) ?? 'normal';
}

export function coerceOutcome(v: unknown): Outcome {
  return pick(OUTCOMES, v) ?? 'unknown';
}

/** Latin keywords are lowercased so `Shipping` and `shipping` do not become two slices. */
export function normalizeKeywords(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (typeof raw !== 'string') continue;
    const k = raw.trim().replace(/[A-Za-z]+/g, (m) => m.toLowerCase());
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}
