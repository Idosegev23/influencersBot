import { describe, it, expect } from 'vitest';
import { isNoCardError, NO_CARD_ERROR_CODE } from '@/lib/whatsapp-cloud/billing-probe';

describe('billing probe error classification', () => {
  it('131042 means the customer has not attached a card', () => {
    expect(isNoCardError({ success: false, error: { code: NO_CARD_ERROR_CODE, message: 'payment' } } as any)).toBe(true);
  });

  it('other failures are not a billing problem — do not flip the flag on them', () => {
    expect(isNoCardError({ success: false, error: { code: 131026, message: 'undeliverable' } } as any)).toBe(false);
    expect(isNoCardError({ success: false, error: { code: 470, message: 'window closed' } } as any)).toBe(false);
  });

  it('a success is never a billing problem', () => {
    expect(isNoCardError({ success: true } as any)).toBe(false);
  });

  it('a failure with no error object is not misread as a billing problem', () => {
    expect(isNoCardError({ success: false } as any)).toBe(false);
  });
});
