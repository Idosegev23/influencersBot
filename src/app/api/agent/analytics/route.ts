import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAgentSession } from '@/lib/auth/agent-auth';

export const runtime = 'nodejs';

const RESOLVED_STATUSES = ['resolved', 'closed', 'cancelled'] as const;

/**
 * Admin-only: support analytics for the logged-in agent's account.
 *
 * Returns:
 *  - per-status totals (within the requested window)
 *  - per-agent breakdown: tickets touched, tickets resolved, avg resolution
 *    minutes, last activity
 *  - recent activity feed (latest 25 history rows)
 *
 * Query params:
 *  - from, to (ISO dates) — narrow the window. Default: last 30 days.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const accountUsername = url.searchParams.get('accountUsername');
  if (!accountUsername) {
    return NextResponse.json({ error: 'accountUsername required' }, { status: 400 });
  }

  const session = await getAgentSession(accountUsername);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!session.is_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromIso = url.searchParams.get('from') || defaultFrom.toISOString();
  const toIso = url.searchParams.get('to') || now.toISOString();

  // 1) Per-status totals (windowed) + overall counts
  const { data: ticketRows, error: tErr } = await supabase
    .from('support_requests')
    .select('id, status, assigned_agent_id, created_at, resolved_at')
    .eq('account_id', session.account_id)
    .gte('created_at', fromIso)
    .lte('created_at', toIso);

  if (tErr) {
    console.error('[analytics] tickets fetch:', tErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const tickets = ticketRows || [];
  const statusCounts: Record<string, number> = { all: tickets.length };
  for (const t of tickets) {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  }

  // 2) Per-agent breakdown — based on history rows (who touched what)
  const { data: agents } = await supabase
    .from('support_agents')
    .select('id, first_name, last_name, is_admin, last_login_at')
    .eq('account_id', session.account_id)
    .eq('is_active', true);

  const agentMap = new Map<string, any>();
  for (const a of agents || []) {
    agentMap.set(a.id, {
      id: a.id,
      display_name: `${a.first_name} ${a.last_name}`,
      is_admin: a.is_admin,
      last_login_at: a.last_login_at,
      tickets_touched: 0,
      tickets_resolved: 0,
      tickets_assigned_open: 0,
      avg_resolution_minutes: null as number | null,
      _resolution_minutes: [] as number[],
      _touched_ticket_ids: new Set<string>(),
    });
  }

  // History within window — for "tickets touched" + activity feed
  const { data: histRows } = await supabase
    .from('support_ticket_history')
    .select('id, ticket_id, action, actor, actor_agent_id, from_status, to_status, note, created_at')
    .eq('account_id', session.account_id)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false });

  const history = histRows || [];

  for (const h of history) {
    if (!h.actor_agent_id) continue;
    const a = agentMap.get(h.actor_agent_id);
    if (!a) continue;
    a._touched_ticket_ids.add(h.ticket_id);
    if (h.action === 'status_change' && h.to_status && RESOLVED_STATUSES.includes(h.to_status as any)) {
      a.tickets_resolved += 1;
    }
  }

  // Per-ticket assignment + resolution time, attributed to the assignee
  for (const t of tickets) {
    if (!t.assigned_agent_id) continue;
    const a = agentMap.get(t.assigned_agent_id);
    if (!a) continue;
    if (t.resolved_at) {
      const minutes = Math.max(
        0,
        Math.floor((new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 60000),
      );
      a._resolution_minutes.push(minutes);
    } else {
      a.tickets_assigned_open += 1;
    }
  }

  const agentBreakdown = Array.from(agentMap.values())
    .map((a) => {
      const arr = a._resolution_minutes as number[];
      a.avg_resolution_minutes = arr.length
        ? Math.round(arr.reduce((s: number, n: number) => s + n, 0) / arr.length)
        : null;
      a.tickets_touched = a._touched_ticket_ids.size;
      delete a._resolution_minutes;
      delete a._touched_ticket_ids;
      return a;
    })
    .sort((a: any, b: any) => b.tickets_touched - a.tickets_touched);

  // 3) Overall avg resolution time across the window
  const overallResolutionMins: number[] = [];
  for (const t of tickets) {
    if (t.resolved_at) {
      const m = Math.max(
        0,
        Math.floor((new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 60000),
      );
      overallResolutionMins.push(m);
    }
  }
  const overallAvg = overallResolutionMins.length
    ? Math.round(overallResolutionMins.reduce((s, n) => s + n, 0) / overallResolutionMins.length)
    : null;

  return NextResponse.json({
    window: { from: fromIso, to: toIso },
    statusCounts,
    overall: {
      total: tickets.length,
      resolved: overallResolutionMins.length,
      avg_resolution_minutes: overallAvg,
    },
    agents: agentBreakdown,
    activity: history.slice(0, 25),
  });
}
