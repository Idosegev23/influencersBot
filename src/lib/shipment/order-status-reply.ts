/**
 * Shared "where is my order?" turn resolver.
 *
 * ONE implementation for both public chat surfaces — /api/chat/stream (the
 * /chat/<username> page) and /api/widget/chat (the embedded site widget).
 * They previously diverged completely: the stream route had a lookup and the
 * widget had none at all, while ~2/3 of Argania's live traffic is the widget.
 * A duplicated regex in two places is also what let the original 6-digit floor
 * survive, so the logic lives here and the surfaces only render it.
 *
 * PRIVACY: order numbers are short and sequential, so an anonymous visitor can
 * enumerate them. This returns SHIPMENT STATUS ONLY — never customer name,
 * address, or line items. See engines/policy/policies/public-order-details.ts.
 */

import { detectShipmentIntent, extractOrderNumber } from './intent';

export interface OrderStatusTurn {
  /** True when this turn was an order-status turn and `answer` should be sent. */
  handled: boolean;
  answer?: string;
  /** Session state to persist so a bare number next turn is understood. */
  nextState?: 'OrderStatus.AwaitingNumber' | 'Idle';
  /** True when we asked for a number rather than answering with a status. */
  askedForNumber?: boolean;
}

const NOT_HANDLED: OrderStatusTurn = { handled: false };

export function isShipmentLookupEnabled(shipmentCfg: any): boolean {
  return shipmentCfg?.enabled === true;
}

export async function resolveOrderStatusTurn(args: {
  accountId: string;
  shipmentCfg: any;
  message: string;
  /** Previous turn asked for a number, so a bare number now is the answer. */
  awaitingNumber: boolean;
  isEnglish?: boolean;
}): Promise<OrderStatusTurn> {
  const { accountId, shipmentCfg, message, awaitingNumber, isEnglish = false } = args;

  if (!isShipmentLookupEnabled(shipmentCfg)) return NOT_HANDLED;

  const intent = detectShipmentIntent(message);
  if (!intent.isOrderStatus && !awaitingNumber) return NOT_HANDLED;

  // Same extractor both times — never re-declare the pattern at a call site.
  const numToUse = intent.shipmentNumber || (awaitingNumber ? extractOrderNumber(message) : null);

  if (!numToUse) {
    return {
      handled: true,
      askedForNumber: true,
      nextState: 'OrderStatus.AwaitingNumber',
      answer: isEnglish
        ? "Happy to check — what's the order / shipment number? (It's on your order confirmation and shipping email.)"
        : 'בשמחה — מה מספר ההזמנה / משלוח? (המספר מופיע באישור ההזמנה ובמייל המשלוח)',
    };
  }

  const { findBrandOrderByNumber } = await import('@/lib/orders/brand-orders');
  const { getFocusShipmentStatus } = await import('./focus-client');

  const expectedMaster = shipmentCfg.expected_master_customer_id
    ? Number(shipmentCfg.expected_master_customer_id)
    : undefined;

  let orderRow: Awaited<ReturnType<typeof findBrandOrderByNumber>> = null;
  try {
    orderRow = await findBrandOrderByNumber(accountId, numToUse);
  } catch (e) {
    console.warn('[order-status] brand_orders lookup failed:', (e as Error).message);
  }

  let view: any;
  try {
    view = shipmentCfg.type === 'focus'
      ? await getFocusShipmentStatus({
          host: shipmentCfg.host || 'focusdelivery.co.il',
          // Recognised as one of our order numbers → scoped P2 (reference +
          // master customer). Otherwise treat it as a Focus ship_no from the
          // shipping email. Querying P1 with an order number finds nothing.
          ...(orderRow
            ? { reference: orderRow.order_number, customerCode: expectedMaster }
            : { shipmentNumber: numToUse }),
          expectedMasterCustomerId: expectedMaster,
        })
      : { found: false, statusText: '', errorMessage: null };
  } catch (e) {
    console.error('[order-status] Focus lookup failed:', (e as Error).message);
    view = { found: false, statusText: '', errorMessage: null };
  }

  return {
    handled: true,
    nextState: 'Idle',
    answer: buildAnswer({ numToUse, orderRow, view, isEnglish }),
  };
}

function buildAnswer(args: { numToUse: string; orderRow: any; view: any; isEnglish: boolean }): string {
  const { numToUse, orderRow, view, isEnglish } = args;

  if (!view.found && !orderRow) {
    return isEnglish
      ? `I couldn't find an order with number ${numToUse}. ${view.errorMessage || 'Maybe the number is off?'} Please double-check or contact customer support.`
      : `לא הצלחתי למצוא הזמנה עם מספר ${numToUse}. ${view.errorMessage || 'אולי המספר שגוי?'} בדקי שוב או צרי קשר עם שירות הלקוחות.`;
  }

  if (!view.found && orderRow) {
    // The order exists on our side but the courier has no record yet — the
    // normal gap between "paid" and "handed to Focus". Saying "not found" here
    // reads to the customer as "your order vanished", which is wrong.
    const placed = orderRow.placed_at
      ? new Date(orderRow.placed_at).toLocaleDateString(isEnglish ? 'en-GB' : 'he-IL')
      : null;
    return isEnglish
      ? `Order ${numToUse} is in our system${placed ? ` (placed ${placed})` : ''}, but the courier hasn't picked it up yet, so there's no tracking status. It usually updates within 1-2 business days.`
      : [
          `📦 הזמנה ${numToUse} נמצאת אצלנו במערכת${placed ? ` (בוצעה ב-${placed})` : ''}.`,
          'היא עדיין לא נקלטה אצל חברת השילוח, ולכן אין עדיין סטטוס מעקב — זה בדרך כלל מתעדכן תוך 1-2 ימי עסקים.',
        ].join('\n');
  }

  const lines: string[] = [
    `📦 הזמנה ${orderRow?.order_number || view.shipmentNumber || numToUse}`,
    `סטטוס: ${view.statusText}`,
  ];
  if (view.lastUpdate?.date) lines.push(`עודכן: ${view.lastUpdate.date} ${view.lastUpdate.time || ''}`.trim());
  if (view.destinationBranch) lines.push(`סניף יעד: ${view.destinationBranch}`);
  if (view.shipmentDirection) lines.push(`כיוון: ${view.shipmentDirection}`);
  if (view.isDelivered) lines.push('✅ נמסר');
  else if (view.isReturned) lines.push('↩️ הוחזר לסניף');
  else if (view.isCanceled) lines.push('❌ בוטל');
  return lines.join('\n');
}
