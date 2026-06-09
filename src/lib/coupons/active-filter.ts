// Single source of truth for "is this coupon valid right now?".
// Date is authoritative: an expired coupon is invalid even if is_active was
// never flipped (the LA BEAUTÉ incident). is_active=false always wins.

export interface CouponValidity {
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
}

/** In-memory predicate. Used for filtering already-fetched coupon objects. */
export function isCouponValid(coupon: CouponValidity, now: Date = new Date()): boolean {
  // Explicit false or null is invalid (matches the SQL `is_active = true`,
  // which excludes NULL). Absent field (undefined) stays valid — those
  // objects came from a source that already filtered is_active upstream.
  if (coupon.is_active === false || coupon.is_active === null) return false;
  if (coupon.start_date && new Date(coupon.start_date) > now) return false;
  if (coupon.end_date && new Date(coupon.end_date) < now) return false;
  return true;
}

/**
 * Applies the canonical predicate to a Supabase/PostgREST query builder.
 * Multiple top-level .or() groups are AND-combined by PostgREST, so this is:
 *   is_active = true
 *   AND (start_date IS NULL OR start_date <= now)
 *   AND (end_date   IS NULL OR end_date   >= now)
 * Returns the same (chainable) query so callers can keep adding .limit()/.order().
 */
export function applyActiveCouponFilter(query: any, now: Date = new Date()): any {
  const nowISO = now.toISOString();
  return query
    .eq('is_active', true)
    .or(`start_date.is.null,start_date.lte.${nowISO}`)
    .or(`end_date.is.null,end_date.gte.${nowISO}`);
}

/** Same predicate as raw SQL, for RPC/migration parity. Assumes alias `c`. */
export const COUPON_VALIDITY_WHERE_SQL =
  `c.is_active = true ` +
  `AND (c.start_date IS NULL OR c.start_date <= now()) ` +
  `AND (c.end_date IS NULL OR c.end_date >= now())`;

/**
 * All coupon codes for an account, regardless of validity. Used to build the
 * invalid-code scrub set (allCodes − validCodes). is_active is intentionally
 * NOT filtered so deactivated/expired codes are included.
 */
export async function getAllCouponCodes(supabase: any, accountId: string): Promise<string[]> {
  const { data } = await supabase.from('coupons').select('code').eq('account_id', accountId);
  return (data || []).map((r: any) => r.code).filter(Boolean);
}

/**
 * Codes that are valid RIGHT NOW, read straight from the live DB (is_active +
 * date window). This is the authoritative allowlist — unlike deriving "valid"
 * from a retrieved knowledge base, it can't be fooled by a cached/stale KB that
 * still carries a since-deactivated coupon. Use it as the source of truth when
 * scrubbing/dropping invalid coupons before the LLM sees them.
 */
export async function getValidCouponCodes(supabase: any, accountId: string): Promise<string[]> {
  const { data } = await applyActiveCouponFilter(
    supabase.from('coupons').select('code').eq('account_id', accountId)
  );
  return (data || []).map((r: any) => r.code).filter(Boolean);
}
