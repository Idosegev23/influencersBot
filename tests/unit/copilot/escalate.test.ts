// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));

import { escalateIfNeeded, detectEnglishEscalation } from '@/lib/copilot/escalate';

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
    const r = await escalateIfNeeded({ ...input, userMessage: 'What are the membership dues?' }, { detect: vi.fn(() => ({ escalate: false, severity: null, reason: '', triggers: [] })) as any, sendEmail: sendEmail as any, db: d });
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

describe('escalateIfNeeded fixes', () => {
  it('inserts a non-empty customer_name and message', async () => {
    const d = db();
    await escalateIfNeeded(input, { detect: detectYes, sendEmail: vi.fn(async () => ({ success: true })) as any, db: d });
    expect(d.inserts[0].customer_name).toBeTruthy();
    expect(d.inserts[0].message).toBeTruthy();
    const d2 = db();
    await escalateIfNeeded({ ...input, visitorLabel: '  ' }, { detect: detectYes, sendEmail: vi.fn(async () => ({ success: true })) as any, db: d2 });
    expect(d2.inserts[0].customer_name).toBe('Website visitor');
  });
  it('sends from the association display name when GMAIL_SEND_FROM is set, omits it otherwise', async () => {
    const prev = process.env.GMAIL_SEND_FROM;
    try {
      process.env.GMAIL_SEND_FROM = 'mailbox@platform.test';
      const sendEmail = vi.fn(async () => ({ success: true }));
      await escalateIfNeeded(input, { detect: detectYes, sendEmail: sendEmail as any, db: db() });
      const mail = (sendEmail.mock.calls[0] as any)[0];
      expect(mail.from.startsWith('American Bus Association Assistant <')).toBe(true);
      expect(mail.from.split('<')[0]).not.toMatch(/bestie|influencerbot|imai/i);
      delete process.env.GMAIL_SEND_FROM;
      const send2 = vi.fn(async () => ({ success: true }));
      await escalateIfNeeded(input, { detect: detectYes, sendEmail: send2 as any, db: db() });
      expect((send2.mock.calls[0] as any)[0]).not.toHaveProperty('from');
    } finally {
      if (prev === undefined) delete process.env.GMAIL_SEND_FROM; else process.env.GMAIL_SEND_FROM = prev;
    }
  });
  it('drops malformed recipients and logs a failed send', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sendEmail = vi.fn(async () => ({ success: false, error: 'boom' }));
    const cfg = { copilot: { escalation: { recipients: ['ok@buses.org', 'a@b', 'x y@z.org', 'a@b.org, c@d.org', 7] } } };
    const r = await escalateIfNeeded({ ...input, config: cfg }, { detect: detectYes, sendEmail: sendEmail as any, db: db() });
    expect((sendEmail.mock.calls[0] as any)[0].to).toEqual(['ok@buses.org']);
    expect(r.notified).toBe(0);
    expect(err.mock.calls.some((c) => c[1] === 'email failed')).toBe(true);
    err.mockRestore();
  });
  it('escalates on English staff requests via the local detector', async () => {
    const noShared = vi.fn(() => ({ escalate: false, severity: null, reason: '', triggers: [] })) as any;
    for (const m of ['I want to speak to someone', 'can I talk to a person', 'please have staff contact me']) {
      const d = db();
      const r = await escalateIfNeeded({ ...input, userMessage: m }, { detect: noShared, sendEmail: vi.fn(async () => ({ success: true })) as any, db: d });
      expect(r).toMatchObject({ escalated: true, reason: 'Asked for a staff member' });
      expect(d.inserts[0].metadata.copilot.triggers).toEqual(['human_demand']);
    }
  });
});

describe('detectEnglishEscalation', () => {
  it('human demand', () => {
    for (const m of ['I want to speak to someone', 'can I talk to a person', 'please have staff contact me', 'a human please']) {
      expect(detectEnglishEscalation(m)).toMatchObject({ escalate: true, triggers: ['human_demand'] });
    }
  });
  it('anger needs the current and a prior message', () => {
    expect(detectEnglishEscalation('this is ridiculous').escalate).toBe(false);
    expect(detectEnglishEscalation('this is ridiculous', ['you are useless'])).toMatchObject({ escalate: true, triggers: ['sustained_anger'] });
    expect(detectEnglishEscalation('this is ridiculous', ['hello']).escalate).toBe(false);
  });
  it('ignores negated and ordinary contact phrasing', () => {
    for (const m of ["I don't want to speak to someone", 'no need to talk to a person', 'Please do not contact me', 'Will you contact me with updates?']) {
      expect(detectEnglishEscalation(m).escalate).toBe(false);
    }
  });
  it('does not fire on ordinary text', () => {
    expect(detectEnglishEscalation('Tell me about human resources at ABA').escalate).toBe(false);
  });
});

describe('escalateIfNeeded merged path (real shared detector)', () => {
  const run = (userMessage: string, priorUserMessages: string[] = []) => {
    const d = db();
    const sendEmail = vi.fn(async () => ({ success: true }));
    return escalateIfNeeded({ ...input, userMessage, priorUserMessages }, { sendEmail: sendEmail as any, db: d });
  };
  it.each([
    'Do you offer human trafficking training?',
    'Where can I find human resources guidance?',
    'Who is my congressional representative?',
    'I want to become a fleet manager',
    'Please do not contact me',
    "Don't call someone about this",
    'Will you contact me with updates?',
  ])('does not escalate: %s', async (m) => {
    expect(await run(m)).toEqual({ escalated: false, reason: null, notified: 0, deduped: false });
  });
  it.each([
    ['I want to speak to someone', 'Asked for a staff member'],
    ['can I talk to a person', 'Asked for a staff member'],
    ['Can I speak with someone about membership?', 'Asked for a staff member'],
    ["I'll contact my lawyer", 'Mentions legal action'],
  ])('escalates: %s', async (m, reason) => {
    expect(await run(m)).toMatchObject({ escalated: true, reason });
  });
});
