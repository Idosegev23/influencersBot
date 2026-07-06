import { describe, it, expect } from 'vitest';
import { isValidProductUrl } from '@/lib/recommendations/engine';

describe('isValidProductUrl (moved from route)', () => {
  it('accepts /product/ detail URLs', () => {
    expect(isValidProductUrl('https://x.co.il/product/intensive-shampoo')).toBe(true);
  });
  it('rejects category/listing/pagination URLs', () => {
    expect(isValidProductUrl('https://x.co.il/category/hair')).toBe(false);
    expect(isValidProductUrl('https://x.co.il/shop')).toBe(false);
    expect(isValidProductUrl('https://x.co.il/shop/hair/page/3')).toBe(false);
  });
  it('rejects empty/undefined', () => {
    expect(isValidProductUrl(undefined)).toBe(false);
    expect(isValidProductUrl('')).toBe(false);
  });
});
