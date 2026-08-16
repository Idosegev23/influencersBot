/**
 * Safety-net sweeper for the per-shopper CS FIFO queue. The primary trigger is the webhook's
 * publishCsDrain; this cron recovers an ORPHANED queue (messages in cs:wa:<waId>:q with no drain
 * scheduled, e.g. a transient QStash blip). Every minute it inspects the active CS session set and,
 * for any non-empty queue whose lock is free, fires a forced drain. Idempotent — a spurious drain
 * that finds the lock held or the queue empty is a no-op.
 */
import { NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { csQueueLength } from '@/lib/cs/wa-cs-queue';
import { csLockKey } from '@/lib/cs/wa-cs-keys';
import { publishCsDrain } from '@/lib/cs/wa-cs-publish';
import { redisExists } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Candidate wa_ids: active CS sessions touched in the last hour (bounded scan).
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: sessions } = await supabaseAdmin
    .from('whatsapp_cs_sessions')
    .select('wa_id, wa_channel_id')
    .gte('last_activity_at', since);

  const swept: { waId: string; queued: number }[] = [];
  for (const s of sessions || []) {
    const waId = (s as any).wa_id as string;
    // Queues, locks and drains are all channel-scoped (migration 075). A session with no
    // channel predates the backfill and has no queue under the new keys — skip it.
    const waChannelId = (s as any).wa_channel_id as string | null;
    if (!waChannelId) continue;
    let queued = 0;
    try { queued = await csQueueLength(waChannelId, waId); } catch { continue; }
    if (queued <= 0) continue;
    let locked = false;
    try { locked = await redisExists(csLockKey(waChannelId, waId)); } catch { /* treat as unlocked */ }
    if (locked) { swept.push({ waId, queued: -queued }); continue; } // negative = seen-but-busy
    try { await publishCsDrain(waChannelId, waId, { force: true }); swept.push({ waId, queued }); }
    catch (e) { console.error('[cs-drain-sweep] publishCsDrain failed', waId, e); }
  }
  return NextResponse.json({ ok: true, sessions: (sessions || []).length, swept });
}
