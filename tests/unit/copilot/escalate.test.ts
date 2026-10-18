// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
// The staff-mail cap (src/lib/copilot/mail.ts) reads Redis; allowed unless a test says otherwise.
const mailLimiter = vi.fn(async (_a: any): Promise<any> => ({ allowed: true, remaining: 1, resetAt: 0, retryAfterMs: 0 }));
vi.mock('@/lib/redis', () => ({ redisSlidingWindowRateLimit: (a: any) => mailLimiter(a), isRedisAvailable: () => true }));

import { escalateIfNeeded, detectEnglishEscalation, detectCopilotEscalation, assistantFrom } from '@/lib/copilot/escalate';

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
      expect(mail.from.startsWith('"American Bus Association Assistant" <')).toBe(true);
      expect(mail.from.split('<')[0]).not.toMatch(/bestie|influencerbot|imai/i);
      delete process.env.GMAIL_SEND_FROM;
      const send2 = vi.fn(async () => ({ success: true }));
      await escalateIfNeeded(input, { detect: detectYes, sendEmail: send2 as any, db: db() });
      expect((send2.mock.calls[0] as any)[0]).not.toHaveProperty('from');
    } finally {
      if (prev === undefined) delete process.env.GMAIL_SEND_FROM; else process.env.GMAIL_SEND_FROM = prev;
    }
  });
  it('sends as the white-label mailbox when COPILOT_SEND_FROM is set', async () => {
    const prev = [process.env.GMAIL_SEND_FROM, process.env.COPILOT_SEND_FROM];
    try {
      process.env.GMAIL_SEND_FROM = 'mailbox@platform.test';
      process.env.COPILOT_SEND_FROM = 'assistant@multiview.test';
      const sendEmail = vi.fn(async () => ({ success: true }));
      await escalateIfNeeded(input, { detect: detectYes, sendEmail: sendEmail as any, db: db() });
      const mail = (sendEmail.mock.calls[0] as any)[0];
      expect(mail.from).toBe('"American Bus Association Assistant" <assistant@multiview.test>');
      expect(mail.impersonate).toBe('assistant@multiview.test');
      expect(JSON.stringify(mail)).not.toContain('platform.test');
    } finally {
      if (prev[0] === undefined) delete process.env.GMAIL_SEND_FROM; else process.env.GMAIL_SEND_FROM = prev[0];
      if (prev[1] === undefined) delete process.env.COPILOT_SEND_FROM; else process.env.COPILOT_SEND_FROM = prev[1];
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
    ['I will sue you', 'Mentions legal action'],
    ['my lawyer will contact you', 'Mentions legal action'],
    ['We are filing a lawsuit against ABA', 'Mentions legal action'],
    ['I am taking legal action against the association', 'Mentions legal action'],
  ])('escalates: %s', async (m, reason) => {
    expect(await run(m)).toMatchObject({ escalated: true, reason });
  });
});

describe('legal: the shared detector is ignored, Copilot-local threats only', () => {
  const run = (userMessage: string) => escalateIfNeeded({ ...input, userMessage, priorUserMessages: [] }, { sendEmail: vi.fn(async () => ({ success: true })) as any, db: db() });
  it.each([
    'What has the court decided about the ELD mandate?',
    'Can ABA recommend an attorney for DOT compliance?',
    'Do you have a lawyer referral service for members?',
    'Where is the legal action center on your site?',
    'Has ABA filed a lawsuit over the new FMCSA rule?',
  ])('domain question does not escalate: %s', async (m) => {
    expect(await run(m)).toEqual({ escalated: false, reason: null, notified: 0, deduped: false });
  });
  it('keeps abuse and sustained anger from the shared detector', async () => {
    const r = detectCopilotEscalation('you are useless, this is ridiculous', ['this is ridiculous']);
    expect(r.escalate).toBe(true);
    expect(r.triggers).toContain('sustained_anger');
    const shared = vi.fn(() => ({ escalate: true, severity: 'critical', reason: 'x', triggers: ['abuse', 'legal', 'human_demand'] })) as any;
    const v = detectCopilotEscalation('whatever', [], shared);
    expect(v.triggers).toEqual(['abuse']);
    expect(v.severity).toBe('critical');
  });
});

describe('escalation verdict computed up front (I5)', () => {
  it('uses a precomputed verdict instead of detecting again', async () => {
    const detect = vi.fn() as any;
    const d = db();
    const r = await escalateIfNeeded({ ...input, verdict: { escalate: true, severity: 'high', triggers: ['human_demand'] } }, { detect, sendEmail: vi.fn(async () => ({ success: true })) as any, db: d });
    expect(detect).not.toHaveBeenCalled();
    expect(r).toMatchObject({ escalated: true, reason: 'Asked for a staff member' });
    const none = await escalateIfNeeded({ ...input, verdict: { escalate: false, severity: null, triggers: [] } }, { detect, sendEmail: vi.fn() as any, db: db() });
    expect(none.escalated).toBe(false);
  });
});

describe('escalation mail cap and timeout (I2, I5)', () => {
  it('records the request but sends no email when the association mail cap is reached', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mailLimiter.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0, retryAfterMs: 1000 });
    const d = db();
    const sendEmail = vi.fn(async () => ({ success: true }));
    const r = await escalateIfNeeded(input, { detect: detectYes, sendEmail: sendEmail as any, db: d });
    expect(r).toMatchObject({ escalated: true, notified: 0, deduped: false });
    expect(d.inserts).toHaveLength(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(mailLimiter).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'rl:copilot:mail:acc', limit: 30 }));
    expect(err.mock.calls.some((c) => c[0] === '[copilot/mail]')).toBe(true);
    err.mockRestore();
  });
  it('does not hang on a stuck email send', async () => {
    vi.useFakeTimers();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const p = escalateIfNeeded(input, { detect: detectYes, sendEmail: vi.fn(() => new Promise(() => {})) as any, db: db() });
      await vi.advanceTimersByTimeAsync(10_001);
      expect(await p).toMatchObject({ escalated: true, notified: 0 });
    } finally {
      vi.useRealTimers();
      err.mockRestore();
    }
  });
});

describe('assistantFrom (M2)', () => {
  const withFrom = (fn: () => void) => {
    const prev = process.env.GMAIL_SEND_FROM;
    process.env.GMAIL_SEND_FROM = 'mailbox@platform.test';
    try { fn(); } finally { if (prev === undefined) delete process.env.GMAIL_SEND_FROM; else process.env.GMAIL_SEND_FROM = prev; }
  };
  it('quotes an ASCII display name and strips quotes and backslashes', () => withFrom(() => {
    expect(assistantFrom('American Bus Association')).toBe('"American Bus Association Assistant" <mailbox@platform.test>');
    expect(assistantFrom('A "B" \\ C, Inc.\r\nBcc: x@y.z')).toBe('"A B C, Inc. Bcc: x@y.z Assistant" <mailbox@platform.test>');
  }));
  it('RFC 2047-encodes a non-ASCII display name', () => withFrom(() => {
    const from = assistantFrom('LA BEAUTÉ')!;
    const encoded = Buffer.from('LA BEAUTÉ Assistant', 'utf8').toString('base64');
    expect(from).toBe(`=?UTF-8?B?${encoded}?= <mailbox@platform.test>`);
  }));
  it('is undefined without a sender mailbox', () => {
    const prev = process.env.GMAIL_SEND_FROM;
    delete process.env.GMAIL_SEND_FROM;
    try { expect(assistantFrom('ABA')).toBeUndefined(); } finally { if (prev !== undefined) process.env.GMAIL_SEND_FROM = prev; }
  });
});
