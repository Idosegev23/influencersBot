/**
 * One-time backfill: seed install_pings from the 90 days of widget_loaded events
 * already sitting in widget_events.
 *
 * Without this the board is born empty and every customer shows never_installed
 * on day one. Migration 057 in this repo carries the same warning about applying
 * a read-side change before its pipeline has data. A board that launches all-red
 * loses trust immediately and nobody opens it again.
 *
 * Caveat, stated plainly: widget_events has no host column, so historical rows
 * cannot tell us WHICH domain served them. Backfilled rows use the synthetic
 * origin 'backfill://widget_events' — enough to establish everPinged and a
 * last-seen date, not enough for the per-domain drill-down. Real origins start
 * accumulating from the day Task 3 ships.
 *
 * Second caveat (review round 1, Minor 1): the RPC sets active_minutes to a
 * raw widget_loaded event COUNT for the day, not the Redis-deduped minute
 * count install_pings normally holds (that column saturates at 1440 — see
 * migration 078's comment on install_pings). A busy historical day can produce
 * a backfilled active_minutes far above 1440. This doesn't affect the health
 * board's status column — activeMinutes isn't part of ChannelFacts — but never
 * render a backfilled active_minutes as real traffic or real active-minutes.
 *
 * Run: npx tsx scripts/backfill-install-history.ts
 */

import { supabase } from '../src/lib/supabase';

async function main() {
  const { data, error } = await supabase.rpc('backfill_install_pings');
  if (error) throw new Error(error.message);
  console.log('backfilled rows:', data);
}

main().catch((e) => { console.error(e); process.exit(1); });
