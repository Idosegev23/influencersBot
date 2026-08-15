import { describe, it, expect } from 'vitest';
import { stuckSignatureNudge, unpricedBriefNudge, buildDigestText } from '@/lib/crm/agent-nudges';

const now = Date.parse('2026-07-08T09:00:00Z');

describe('nudge predicates (pure)', () => {
  it('flags a signature pending > 3 days with no recent reminder', () => {
    expect(stuckSignatureNudge({ created_at: '2026-07-01T00:00:00Z', status: 'pending', last_reminder_at: null }, now).due).toBe(true);
  });
  it('does NOT flag a signed request', () => {
    expect(stuckSignatureNudge({ created_at: '2026-07-01T00:00:00Z', status: 'signed' }, now).due).toBe(false);
  });
  it('does NOT flag when reminded within cadence', () => {
    expect(stuckSignatureNudge({ created_at: '2026-07-01T00:00:00Z', status: 'pending', last_reminder_at: '2026-07-07T00:00:00Z' }, now).due).toBe(false);
  });
  it('flags an unpriced brief older than 2 days', () => {
    expect(unpricedBriefNudge({ created_at: '2026-07-04T00:00:00Z', brief_status: 'new' }, now).due).toBe(true);
    expect(unpricedBriefNudge({ created_at: '2026-07-07T23:00:00Z', brief_status: 'new' }, now).due).toBe(false);
    expect(unpricedBriefNudge({ created_at: '2026-07-01T00:00:00Z', brief_status: 'priced' }, now).due).toBe(false);
  });
  it('builds a Hebrew digest mentioning the numbers', () => {
    const t = buildDigestText({ quotes: 12, sales: 340000, awaitingPricing: 3, viewedUnsigned: 2 }, 'morning');
    expect(t).toMatch(/340,000|340000/);
    expect(t).toMatch(/3/);
    expect(t).toMatch(/בוקר|היום/);
  });
});
