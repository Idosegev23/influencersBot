/**
 * Things that are silently wrong.
 *
 * Every finding carries the route that fixes it, because a finding without a
 * destination is a complaint. Routes are validated against the real route tree
 * by the tool layer before any of this reaches a customer.
 *
 * An empty result is a real answer — "nothing is wrong" is worth saying.
 */

export interface HealthInput {
  coupons: Array<{ code: string; end_date: string | null; is_active: boolean }>;
  productCount: number;
  instagramConnected: boolean;
  openTickets: Array<{ created_at: string }>;
  now: Date;
}

export interface HealthFinding {
  kind: string;
  severity: 'warn' | 'info';
  detail: string;
  route: string | null;
}

const STALE_TICKET_MS = 2 * 86400_000;

export function runHealthCheck(input: HealthInput): HealthFinding[] {
  const findings: HealthFinding[] = [];

  const expired = input.coupons.filter(c => {
    if (!c.is_active || !c.end_date) return false;
    const end = Date.parse(c.end_date);
    return !Number.isNaN(end) && end < input.now.getTime();
  });
  if (expired.length) {
    findings.push({
      kind: 'expired_coupon_active',
      severity: 'warn',
      detail: `${expired.length} קופונים פגי תוקף עדיין פעילים: ${expired.map(c => c.code).join(', ')}`,
      route: '/influencer/[username]/coupons',
    });
  }

  if (!input.instagramConnected) {
    findings.push({
      kind: 'instagram_disconnected',
      severity: 'warn',
      detail: 'חשבון האינסטגרם לא מחובר — הבוט לא עונה על הודעות DM',
      route: '/influencer/[username]/instagram',
    });
  }

  if (input.productCount === 0) {
    findings.push({
      kind: 'empty_catalog',
      severity: 'warn',
      detail: 'אין מוצרים בקטלוג — הבוט לא ימליץ על כלום',
      route: '/influencer/[username]/products',
    });
  }

  const stale = input.openTickets.filter(t => {
    const created = Date.parse(t.created_at);
    return !Number.isNaN(created) && input.now.getTime() - created > STALE_TICKET_MS;
  });
  if (stale.length) {
    findings.push({
      kind: 'stale_tickets',
      severity: 'warn',
      detail: `${stale.length} פניות פתוחות מעל יומיים`,
      route: '/influencer/[username]/support',
    });
  }

  return findings;
}
