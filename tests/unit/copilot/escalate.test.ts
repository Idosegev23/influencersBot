// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));

import { escalateIfNeeded } from '@/lib/copilot/escalate';

function db(existing: any[] = []) {
  const inserts: any[] = [];
  const api: any = {
    inserts,
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: existing, error: null }) }) }) }) }),
      insert: async (row: any) => { inserts.push(row); return { error: null }; },
    }),
  };
  return api;
}
const input = {
  accountId: 'acc', associationName: 'American Bus Association', sessionId: 's1', visitorLabel: 'Anonymous visitor',
  userMessage: 'I want to talk to a human now', priorUserMessages: [], transcript: [{ role: 'user', content: 'I want to talk to a human now' }],
  config: { copilot: { escalation: { recipients: ['staff@buses.org'] } } },
};
const detectYes = vi.fn(() => ({ escalate: true, severity: 'high', reason: 'x', triggers: ['human_demand'] })) as any;

describe('escalateIfNeeded', () => {
  it('does nothing when the detector says no', async () => {
    const d = db();
    const sendEmail = vi.fn();
    const r = await escalateIfNeeded(input, { detect: vi.fn(() => ({ escalate: false, severity: null, reason: '', triggers: [] })) as any, sendEmail: sendEmail as any, db: d });
    expect(r).toEqual({ escalated: false, reason: null, notified: 0, deduped: false });
    expect(d.inserts).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('logs the request and emails staff in English', async () => {
    const d = db();
    const sendEmail = vi.fn(async () => ({ success: true }));
    const r = await escalateIfNeeded(input, { detect: detectYes, sendEmail: sendEmail as any, db: d });
    expect(r).toEqual({ escalated: true, reason: 'Asked for a staff member', notified: 1, deduped: false });
    expect(d.inserts[0]).toMatchObject({ account_id: 'acc', session_id: 's1', source: 'copilot_escalation', escalation_reason: 'Asked for a staff member' });
    const mail = (sendEmail.mock.calls[0] as any)[0];
    expect(mail.to).toEqual(['staff@buses.org']);
    expect(mail.subject).toBe('[American Bus Association] Visitor needs a staff member: Asked for a staff member');
    expect(mail.html).not.toMatch(/[֐-׿]/);
    expect(mail.html).not.toMatch(/bestie|influencerbot|ldrs|imai/i);
  });
  it('dedupes within 15 minutes', async () => {
    const d = db([{ id: 'r1' }]);
    const sendEmail = vi.fn();
    const r = await escalateIfNeeded(input, { detect: detectYes, sendEmail: sendEmail as any, db: d });
    expect(r).toMatchObject({ escalated: true, deduped: true, notified: 0 });
    expect(d.inserts).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('escapes HTML from the transcript', async () => {
    const d = db();
    const sendEmail = vi.fn(async () => ({ success: true }));
    await escalateIfNeeded({ ...input, transcript: [{ role: 'user', content: '<script>x</script>' }] }, { detect: detectYes, sendEmail: sendEmail as any, db: d });
    expect((sendEmail.mock.calls[0] as any)[0].html).toContain('&lt;script&gt;');
  });
});
