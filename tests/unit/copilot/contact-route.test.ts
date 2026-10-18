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
    ams: { provider: 'stub', stub_members: [{ memberRef: 'M1', email: 'jane@acme.com', name: 'Jane', company: 'Acme Coaches', status: 'active', type: 'Operator', renewalDate: '2026-11-15', registrations: [] }] },
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

let session: any = null;
let messages: any[] = [];
const mock = makeDb((c: Chain) => {
  if (c.table === 'chat_sessions') return { data: session, error: null };
  if (c.table === 'chat_messages') return { data: messages, error: null };
  return { data: null, error: null };
});
vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mock.db.from(t) } }));

import { IdentityConflictError } from '@/lib/copilot/visitors';
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
  process.env.GMAIL_SEND_FROM = 'assistant@mail.test';
});

describe('POST /contact', () => {
  it('a member found in the AMS is identified as a member (source ams_email)', async () => {
    const res = await POST(req({ visitorId: VID, sessionId: SID, email: 'Jane@Acme.com', name: 'Jane D', consent: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, identity: 'member' });
    expect(applyIdentity).toHaveBeenCalledWith(T, expect.objectContaining({ id: VID }), expect.objectContaining({ source: 'ams_email', memberRef: 'M1', email: 'jane@acme.com', name: 'Jane D', company: 'Acme Coaches' }));
    expect(recordEvents).toHaveBeenCalledWith(expect.objectContaining({ visitorId: VID, accountId: 'acc' }), [expect.objectContaining({ type: 'contact_captured', sessionId: SID, payload: { source: 'ams_email' } })]);
    expect(checkChatLimits).toHaveBeenCalledWith({ accountId: 'acc', anonId: 'anon_aaaaaaaaaaaaaaaa' });
  });

  it('a business domain resolves to the company', async () => {
    const res = await POST(req({ visitorId: VID, email: 'bob@greyline-tours.com', company: 'Greyline', consent: true }));
    expect(await res.json()).toEqual({ ok: true, identity: 'company' });
    expect(applyIdentity).toHaveBeenCalledWith(T, expect.anything(), expect.objectContaining({ source: 'email_domain', company: 'Greyline Tours', companyDomain: 'greyline-tours.com' }));
    expect(visitorUpdates()).toHaveLength(0);
  });

  it('a consumer email is stored only where the visitor columns are empty', async () => {
    const res = await POST(req({ visitorId: VID, email: 'sam@gmail.com', name: 'Sam\r\nBcc: x', company: 'Sam Co', consent: true }));
    expect(await res.json()).toEqual({ ok: true, identity: 'email_only' });
    expect(applyIdentity).not.toHaveBeenCalled();
    const ups = visitorUpdates();
    const emailUp = ups.find((c) => hasOp(c, 'update', { email: 'sam@gmail.com' }));
    expect(emailUp && hasOp(emailUp, 'eq', 'id', VID) && hasOp(emailUp, 'is', 'email', null)).toBe(true);
    const nameUp = ups.find((c) => hasOp(c, 'update', { name: 'Sam Bcc: x' }));
    expect(nameUp && hasOp(nameUp, 'is', 'name', null)).toBe(true);
    const coUp = ups.find((c) => hasOp(c, 'update', { company: 'Sam Co' }));
    expect(coUp && hasOp(coUp, 'is', 'company', null)).toBe(true);
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'contact_captured', payload: { source: 'email_only' } })]);
  });

  it('emails staff an escaped English note with the last messages, from the association name', async () => {
    await POST(req({ visitorId: VID, sessionId: SID, email: 'sam@gmail.com', name: '<Sam>', consent: true }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toEqual(['staff@aba.org']);
    expect(mail.from).toBe('ABA Assistant <assistant@mail.test>');
    expect(mail.subject).toContain('New contact from the website assistant');
    expect(mail.html).toContain('&lt;Sam&gt;');
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

  it('an identity conflict still records the contact and reports conflict', async () => {
    applyIdentity.mockRejectedValueOnce(new IdentityConflictError('shared device'));
    const res = await POST(req({ visitorId: VID, sessionId: SID, email: 'jane@acme.com', consent: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, identity: 'conflict' });
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'contact_captured' })]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(visitorUpdates()).toHaveLength(0);
  });

  it('records ams_unavailable when the AMS is down and falls back to the domain', async () => {
    amsDown = true;
    const res = await POST(req({ visitorId: VID, email: 'jane@acme.com', consent: true }));
    expect(await res.json()).toEqual({ ok: true, identity: 'company' });
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ type: 'ams_unavailable', payload: { during: 'contact' } }),
      expect.objectContaining({ type: 'contact_captured', payload: { source: 'email_domain' } }),
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
    expect(await res.json()).toEqual({ ok: true, identity: 'email_only' });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordEvents).toHaveBeenCalled();
  });
});
