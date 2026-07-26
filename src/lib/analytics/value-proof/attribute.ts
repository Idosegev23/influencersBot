/**
 * Tier resolution — the single source of truth for what "Bestie produced this
 * order" means. Pure: no DB, no clock, no I/O, so it is fully unit-testable and
 * the refresh job and the report script cannot disagree with each other.
 *
 * Resolution order is fixed: direct → assisted → influenced → none.
 *  - direct     the order carries utm_source=bestie. The UTM IS the evidence, so
 *               NO touch record is required — the visitor's session may never have
 *               been recorded (widget analytics only began 2026-07-06).
 *  - assisted   same anon_id conversed, then ordered within 24h.
 *  - influenced the customer's phone or email touched a conversation within 7d.
 *
 * For assisted and influenced the touch MUST strictly precede the order.
 */
import {
  ASSISTED_WINDOW_MS,
  INFLUENCED_WINDOW_MS,
  type Attribution,
  type AttributableCart,
  type AttributableOrder,
  type MatchKey,
  type TouchRecord,
} from './types';

export interface TouchIndex {
  byAnon: Map<string, number[]>;
  byPhone: Map<string, number[]>;
  byEmail: Map<string, number[]>;
}

const push = (m: Map<string, number[]>, key: string | null, at: number) => {
  if (!key) return;
  const list = m.get(key);
  if (list) list.push(at);
  else m.set(key, [at]);
};

export function buildTouchIndex(touches: TouchRecord[]): TouchIndex {
  const index: TouchIndex = { byAnon: new Map(), byPhone: new Map(), byEmail: new Map() };
  for (const t of touches) {
    push(index.byAnon, t.anonId, t.touchAt);
    push(index.byPhone, t.phone, t.touchAt);
    push(index.byEmail, t.email, t.touchAt);
  }
  return index;
}

/** Latest touch strictly before `at` and no older than `windowMs`. */
function latestTouch(times: number[] | undefined, at: number, windowMs: number): number | null {
  if (!times) return null;
  let best: number | null = null;
  for (const t of times) {
    if (t >= at) continue;                 // a touch after the order proves nothing
    if (at - t > windowMs) continue;
    if (best === null || t > best) best = t;
  }
  return best;
}

const resolved = (tier: Attribution['tier'], matchKey: MatchKey, touchAt: number | null, at: number): Attribution => ({
  tier,
  matchKey,
  touchAt,
  lagSec: touchAt === null ? null : Math.round((at - touchAt) / 1000),
});

const NONE: Attribution = { tier: 'none', matchKey: null, touchAt: null, lagSec: null };

/**
 * ₪0 rows and point-of-sale rows are not sales — they are in-store and
 * replacement records. Including them inflated the influenced tier 11x on
 * Argania (132 orders, of which 120 were ₪0) while adding ₪0 of revenue.
 */
export function isAttributableOrder(o: { amount: number; utmSource: string | null }): boolean {
  if (!(o.amount > 0)) return false;
  return (o.utmSource || '').trim().toLowerCase() !== 'pos';
}

export function attributeOrder(order: AttributableOrder, index: TouchIndex): Attribution {
  if (!isAttributableOrder(order)) return NONE;

  if ((order.utmSource || '').trim().toLowerCase() === 'bestie') {
    return resolved('direct', 'utm', null, order.occurredAt);
  }

  const assisted = latestTouch(index.byAnon.get(order.anonId || ''), order.occurredAt, ASSISTED_WINDOW_MS);
  if (assisted !== null) return resolved('assisted', 'anon_id', assisted, order.occurredAt);

  const byPhone = latestTouch(index.byPhone.get(order.phone || ''), order.occurredAt, INFLUENCED_WINDOW_MS);
  const byEmail = latestTouch(index.byEmail.get(order.email || ''), order.occurredAt, INFLUENCED_WINDOW_MS);
  if (byPhone !== null || byEmail !== null) {
    const best = Math.max(byPhone ?? -Infinity, byEmail ?? -Infinity);
    const key: MatchKey = best === byPhone ? 'phone' : 'email';
    return resolved('influenced', key, best, order.occurredAt);
  }

  return NONE;
}

/** Carts carry only an email, so they can only reach the influenced tier. */
export function attributeCart(cart: AttributableCart, index: TouchIndex): Attribution {
  const at = latestTouch(index.byEmail.get(cart.email || ''), cart.occurredAt, INFLUENCED_WINDOW_MS);
  return at === null ? NONE : resolved('influenced', 'email', at, cart.occurredAt);
}
