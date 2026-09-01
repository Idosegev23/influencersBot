/**
 * Persistence for what we know about an address's deliverability.
 *
 * Split from ./email-deliverability so the verification logic stays pure and testable
 * without a database, and so the widget-facing validate route can import the checks
 * without dragging Supabase in behind them.
 */

import { supabase } from '@/lib/supabase';
import { normalizeEmail } from '@/lib/support/email-deliverability';

export type DeliverabilityStatus = 'ok' | 'no_mx' | 'bounced';

export async function recordDeliverability(
  address: string,
  status: DeliverabilityStatus,
  reason?: string,
): Promise<void> {
  const key = normalizeEmail(address);
  if (!key) return;
  try {
    await supabase.from('email_deliverability').upsert({
      address: key,
      status,
      reason: reason ?? null,
      checked_at: new Date().toISOString(),
    });
  } catch {
    // Best-effort by design. This table makes an agent's life easier; it must never be the
    // reason a ticket fails to be filed.
  }
}

/**
 * A bounce is ground truth and outranks any probe: the domain may resolve perfectly while
 * the mailbox behind it does not exist, and nothing before the send can see that.
 */
export async function markBounced(address: string, reason: string): Promise<void> {
  const key = normalizeEmail(address);
  if (!key) return;
  try {
    const { data: existing } = await supabase
      .from('email_deliverability')
      .select('bounce_count')
      .eq('address', key)
      .maybeSingle();
    const now = new Date().toISOString();
    await supabase.from('email_deliverability').upsert({
      address: key,
      status: 'bounced',
      reason: reason.slice(0, 500),
      checked_at: now,
      bounce_count: ((existing as any)?.bounce_count ?? 0) + 1,
      last_bounce_at: now,
    });
  } catch {
    // As above — a failure here loses a signal, not a customer.
  }
}

export async function getDeliverability(addresses: string[]): Promise<Map<string, DeliverabilityStatus>> {
  const out = new Map<string, DeliverabilityStatus>();
  const keys = addresses
    .map((a) => normalizeEmail(a))
    .filter((a): a is string => !!a);
  if (!keys.length) return out;
  try {
    const { data } = await supabase
      .from('email_deliverability')
      .select('address, status')
      .in('address', keys);
    for (const row of (data as any[]) || []) out.set(row.address, row.status);
  } catch {
    // An empty map means "nothing known", which every caller already handles.
  }
  return out;
}
