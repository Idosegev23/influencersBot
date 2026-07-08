/**
 * Safety-net sweeper for the per-agent WhatsApp FIFO queue. The primary drain trigger is the
 * webhook's publishDrain; this cron is the backstop that recovers an ORPHANED queue — messages
 * sitting in wa:agent:<id>:q with no drain scheduled (e.g. a transient QStash publish failure on
 * the tail of a burst). Every minute it checks each active agent's queue and, if non-empty AND
 * no drain currently holds the lock, fires a fresh drain. Idempotent: a spurious drain that finds
 * the lock held or the queue empty is a no-op.
 */
import { NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { agentQueueLength } from '@/lib/crm/wa-agent-queue';
import { publishDrain } from '@/lib/crm/wa-queue';
import { redisExists } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: agents } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('role', 'agent')
    .eq('status', 'active');

  const swept: { agentId: string; queued: number }[] = [];
  for (const a of agents || []) {
    const agentId = (a as any).id as string;
    let queued = 0;
    try { queued = await agentQueueLength(agentId); } catch { continue; }
    if (queued <= 0) continue;
    // Don't pile on if a drain is already working this agent (lock held).
    let locked = false;
    try { locked = await redisExists(`wa:agent:${agentId}:lock`); } catch { /* treat as unlocked */ }
    if (locked) { swept.push({ agentId, queued: -queued }); continue; } // negative = seen-but-busy
    try { await publishDrain(agentId, { force: true }); swept.push({ agentId, queued }); }
    catch (e) { console.error('[wa-drain-sweep] publishDrain failed', agentId, e); }
  }
  return NextResponse.json({ ok: true, agents: (agents || []).length, swept });
}
