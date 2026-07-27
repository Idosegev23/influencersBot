import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: { order: any; focus: any; focusArgs: any } = {
  order: null,
  focus: { found: false, statusText: '', errorMessage: null },
  focusArgs: null,
};

vi.mock('@/lib/orders/brand-orders', () => ({
  findBrandOrderByNumber: async () => state.order,
}));

vi.mock('@/lib/shipment/focus-client', () => ({
  getFocusShipmentStatus: async (args: any) => { state.focusArgs = args; return state.focus; },
}));

import { resolveOrderStatusTurn, isShipmentLookupEnabled } from '@/lib/shipment/order-status-reply';

const FOCUS_CFG = {
  enabled: true,
  type: 'focus',
  host: 'focusdelivery.co.il',
  lookup_mode: 'p2',
  expected_master_customer_id: 10004,
};

describe('isShipmentLookupEnabled', () => {
  it('is off when the account has no shipment provider', () => {
    expect(isShipmentLookupEnabled(undefined)).toBe(false);
    expect(isShipmentLookupEnabled({ enabled: false, type: 'focus' })).toBe(false);
  });

  it('is on when explicitly enabled', () => {
    expect(isShipmentLookupEnabled(FOCUS_CFG)).toBe(true);
  });
});

describe('resolveOrderStatusTurn — turns it must NOT take over', () => {
  it('ignores everything when the provider is disabled', async () => {
    const r = await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: { enabled: false },
      message: 'איפה ההזמנה שלי', awaitingNumber: false,
    });
    expect(r.handled).toBe(false);
  });

  it('leaves product questions to the bot', async () => {
    const r = await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG,
      message: 'מה מתאים לשיער מתולתל?', awaitingNumber: false,
    });
    expect(r.handled).toBe(false);
  });
});

describe('resolveOrderStatusTurn — asking for the number', () => {
  it('asks once and parks the session in AwaitingNumber', async () => {
    const r = await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG,
      message: 'מתי תגיע החבילה שלי?', awaitingNumber: false,
    });
    expect(r.handled).toBe(true);
    expect(r.askedForNumber).toBe(true);
    expect(r.nextState).toBe('OrderStatus.AwaitingNumber');
    expect(r.answer).toContain('מספר ההזמנה');
  });

  it('asks in English for an English account', async () => {
    const r = await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG,
      message: 'where is my order?', awaitingNumber: false, isEnglish: true,
    });
    expect(r.askedForNumber).toBe(true);
    expect(r.answer).toMatch(/order \/ shipment number/i);
  });

  it('still asks when the reply holds no usable number', async () => {
    const r = await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG,
      message: 'אין לי מספר הזמנה כי לא שלחתם לי הודעה', awaitingNumber: true,
    });
    expect(r.askedForNumber).toBe(true);
  });
});

describe('resolveOrderStatusTurn — resolving a number', () => {
  beforeEach(() => {
    state.order = null;
    state.focus = { found: false, statusText: '', errorMessage: null };
    state.focusArgs = null;
  });

  // The regression that started all of this: a 5-digit reply fell through the
  // number check and produced the SAME question again, forever.
  it('does NOT re-ask when the customer replies with a 5-digit order number', async () => {
    state.order = { order_number: '26621', placed_at: '2026-07-22T17:51:05Z' };
    const r = await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG, message: '26621', awaitingNumber: true,
    });
    expect(r.askedForNumber).toBeUndefined();
    expect(r.answer).not.toContain('מה מספר ההזמנה');
  });

  it('uses the scoped P2 lookup (reference + master) for a known order number', async () => {
    state.order = { order_number: '26621', placed_at: null };
    await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG, message: '26621', awaitingNumber: true,
    });
    expect(state.focusArgs.reference).toBe('26621');
    expect(state.focusArgs.customerCode).toBe(10004);
    expect(state.focusArgs.shipmentNumber).toBeUndefined();
  });

  it('falls back to a P1 ship_no lookup for a number we do not recognise', async () => {
    state.order = null;
    await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG, message: '10197112', awaitingNumber: true,
    });
    expect(state.focusArgs.shipmentNumber).toBe('10197112');
    expect(state.focusArgs.reference).toBeUndefined();
  });

  it('says the order exists but has no courier record yet, not "not found"', async () => {
    state.order = { order_number: '27003', placed_at: '2026-07-22T17:51:02Z' };
    state.focus = { found: false, statusText: '', errorMessage: null };
    const r = await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG, message: '27003', awaitingNumber: true,
    });
    expect(r.answer).toContain('27003');
    expect(r.answer).not.toContain('לא הצלחתי למצוא');
    expect(r.answer).toMatch(/נקלטה|שילוח/);
  });

  it('reports a real courier status', async () => {
    state.order = { order_number: '26621', placed_at: null };
    state.focus = {
      found: true, shipmentNumber: '900123', statusText: 'נמסר ללקוח 🎉',
      isDelivered: true, isReturned: false, isCanceled: false,
      lastUpdate: { date: '24/07/2026', time: '11:20' }, destinationBranch: 'מרכז',
    };
    const r = await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG, message: '26621', awaitingNumber: true,
    });
    expect(r.answer).toContain('נמסר ללקוח');
    expect(r.answer).toContain('24/07/2026');
    expect(r.nextState).toBe('Idle');
  });

  // Enumerable, sequential order numbers + anonymous visitors = no PII here.
  it('never leaks customer PII even when the order row has it', async () => {
    state.order = {
      order_number: '26621', placed_at: null,
      customer_name: 'לינור בכר', customer_phone: '0503222225',
      customer_email: 'a@b.com', line_items: [{ name: 'שמפו קיק', quantity: 2 }],
    };
    state.focus = { found: true, shipmentNumber: '900123', statusText: 'בדרך אליכם', lastUpdate: {} };
    const r = await resolveOrderStatusTurn({
      accountId: 'acc-1', shipmentCfg: FOCUS_CFG, message: '26621', awaitingNumber: true,
    });
    expect(r.answer).not.toContain('לינור');
    expect(r.answer).not.toContain('0503222225');
    expect(r.answer).not.toContain('a@b.com');
    expect(r.answer).not.toContain('שמפו קיק');
  });
});
