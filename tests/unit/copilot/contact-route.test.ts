// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeDb, hasOp, type Chain } from './copilot-db-mock';

const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const VID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SID = '11111111-2222-4333-8444-555555555555';
const baseVisitor = { id: VID, account_id: 'acc', partner_id: 'pA', anon_id: 'anon_aaaaaaaaaaaaaaaa', identity_source: null, member_ref: null, email: null, name: null, company: null, company_domain: null, membership: null, merged_into: null };
const CONFIG: any = {
  display_name: 'ABA',
  copilot: {
    escalation: { recipients: ['staff@aba.org', 'bad address'] },
    ams: { provider: 'stub', stub_members: [{ memberRef: 'M1', email: 'jane@acme.com', name: 'Jane', company: 'Acme Coaches', status: 'active', type: 'Operator', renewalDate: '2026-11-15', registrations: [] }, { memberRef: 'M2', email: 'pat@gmail.com', name: 'Pat Quill', company: 'Acme Coaches', status: 'active', type: 'Operator', renewalDate: null, registrations: [] }] },
  },
};

vi.mock('@/lib/copilot/auth', () => ({ requireTenant: async () => T }));
const loadAssociation = vi.fn();
vi.mock('@/lib/copilot/association', () => ({ loadAssociation: (...a: any[]) => loadAssociation(...a) }));
const getVisitor = vi.fn();
const applyIdentity = vi.fn(async (_t: any, v: any, upd: any) => ({ visitor: { ...v, identity_source: upd.source }, merged: false }));
vi.mock('@/lib/copilot/visitors', async (orig) => ({ ...(await orig<any>()), getVisitor: (...a: any[]) => getVisitor(...a), applyIdentity: (...a: any[]) => applyIdentity(...(a as [any, any, any])) }));
let amsDown = false;
vi.mock('@/lib/copilot/ams', async (orig) => {
  const real = await orig<any>();
  const { AmsUnavailableError } = await import('@/lib/copilot/ams/types');
  return { getAmsAdapter: (c: unknown) => amsDown ? { getMember: async () => null, findMemberByEmail: async () => { throw new AmsUnavailableError('down'); } } : real.getAmsAdapter(c) };
});
const recordEvents = vi.fn();
vi.mock('@/lib/copilot/events', () => ({ recordEvents: (...a: any[]) => recordEvents(...a) }));
const checkChatLimits = vi.fn();
vi.mock('@/lib/copilot/rate-limit', () => ({ checkChatLimits: (...a: any[]) => checkChatLimits(...a) }));
const sendEmail = vi.fn();
vi.mock('@/lib/email', () => ({ sendEmail: (...a: any[]) => sendEmail(...a) }));
// The per-association staff-mail cap (src/lib/copilot/mail.ts) reads Redis.
const mailLimiter = vi.fn();
vi.mock('@/lib/redis', () => ({ redisSlidingWindowRateLimit: (a: any) => mailLimiter(a), isRedisAvailable: () => true }));

let session: any = null;
let messages: any[] = [];
let priorNotified: any[] = [];
let priorError: any = null;
const mock = makeDb((c: Chain) => {
  if (c.table === 'chat_sessions') return { data: session, error: null };
  if (c.table === 'interaction_events') return { data: priorError ? null : priorNotified, error: priorError };
  if (c.table === 'chat_messages') return { data: messages, error: null };
  return { data: null, error: null };
});
vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mock.db.from(t) } }));

import { POST } from '@/app/api/partner/v1/contact/route';

const req = (b: any) => new Request('http://x/api/partner/v1/contact', { method: 'POST', body: JSON.stringify(b) }) as any;
const visitorUpdates = () => mock.calls.filter((c) => c.table === 'visitors');
const VENDOR = /bestie|influencerbot|ldrs|imai/i;

beforeEach(() => {
  vi.clearAllMocks();
  mock.calls.length = 0;
  amsDown = false;
  session = { id: SID, account_id: 'acc', visitor_id: VID };
  messages = [{ role: 'assistant', content: 'Dues are <b>$500</b>.' }, { role: 'user', content: 'What are the dues?' }];
  loadAssociation.mockResolvedValue({ accountId: 'acc', partnerId: 'pA', industry: 'motorcoach', branding: {}, openingQuestions: [], config: CONFIG });
  getVisitor.mockResolvedValue({ ...baseVisitor });
  checkChatLimits.mockResolvedValue({ allowed: true });
  sendEmail.mockResolvedValue({ success: true });
  mailLimiter.mockResolvedValue({ allowed: true, remaining: 1, resetAt: 0, retryAfterMs: 0 });
  priorNotified = [];
  priorError = null;
  process.env.GMAIL_SEND_FROM = 'assistant@mail.test';
});

describe('POST /contact', () => {
  it('a typed member email is never a verified identity: no memberRef, membership or AMS company; only the domain company', async () => {
    const res = await POST(req({ visitorId: VID, sessionId: SID, email: 'Jane@Acme.com', name: 'Jane D', consent: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(applyIdentity).toHaveBeenCalledTimes(1);
    const upd = applyIdentity.mock.calls[0][2];
    expect(upd).toEqual({ source: 'ams_email', email: 'jane@acme.com', company: 'Acme', companyDomain: 'acme.com', name: 'Jane D' });
    expect(upd).not.toHaveProperty('memberRef');
    expect(upd).not.toHaveProperty('membership');
    expect(recordEvents).toHaveBeenCalledWith(expect.objectContaining({ visitorId: VID, accountId: 'acc' }), [expect.objectContaining({ type: 'contact_captured', sessionId: SID, payload: { source: 'ams_email', staff_notified: true } })]);
    expect(checkChatLimits).toHaveBeenCalledWith({ accountId: 'acc', anonId: 'anon_aaaaaaaaaaaaaaaa' });
  });

  it('a typed member email without a typed name does not take the member record name', async () => {
    await POST(req({ visitorId: VID, email: 'jane@acme.com', consent: true }));
    const upd = applyIdentity.mock.calls[0][2];
    expect(upd).toEqual({ source: 'ams_email', email: 'jane@acme.com', company: 'Acme', companyDomain: 'acme.com' });
  });

  it('an AMS match on a consumer domain writes no company unless the visitor typed one', async () => {
    await POST(req({ visitorId: VID, email: 'pat@gmail.com', consent: true }));
    expect(applyIdentity.mock.calls[0][2]).toEqual({ source: 'ams_email', email: 'pat@gmail.com' });
    await POST(req({ visitorId: VID, email: 'pat@gmail.com', company: 'Quill Bus Co', consent: true }));
    expect(applyIdentity.mock.calls[1][2]).toEqual({ source: 'ams_email', email: 'pat@gmail.com', company: 'Quill Bus Co' });
    expect(JSON.stringify(applyIdentity.mock.calls)).not.toContain('Acme Coaches');
    expect(JSON.stringify(applyIdentity.mock.calls)).not.toContain('Pat Quill');
  });

  it('the response is identical for members and non-members (no AMS oracle)', async () => {
    const bodies: string[] = [];
    for (const email of ['pat@gmail.com', 'sam@gmail.com', 'jane@acme.com', 'bob@greyline-tours.com']) {
      const res = await POST(req({ visitorId: VID, email, consent: true }));
      expect(res.status).toBe(200);
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual({ ok: true });
  });

  it('never changes a verified (login or newsletter) visitor, but still records the contact', async () => {
    for (const source of ['ams_login', 'newsletter']) {
      for (const email of ['sam@gmail.com', 'bob@greyline-tours.com', 'jane@acme.com']) {
        vi.clearAllMocks();
        mock.calls.length = 0;
        getVisitor.mockResolvedValueOnce({ ...baseVisitor, identity_source: source, member_ref: 'M7' });
        const res = await POST(req({ visitorId: VID, email, name: 'Sam', company: 'Sam Co', consent: true }));
        expect(await res.json()).toEqual({ ok: true });
        expect(applyIdentity).not.toHaveBeenCalled();
        expect(mock.calls.filter((c) => c.table === 'visitors')).toHaveLength(0);
        expect(recordEvents).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([expect.objectContaining({ type: 'contact_captured' })]));
        expect(sendEmail).toHaveBeenCalledTimes(1);
      }
    }
    // Presence check: the same requests on an anonymous visitor do write.
    mock.calls.length = 0;
    await POST(req({ visitorId: VID, email: 'sam@gmail.com', name: 'Sam', consent: true }));
    expect(mock.calls.filter((c) => c.table === 'visitors').length).toBeGreaterThan(0);
    await POST(req({ visitorId: VID, email: 'bob@greyline-tours.com', consent: true }));
    expect(applyIdentity).toHaveBeenCalled();
  });

  it('a business domain resolves to the company', async () => {
    const res = await POST(req({ visitorId: VID, email: 'bob@greyline-tours.com', company: 'Greyline', consent: true }));
    expect(await res.json()).toEqual({ ok: true });
    expect(applyIdentity).toHaveBeenCalledWith(T, expect.anything(), expect.objectContaining({ source: 'email_domain', company: 'Greyline Tours', companyDomain: 'greyline-tours.com' }));
    expect(visitorUpdates()).toHaveLength(0);
  });

  it('a consumer email is stored only where the visitor columns are empty', async () => {
    const res = await POST(req({ visitorId: VID, email: 'sam@gmail.com', name: 'Sam\r\nBcc: x', company: 'Sam Co', consent: true }));
    expect(await res.json()).toEqual({ ok: true });
    expect(applyIdentity).not.toHaveBeenCalled();
    const ups = visitorUpdates();
    const emailUp = ups.find((c) => hasOp(c, 'update', { email: 'sam@gmail.com' }));
    expect(emailUp && hasOp(emailUp, 'eq', 'id', VID) && hasOp(emailUp, 'is', 'email', null)).toBe(true);
    const nameUp = ups.find((c) => hasOp(c, 'update', { name: 'Sam Bcc: x' }));
    expect(nameUp && hasOp(nameUp, 'is', 'name', null)).toBe(true);
    const coUp = ups.find((c) => hasOp(c, 'update', { company: 'Sam Co' }));
    expect(coUp && hasOp(coUp, 'is', 'company', null)).toBe(true);
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'contact_captured', payload: { source: 'email_only', staff_notified: true } })]);
  });

  it('emails staff an escaped English note with the last messages, from the association name', async () => {
    await POST(req({ visitorId: VID, sessionId: SID, email: 'sam@gmail.com', name: '<Sam>', consent: true }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toEqual(['staff@aba.org']);
    expect(mail.from).toBe('"ABA Assistant" <assistant@mail.test>');
    expect(mail.replyTo).toBe('sam@gmail.com');
    expect(mail.subject).toContain('New contact from the website assistant');
    expect(mail.html).toContain('&lt;Sam&gt;');
    expect(mail.html).toContain('<b>Name (entered by the visitor, not verified):</b> &lt;Sam&gt;');
    expect(mail.html).toContain('<b>Email (entered by the visitor, not verified):</b> sam@gmail.com');
    expect(mail.html).toContain('sam@gmail.com');
    expect(mail.html).toContain('&lt;b&gt;$500&lt;/b&gt;');
    expect(mail.html.indexOf('What are the dues?')).toBeLessThan(mail.html.indexOf('Dues are'));
    expect(mail.html).not.toMatch(VENDOR);
    expect(mail.subject).not.toMatch(VENDOR);
    const msgRead = mock.calls.find((c) => c.table === 'chat_messages')!;
    expect(hasOp(msgRead, 'eq', 'session_id', SID) && hasOp(msgRead, 'limit', 12)).toBe(true);
  });

  it('400 without consent or with a bad email, before any lookup or write', async () => {
    expect((await POST(req({ visitorId: VID, email: 'sam@gmail.com' }))).status).toBe(400);
    expect((await POST(req({ visitorId: VID, email: 'sam@gmail.com', consent: 'yes' }))).status).toBe(400);
    const bad = await POST(req({ visitorId: VID, email: 'not-an-email', consent: true }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('invalid_request');
    expect((await POST(req({ visitorId: 'v1', email: 'sam@gmail.com', consent: true }))).status).toBe(400);
    expect((await POST(req({ visitorId: VID, sessionId: 's1', email: 'sam@gmail.com', consent: true }))).status).toBe(400);
    expect((await POST(req({ visitorId: VID, email: 'sam@gmail.com', name: 'x'.repeat(101), consent: true }))).status).toBe(400);
    expect((await POST(req({ visitorId: VID, email: 'sam@gmail.com', company: 'x'.repeat(201), consent: true }))).status).toBe(400);
    expect(getVisitor).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('413 for an oversized body', async () => {
    const r = new Request('http://x/api/partner/v1/contact', { method: 'POST', headers: { 'content-length': '20000' }, body: JSON.stringify({ visitorId: VID, email: 'a@b.com', consent: true, pad: 'x'.repeat(19000) }) }) as any;
    expect((await POST(r)).status).toBe(413);
    expect(getVisitor).not.toHaveBeenCalled();
  });

  it('records ams_unavailable when the AMS is down and falls back to the domain', async () => {
    amsDown = true;
    const res = await POST(req({ visitorId: VID, email: 'jane@acme.com', consent: true }));
    expect(await res.json()).toEqual({ ok: true });
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ type: 'ams_unavailable', payload: { during: 'contact' } }),
      expect.objectContaining({ type: 'contact_captured', payload: { source: 'email_domain', staff_notified: true } }),
    ]);
  });

  it('refuses a session of another visitor or association before any write', async () => {
    session = { id: SID, account_id: 'acc', visitor_id: 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee' };
    let res = await POST(req({ visitorId: VID, sessionId: SID, email: 'jane@acme.com', consent: true }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('unknown_session');
    session = { id: SID, account_id: 'other', visitor_id: VID };
    res = await POST(req({ visitorId: VID, sessionId: SID, email: 'jane@acme.com', consent: true }));
    expect(res.status).toBe(404);
    expect(applyIdentity).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordEvents).not.toHaveBeenCalled();
    expect(mock.calls.filter((c) => c.table !== 'chat_sessions')).toHaveLength(0);
  });

  it('404 for an unknown visitor; limiter refusals pass through with Retry-After', async () => {
    getVisitor.mockResolvedValueOnce(null);
    expect((await POST(req({ visitorId: VID, email: 'jane@acme.com', consent: true }))).status).toBe(404);
    checkChatLimits.mockResolvedValueOnce({ allowed: false, status: 429, error: 'rate_limited', retryAfterMs: 4200 });
    const res = await POST(req({ visitorId: VID, email: 'jane@acme.com', consent: true }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(applyIdentity).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('no recipients configured: no email, contact still recorded', async () => {
    loadAssociation.mockResolvedValueOnce({ accountId: 'acc', partnerId: 'pA', industry: null, branding: {}, openingQuestions: [], config: { copilot: {} } });
    const res = await POST(req({ visitorId: VID, email: 'sam@gmail.com', consent: true }));
    expect(await res.json()).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'contact_captured', payload: { source: 'email_only', staff_notified: false } })]);
  });

  it('Reply-To is the normalized typed email', async () => {
    await POST(req({ visitorId: VID, email: '  Sam@GMail.com ', consent: true }));
    expect(sendEmail.mock.calls[0][0].replyTo).toBe('sam@gmail.com');
  });

  it('emails staff at most once per visitor per 24h', async () => {
    priorNotified = [{ id: 'e1' }];
    const res = await POST(req({ visitorId: VID, email: 'sam@gmail.com', consent: true }));
    expect(await res.json()).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'contact_captured', payload: { source: 'email_only', staff_notified: false } })]);
    const lookup = mock.calls.find((c) => c.table === 'interaction_events')!;
    expect(hasOp(lookup, 'eq', 'account_id', 'acc')).toBe(true);
    expect(hasOp(lookup, 'eq', 'visitor_id', VID)).toBe(true);
    expect(hasOp(lookup, 'eq', 'type', 'contact_captured')).toBe(true);
    expect(hasOp(lookup, 'eq', 'payload->>staff_notified', 'true')).toBe(true);
    const gte = lookup.ops.find((o) => o[0] === 'gte')!;
    expect(gte[1]).toBe('occurred_at');
    const ageMs = Date.now() - new Date(String(gte[2])).getTime();
    expect(ageMs).toBeGreaterThan(24 * 3600_000 - 60_000);
    expect(ageMs).toBeLessThan(24 * 3600_000 + 60_000);
    // Presence check: with no earlier notification the same request does email staff.
    priorNotified = [];
    await POST(req({ visitorId: VID, email: 'sam@gmail.com', consent: true }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('a failed notification lookup sends nothing (fail closed) and logs', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    priorError = { message: 'db down' };
    await POST(req({ visitorId: VID, email: 'sam@gmail.com', consent: true }));
    expect(sendEmail).not.toHaveBeenCalled();
    expect(err.mock.calls.some((c) => c[0] === '[copilot/contact]')).toBe(true);
    err.mockRestore();
  });

  it('the association mail cap skips the staff email but still records the contact', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mailLimiter.mockResolvedValue({ allowed: false, remaining: 0, resetAt: 0, retryAfterMs: 1000 });
    const res = await POST(req({ visitorId: VID, email: 'sam@gmail.com', consent: true }));
    expect(await res.json()).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(mailLimiter).toHaveBeenCalledWith(expect.objectContaining({ key: 'rl:copilot:mail:acc', limit: 30 }));
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'contact_captured', payload: { source: 'email_only', staff_notified: false } })]);
    expect(err.mock.calls.some((c) => c[0] === '[copilot/mail]')).toBe(true);
    err.mockRestore();
  });

  it('a stuck email send does not hold the request past the timeout', async () => {
    vi.useFakeTimers();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      sendEmail.mockReturnValue(new Promise(() => {}));
      const p = POST(req({ visitorId: VID, email: 'sam@gmail.com', consent: true }));
      await vi.advanceTimersByTimeAsync(10_001);
      const res = await p;
      expect(await res.json()).toEqual({ ok: true });
      expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'contact_captured', payload: { source: 'email_only', staff_notified: false } })]);
    } finally {
      vi.useRealTimers();
      err.mockRestore();
    }
  });
});
