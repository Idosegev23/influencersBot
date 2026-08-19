/**
 * Nightly health rollup. Iterates only accounts that have an account_contracts
 * row — which is how the 44 demo accounts stay off the board without having to
 * repair the inconsistent config.isDemo flag.
 *
 * One row per account PER CHANNEL: a customer can be green on WhatsApp and red
 * on the widget simultaneously, which is the normal case.
 */

import { supabase } from '@/lib/supabase';
import { deriveChannelStatus, DEFAULT_THRESHOLDS } from '@/lib/health/status';
import type { ChannelFacts } from '@/lib/health/status';

export async function rollupAccountHealth(day: string): Promise<{ accounts: number; rows: number }> {
  const { data: contracts, error } = await supabase
    .from('account_contracts')
    .select('account_id, expected_channels')
    .eq('is_paying', true);
  if (error) throw new Error(`contracts read failed: ${error.message}`);
  if (!contracts?.length) return { accounts: 0, rows: 0 };

  const rows: Record<string, unknown>[] = [];
  for (const c of contracts) {
    const { data: facts, error: factsErr } = await supabase.rpc('account_health_facts', {
      p_account_id: c.account_id,
      p_day: day,
    });
    if (factsErr) {
      // A single account's facts call failing (bad UUID, transient DB error)
      // must not abort the whole nightly run — every other account still
      // needs its row written. Skip and keep going.
      console.error(`[health-rollup] facts failed for ${c.account_id}:`, factsErr.message);
      continue;
    }
    for (const channel of (c.expected_channels || []) as string[]) {
      const f = (facts as Record<string, any>)?.[channel];
      if (!f) continue;
      rows.push({
        account_id: c.account_id,
        date: day,
        channel,
        status: deriveChannelStatus(f as ChannelFacts, DEFAULT_THRESHOLDS),
        active_minutes: f.activeMinutes ?? 0,
        distinct_origins: f.distinctOrigins ?? 0,
        loads: f.loadsLast24h ?? 0,
        // Fix 2 (whole-branch review, 2026-08-19): `opens` is a DAILY column,
        // so it must hold the day's OWN opens — `opensToday` — not the
        // rolling `opensLast7d`. Writing the 7-day figure here made
        // admin_health_board's sum() over 7 trailing daily rows sum seven
        // overlapping 7-day windows (~7x inflation). `opensLast7d` is still
        // read separately below for deriveChannelStatus's `dormant` rule —
        // that meaning is unchanged.
        opens: f.opensToday ?? 0,
        messages: f.messages ?? 0,
        sessions: f.sessions ?? 0,
        // `leads` is reserved by the schema but NOT populated in v1 — lead
        // attribution per channel is its own piece of work. It stays 0, and the
        // board must not render it until something actually fills it. A column
        // showing a real-looking zero is worse than no column.
        leads: 0,
        errors: f.errorsLast24h ?? 0,
        computed_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length) {
    const { error: upErr } = await supabase
      .from('account_health_daily')
      .upsert(rows, { onConflict: 'account_id,date,channel' });
    if (upErr) throw new Error(`health upsert failed: ${upErr.message}`);
  }
  return { accounts: contracts.length, rows: rows.length };
}
