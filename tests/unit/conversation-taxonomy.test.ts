import { describe, it, expect } from 'vitest';
import {
  INQUIRY_TYPES,
  INQUIRY_TYPE_LABEL_HE,
  coerceInquiryType,
  coerceComplaintKind,
  coerceSentiment,
  coerceUrgency,
  coerceOutcome,
  normalizeKeywords,
} from '@/lib/conversation-analytics/taxonomy';

describe('inquiry type taxonomy', () => {
  it('has exactly the nine agreed values', () => {
    expect([...INQUIRY_TYPES]).toEqual([
      'complaint', 'order_status', 'return_refund', 'product_question',
      'recommendation', 'pricing_promo', 'availability', 'technical', 'other',
    ]);
  });

  it('labels every value in Hebrew', () => {
    for (const t of INQUIRY_TYPES) {
      expect(INQUIRY_TYPE_LABEL_HE[t]).toBeTruthy();
    }
  });

  // The model will occasionally invent a category. It must never reach the DB:
  // the CHECK constraint would reject the row and we would lose the session.
  it('coerces anything outside the enum to other', () => {
    expect(coerceInquiryType('complaint')).toBe('complaint');
    expect(coerceInquiryType('COMPLAINT')).toBe('complaint');
    expect(coerceInquiryType('  order_status ')).toBe('order_status');
    expect(coerceInquiryType('shipping_delay')).toBe('other');
    expect(coerceInquiryType('תלונה')).toBe('other');
    expect(coerceInquiryType(null)).toBe('other');
    expect(coerceInquiryType(undefined)).toBe('other');
    expect(coerceInquiryType(42)).toBe('other');
  });
});

describe('secondary axes', () => {
  it('coerces complaint kind, allowing null', () => {
    expect(coerceComplaintKind('shipping')).toBe('shipping');
    expect(coerceComplaintKind('none')).toBeNull();
    expect(coerceComplaintKind('')).toBeNull();
    expect(coerceComplaintKind('exploded')).toBeNull();
    expect(coerceComplaintKind(null)).toBeNull();
  });

  it('defaults sentiment to neutral and urgency to normal', () => {
    expect(coerceSentiment('negative')).toBe('negative');
    expect(coerceSentiment('furious')).toBe('neutral');
    expect(coerceSentiment(null)).toBe('neutral');
    expect(coerceUrgency('high')).toBe('high');
    expect(coerceUrgency('immediate')).toBe('normal');
  });

  it('defaults outcome to unknown', () => {
    expect(coerceOutcome('escalated')).toBe('escalated');
    expect(coerceOutcome('solved')).toBe('unknown');
    expect(coerceOutcome(undefined)).toBe('unknown');
  });
});

describe('normalizeKeywords', () => {
  it('trims, drops empties and dedupes', () => {
    expect(normalizeKeywords(['  משלוח ', 'משלוח', '', '   ', 'החזר']))
      .toEqual(['משלוח', 'החזר']);
  });

  it('lowercases latin keywords so Shipping and shipping merge', () => {
    expect(normalizeKeywords(['Shipping', 'shipping'])).toEqual(['shipping']);
  });

  it('caps at eight', () => {
    const many = Array.from({ length: 20 }, (_, i) => `k${i}`);
    expect(normalizeKeywords(many)).toHaveLength(8);
  });

  it('returns an empty array for non-arrays', () => {
    expect(normalizeKeywords(null)).toEqual([]);
    expect(normalizeKeywords('משלוח')).toEqual([]);
  });
});
