import { describe, it, expect } from 'vitest';
import { buildPulse } from '@/lib/bestie/dashboard/pulse';

const now = new Date('2026-07-26T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

describe('buildPulse', () => {
  it('counts this week against last week', () => {
    const pulse = buildPulse({
      conversations: [
        { created_at: daysAgo(1) }, { created_at: daysAgo(3) }, { created_at: daysAgo(6) },
        { created_at: daysAgo(9) }, { created_at: daysAgo(12) },
      ],
      tickets: [],
      now,
    });
    expect(pulse.thisWeek.conversations).toBe(3);
    expect(pulse.lastWeek.conversations).toBe(2);
    expect(pulse.conversationDeltaPct).toBe(50);
  });

  it('reports deflection as the share of conversations with no ticket', () => {
    const pulse = buildPulse({
      conversations: Array.from({ length: 10 }, () => ({ created_at: daysAgo(2) })),
      tickets: Array.from({ length: 2 }, () => ({
        created_at: daysAgo(2), source: 'widget_support', escalation_reason: null,
      })),
      now,
    });
    expect(pulse.deflectionPct).toBe(80);
  });

  it('ranks escalation reasons', () => {
    const pulse = buildPulse({
      conversations: [{ created_at: daysAgo(1) }],
      tickets: [
        { created_at: daysAgo(1), source: 'auto_escalation', escalation_reason: 'shipping' },
        { created_at: daysAgo(2), source: 'auto_escalation', escalation_reason: 'shipping' },
        { created_at: daysAgo(2), source: 'auto_escalation', escalation_reason: 'returns' },
      ],
      now,
    });
    expect(pulse.topEscalationReasons[0]).toEqual({ reason: 'shipping', count: 2 });
  });

  it('returns null deltas rather than a fake 0% when there is no baseline', () => {
    // A brand live for three days has no "last week". Saying 0% would be a lie.
    const pulse = buildPulse({ conversations: [{ created_at: daysAgo(1) }], tickets: [], now });
    expect(pulse.conversationDeltaPct).toBeNull();
  });

  it('returns null deflection rather than 100% when there were no conversations', () => {
    const pulse = buildPulse({ conversations: [], tickets: [], now });
    expect(pulse.deflectionPct).toBeNull();
  });

  it('ignores tickets with no recorded reason instead of inventing one', () => {
    const pulse = buildPulse({
      conversations: [{ created_at: daysAgo(1) }],
      tickets: [{ created_at: daysAgo(1), source: 'widget_support', escalation_reason: null }],
      now,
    });
    expect(pulse.topEscalationReasons).toEqual([]);
  });
});
