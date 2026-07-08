import { describe, it, expect } from 'vitest';
import { shouldReadBack, STT_CONFIDENCE_THRESHOLD } from '@/lib/stt/confidence';

describe('shouldReadBack', () => {
  it('low confidence → read back', () => {
    expect(shouldReadBack(0.5, 'תמחר את אנה ב-80')).toBe(true);
    expect(shouldReadBack(STT_CONFIDENCE_THRESHOLD - 0.01, 'x y')).toBe(true);
  });
  it('high confidence → no read back', () => {
    expect(shouldReadBack(0.95, 'תמחר את אנה')).toBe(false);
    expect(shouldReadBack(STT_CONFIDENCE_THRESHOLD, 'x y')).toBe(false);
  });
  it('null/undefined confidence → trust (no read back)', () => {
    expect(shouldReadBack(null, 'תמחר')).toBe(false);
    expect(shouldReadBack(undefined, 'תמחר')).toBe(false);
  });
  it('empty text → no read back', () => {
    expect(shouldReadBack(0.1, '')).toBe(false);
    expect(shouldReadBack(0.1, '   ')).toBe(false);
  });
});
