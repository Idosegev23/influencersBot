/**
 * Auto-assignment for new support tickets.
 *
 * Rule: a ticket is assigned once, at the moment it arrives, and the
 * system never moves it afterwards. An earlier version also "rebalanced"
 * the backlog by moving status='new' tickets from busy agents to idle
 * ones. In practice agents often handle a ticket without touching its
 * status, so adding one agent to LA BEAUTÉ (2026-10-06) moved ~130
 * already-handled tickets onto her, ping-ponging ~1,200 times in 17
 * minutes. Moving an existing ticket is now a human decision only.
 *
 * Load = tickets assigned to the agent that arrived in the last 24 hours.
 * Counting the whole open backlog would send every new ticket to a newly
 * added agent for weeks; a 24h window balances the incoming flow and a
 * new agent catches up within a day.
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
  recentCount: number;
};

const LOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

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

  const since = new Date(Date.now() - LOAD_WINDOW_MS).toISOString();
  const { data: tickets, error: tErr } = await supabase
    .from('support_requests')
    .select('assigned_agent_id')
    .eq('account_id', accountId)
    .in('assigned_agent_id', agents.map((a) => a.id))
    .gte('created_at', since);

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
    recentCount: counts.get(a.id) || 0,
  }));
}

function pickLightest(loads: AgentLoad[]): AgentLoad | null {
  if (loads.length === 0) return null;
  // Random tiebreak so the same agent doesn't always win when counts are tied.
  const sorted = [...loads].sort((a, b) => {
    if (a.recentCount !== b.recentCount) return a.recentCount - b.recentCount;
    return Math.random() - 0.5;
  });
  return sorted[0];
}

/**
 * Assign a freshly-created, still-unassigned ticket. Never touches any
 * other ticket. Returns the agent it went to, or null if there are no
 * eligible agents on the account.
 */
export async function autoAssignNewTicket(
  ticketId: string,
  accountId: string,
): Promise<AssignableAgent | null> {
  try {
    const target = pickLightest(await fetchAgentLoads(accountId));
    if (!target) return null;

    const { data: updated, error: updErr } = await supabase
      .from('support_requests')
      .update({
        assigned_agent_id: target.agent.id,
        assigned_to: target.agent.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .is('assigned_agent_id', null)
      .select('id')
      .maybeSingle();

    if (updErr) {
      console.warn('[auto-assign] update failed:', updErr.message);
      return null;
    }
    if (!updated) return null; // someone assigned it first

    await supabase.from('support_ticket_history').insert({
      ticket_id: ticketId,
      account_id: accountId,
      action: 'assigned',
      actor: 'system',
      actor_agent_id: target.agent.id,
      note: target.agent.display_name,
    });

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
