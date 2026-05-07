/**
 * Auto-assignment for new support tickets.
 *
 * When a new support_requests row is created we pick a random active
 * agent from the same account and stamp `assigned_agent_id` /
 * `assigned_to`. The act is recorded in support_ticket_history with
 * `actor='system'` and a clear note so the audit trail explains why
 * a ticket showed up assigned even though no human pressed a button.
 *
 * Scoped naturally: accounts without any active support_agents rows
 * (legacy influencers) just won't auto-assign — the ticket stays
 * unassigned exactly as before.
 */

import { supabase } from '@/lib/supabase';

export type AssignableAgent = {
  id: string;
  display_name: string;
  is_admin: boolean;
};

/**
 * Pick a random active agent for an account.
 *
 * Random over round-robin for simplicity — over enough tickets the
 * load evens out, and we don't need cross-request state. If the
 * account has no active agents, returns null and the caller leaves
 * the ticket unassigned.
 */
export async function pickRandomActiveAgent(accountId: string): Promise<AssignableAgent | null> {
  const { data, error } = await supabase
    .from('support_agents')
    .select('id, first_name, last_name, is_admin')
    .eq('account_id', accountId)
    .eq('is_active', true);

  if (error || !data || data.length === 0) return null;

  const pick = data[Math.floor(Math.random() * data.length)];
  return {
    id: pick.id,
    display_name: `${pick.first_name} ${pick.last_name}`,
    is_admin: !!pick.is_admin,
  };
}

/**
 * Auto-assign a freshly-created ticket. Best-effort — failures are
 * logged but don't break the ticket creation flow.
 */
export async function autoAssignNewTicket(
  ticketId: string,
  accountId: string,
): Promise<AssignableAgent | null> {
  try {
    const agent = await pickRandomActiveAgent(accountId);
    if (!agent) return null;

    const { error: updErr } = await supabase
      .from('support_requests')
      .update({
        assigned_agent_id: agent.id,
        assigned_to: agent.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .is('assigned_agent_id', null); // don't clobber if something already assigned

    if (updErr) {
      console.warn('[auto-assign] update failed:', updErr.message);
      return null;
    }

    await supabase.from('support_ticket_history').insert({
      ticket_id: ticketId,
      account_id: accountId,
      action: 'assigned',
      actor: 'system',
      actor_agent_id: agent.id,
      note: agent.display_name,
    });

    return agent;
  } catch (e) {
    console.warn('[auto-assign] unexpected error (non-fatal):', e);
    return null;
  }
}
