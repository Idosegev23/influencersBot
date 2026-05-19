/**
 * Auto-assignment for new support tickets — load-balanced.
 *
 * When a new support_requests row is created we:
 *   1. Assign the new ticket to the agent with the FEWEST open tickets
 *      (random tiebreak among equally-loaded agents).
 *   2. Run a bounded rebalance pass that moves still-untouched
 *      (status='new') tickets from the heaviest agents to the lightest,
 *      so workload stays approximately even across the team even when
 *      some agents close faster than others.
 *
 * Only `status='new'` tickets are eligible for rebalancing — once an
 * agent has set the status to anything else (in_progress, awaiting_customer,
 * shipped) the ticket is theirs; reassigning mid-handling would surprise
 * both the customer and the agent.
 *
 * Best-effort throughout: any failure logs and returns; the user-facing
 * ticket-creation flow never blocks on assignment.
 */

import { supabase } from '@/lib/supabase';

export type AssignableAgent = {
  id: string;
  display_name: string;
  is_admin: boolean;
};

type AgentLoad = {
  agent: AssignableAgent;
  openCount: number;
};

const TERMINAL_STATUSES = ['resolved', 'closed', 'cancelled'] as const;

// Cap moves per trigger so a one-time backlog can't stall a single
// ticket-creation request. The trigger runs again on every new ticket,
// so the system converges over a handful of creations even when the
// starting imbalance is large.
const MAX_REBALANCE_MOVES = 50;

// Don't reassign once the gap is small — without a threshold the queue
// would thrash on ties. 1 means we stop when max-min <= 1.
const MIN_GAP_TO_REBALANCE = 1;

async function fetchAgentLoads(accountId: string): Promise<AgentLoad[]> {
  // is_routable is independent of is_active — an agent can keep login access
  // while being excluded from the auto-assign pool (e.g. a PM who handles
  // existing tickets but shouldn't be on the rota for new ones).
  const { data: agents, error: aErr } = await supabase
    .from('support_agents')
    .select('id, first_name, last_name, is_admin')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .eq('is_admin', false)
    .eq('is_routable', true);

  if (aErr || !agents || agents.length === 0) return [];

  const agentIds = agents.map((a) => a.id);
  const { data: tickets, error: tErr } = await supabase
    .from('support_requests')
    .select('assigned_agent_id')
    .in('assigned_agent_id', agentIds)
    .neq('status', 'resolved')
    .neq('status', 'closed')
    .neq('status', 'cancelled');

  if (tErr) {
    console.warn('[auto-assign] count query failed:', tErr.message);
    return [];
  }

  const counts = new Map<string, number>();
  for (const t of tickets || []) {
    if (!t.assigned_agent_id) continue;
    counts.set(t.assigned_agent_id, (counts.get(t.assigned_agent_id) || 0) + 1);
  }

  return agents.map((a) => ({
    agent: {
      id: a.id,
      display_name: `${a.first_name} ${a.last_name}`,
      is_admin: !!a.is_admin,
    },
    openCount: counts.get(a.id) || 0,
  }));
}

function pickLightest(loads: AgentLoad[]): AgentLoad | null {
  if (loads.length === 0) return null;
  // Random tiebreak: shuffle equally-loaded agents before picking the
  // minimum, so the same agent doesn't always win when counts are tied.
  const sorted = [...loads].sort((a, b) => {
    if (a.openCount !== b.openCount) return a.openCount - b.openCount;
    return Math.random() - 0.5;
  });
  return sorted[0];
}

async function moveOneNewTicket(
  accountId: string,
  fromAgent: AssignableAgent,
  toAgent: AssignableAgent,
): Promise<boolean> {
  const { data: ticket } = await supabase
    .from('support_requests')
    .select('id')
    .eq('account_id', accountId)
    .eq('assigned_agent_id', fromAgent.id)
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ticket) return false;

  const { error: updErr, data: updated } = await supabase
    .from('support_requests')
    .update({
      assigned_agent_id: toAgent.id,
      assigned_to: toAgent.display_name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id)
    .eq('status', 'new') // status changed under us → don't move
    .select('id')
    .maybeSingle();
  if (updErr || !updated) {
    if (updErr) console.warn('[auto-assign rebalance] update failed:', updErr.message);
    return false;
  }

  await supabase.from('support_ticket_history').insert({
    ticket_id: ticket.id,
    account_id: accountId,
    action: 'assigned',
    actor: 'system',
    actor_agent_id: toAgent.id,
    note: `איזון עומס: הועברה מ-${fromAgent.display_name} ל-${toAgent.display_name}`,
  });
  return true;
}

async function rebalance(accountId: string, loads: AgentLoad[]): Promise<number> {
  let moves = 0;
  while (moves < MAX_REBALANCE_MOVES) {
    const sorted = [...loads].sort((a, b) => b.openCount - a.openCount);
    const heavy = sorted[0];
    const light = sorted[sorted.length - 1];
    if (heavy.openCount - light.openCount <= MIN_GAP_TO_REBALANCE) break;

    const moved = await moveOneNewTicket(accountId, heavy.agent, light.agent);
    if (!moved) {
      // Heavy has no movable 'new' tickets — its load is locked. Drop
      // it from the pool and retry with the next-heaviest. Without this
      // we'd loop forever on an agent whose tickets are all in_progress.
      heavy.openCount = -Infinity;
      continue;
    }
    // Update in-memory counts so the next iteration's sort is correct
    // without re-querying the DB.
    heavy.openCount -= 1;
    light.openCount += 1;
    moves++;
  }
  return moves;
}

/**
 * Auto-assign a freshly-created ticket and rebalance the team's queue.
 * Returns the agent the new ticket was assigned to (or null if there
 * are no eligible agents on the account).
 */
export async function autoAssignNewTicket(
  ticketId: string,
  accountId: string,
): Promise<AssignableAgent | null> {
  try {
    const loads = await fetchAgentLoads(accountId);
    const target = pickLightest(loads);
    if (!target) return null;

    const { error: updErr } = await supabase
      .from('support_requests')
      .update({
        assigned_agent_id: target.agent.id,
        assigned_to: target.agent.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .is('assigned_agent_id', null);

    if (updErr) {
      console.warn('[auto-assign] update failed:', updErr.message);
      return null;
    }

    await supabase.from('support_ticket_history').insert({
      ticket_id: ticketId,
      account_id: accountId,
      action: 'assigned',
      actor: 'system',
      actor_agent_id: target.agent.id,
      note: target.agent.display_name,
    });

    // Reflect the newly-assigned ticket in the in-memory count before
    // rebalancing, then redistribute backlog from heavy agents.
    target.openCount += 1;
    const moves = await rebalance(accountId, loads);
    if (moves > 0) {
      console.log(`[auto-assign] rebalanced ${moves} ticket(s) for account ${accountId}`);
    }

    return target.agent;
  } catch (e) {
    console.warn('[auto-assign] unexpected error (non-fatal):', e);
    return null;
  }
}

/**
 * Legacy export — kept so any external caller that imported the old
 * random-pick helper doesn't crash. Internally delegates to the new
 * least-loaded picker.
 */
export async function pickRandomActiveAgent(accountId: string): Promise<AssignableAgent | null> {
  const loads = await fetchAgentLoads(accountId);
  const target = pickLightest(loads);
  return target?.agent ?? null;
}
