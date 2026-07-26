/**
 * What changed in this account, in the two or three facts a person would have
 * noticed if they had looked.
 *
 * Pure: rows in, summary out. Nulls are load-bearing — a brand live for three
 * days has no "last week", and reporting 0% change would be a fabrication
 * dressed as a measurement. Every consumer must render null as "not enough
 * history", never as zero.
 */
const WEEK_MS = 7 * 86400_000;

export interface PulseInput {
  conversations: Array<{ created_at: string }>;
  tickets: Array<{ created_at: string; source: string | null; escalation_reason: string | null }>;
  now: Date;
}

export interface Pulse {
  thisWeek: { conversations: number; tickets: number };
  lastWeek: { conversations: number; tickets: number };
  conversationDeltaPct: number | null;
  deflectionPct: number | null;
  topEscalationReasons: Array<{ reason: string; count: number }>;
}

function inWindow(iso: string, now: Date, fromAge: number, toAge: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= fromAge && age < toAge;
}

export function buildPulse(input: PulseInput): Pulse {
  const { conversations, tickets, now } = input;

  const thisWeekConvos = conversations.filter(c => inWindow(c.created_at, now, 0, WEEK_MS)).length;
  const lastWeekConvos = conversations.filter(c => inWindow(c.created_at, now, WEEK_MS, 2 * WEEK_MS)).length;
  const thisWeekTickets = tickets.filter(t => inWindow(t.created_at, now, 0, WEEK_MS)).length;
  const lastWeekTickets = tickets.filter(t => inWindow(t.created_at, now, WEEK_MS, 2 * WEEK_MS)).length;

  const reasonCounts = new Map<string, number>();
  for (const ticket of tickets) {
    const reason = ticket.escalation_reason?.trim();
    if (!reason) continue; // no reason recorded — do not guess one
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  return {
    thisWeek: { conversations: thisWeekConvos, tickets: thisWeekTickets },
    lastWeek: { conversations: lastWeekConvos, tickets: lastWeekTickets },
    conversationDeltaPct: lastWeekConvos > 0
      ? Math.round(((thisWeekConvos - lastWeekConvos) / lastWeekConvos) * 100)
      : null,
    deflectionPct: thisWeekConvos > 0
      ? Math.round(((thisWeekConvos - thisWeekTickets) / thisWeekConvos) * 100)
      : null,
    topEscalationReasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
