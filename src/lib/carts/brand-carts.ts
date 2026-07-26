/**
 * Persists abandoned carts. Mirrors src/lib/orders/brand-orders.ts:
 * idempotent upsert on (account_id, external_id) so a re-run of the sweep
 * refreshes reminder_count / recovered_at without duplicating rows.
 */
import { supabase } from '@/lib/supabase';
import { normalizeEmail } from '@/lib/analytics/value-proof/identity';
import type { NormalizedCart } from '@/lib/orders/connectors/quickshop';

export async function upsertBrandCarts(accountId: string, carts: NormalizedCart[]): Promise<number> {
  // abandoned_at is NOT NULL — a cart with no created_at is unusable for any
  // time-windowed metric, so drop it rather than fail the whole batch.
  const rows = carts
    .filter((c) => !!c.abandonedAt)
    .map((c) => ({
      account_id: accountId,
      external_id: c.externalId,
      email: c.email,
      email_norm: normalizeEmail(c.email),
      items: c.items,
      subtotal: c.subtotal,
      checkout_step: c.checkoutStep,
      reminder_count: c.reminderCount,
      reminder_sent_at: c.reminderSentAt,
      recovered_at: c.recoveredAt,
      abandoned_at: c.abandonedAt,
      raw: c.raw,
      synced_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('brand_abandoned_carts')
    .upsert(rows, { onConflict: 'account_id,external_id' });

  if (error) {
    console.error('[brand-carts] upsert failed:', error.message);
    return 0;
  }
  return rows.length;
}
