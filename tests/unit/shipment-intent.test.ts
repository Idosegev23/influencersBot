import { describe, it, expect } from 'vitest';
import { detectShipmentIntent } from '@/lib/shipment/intent';

describe('detectShipmentIntent — order number extraction', () => {
  // Live bug (Argania, 2026-07-26/27): NUMBER_PATTERN required 6-12 digits, but
  // 100% of Argania's 26,177 order numbers are 4 or 5 digits. Customers replied
  // with a valid number and the bot re-asked for it forever.
  it('extracts 5-digit order numbers (Argania: 17,387 of 26,177 orders)', () => {
    const r = detectShipmentIntent('26621');
    expect(r.isOrderStatus).toBe(true);
    expect(r.shipmentNumber).toBe('26621');
  });

  it('extracts 4-digit order numbers (Argania: 8,790 of 26,177 orders)', () => {
    const r = detectShipmentIntent('9412');
    expect(r.isOrderStatus).toBe(true);
    expect(r.shipmentNumber).toBe('9412');
  });

  it('extracts an order number embedded in a sentence', () => {
    const r = detectShipmentIntent('הזמנה מספר 27003 רוצה לדעת מתי אקבל אותה ?');
    expect(r.isOrderStatus).toBe(true);
    expect(r.shipmentNumber).toBe('27003');
  });

  it('strips a leading # from the order number', () => {
    const r = detectShipmentIntent('#24874');
    expect(r.isOrderStatus).toBe(true);
    expect(r.shipmentNumber).toBe('24874');
  });

  it('still extracts long Focus shipment numbers', () => {
    const r = detectShipmentIntent('10197112');
    expect(r.isOrderStatus).toBe(true);
    expect(r.shipmentNumber).toBe('10197112');
  });

  // Israeli mobile numbers are 10 digits starting 05x. A customer who pastes a
  // phone number is NOT giving an order number — looking it up produced the live
  // "לא הצלחתי למצוא הזמנה עם מספר 0512018226" dead end.
  it('does not treat an Israeli phone number as an order number', () => {
    const r = detectShipmentIntent('0503222225');
    expect(r.shipmentNumber).toBeNull();
  });

  it('does not treat a +972 phone number as an order number', () => {
    const r = detectShipmentIntent('+972503222225');
    expect(r.shipmentNumber).toBeNull();
  });

  it('ignores a bare year-like 4-digit number inside a long non-order sentence', () => {
    const r = detectShipmentIntent('אני משתמשת בסדרה הזאת מאז 2019 והשיער שלי יבש מאוד ומתולתל');
    expect(r.isOrderStatus).toBe(false);
  });
});

describe('detectShipmentIntent — intent detection', () => {
  it.each([
    'מתי תגיע החבילה שלי?',
    'איפה ההזמנה שלי',
    'לא הגיע ההזמנה',
    'מה סטטוס ההזמנה שלי',
    'היי איפה רואים מעקב אחרי הזמנה?',
  ])('detects order-status intent: %s', (msg) => {
    expect(detectShipmentIntent(msg).isOrderStatus).toBe(true);
  });

  it.each([
    'מה מומלץ לעידוד צמיחת השיער?',
    'מה מתאים לשיער יבש?',
    'האם המוצרים טבעוניים?',
  ])('does not fire on product questions: %s', (msg) => {
    expect(detectShipmentIntent(msg).isOrderStatus).toBe(false);
  });
});
