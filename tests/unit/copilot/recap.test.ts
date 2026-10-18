// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeDb, hasOp, type Chain } from './copilot-db-mock';

const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const VID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SID = '11111111-2222-4333-8444-555555555555';
const baseVisitor = { id: VID, account_id: 'acc', partner_id: 'pA', anon_id: 'anon_aaaaaaaaaaaaaaaa', identity_source: null, member_ref: null, email: null, name: null, company: null, company_domain: null, membership: null, merged_into: null };
const ENABLED: any = { display_name: 'ABA', copilot: { recap: { enabled: true } } };

vi.mock('@/lib/copilot/auth', () => ({ requireTenant: async () => T }));
const loadAssociation = vi.fn();
vi.mock('@/lib/copilot/association', () => ({ loadAssociation: (...a: any[]) => loadAssociation(...a) }));
const getVisitor = vi.fn();
vi.mock('@/lib/copilot/visitors', async (orig) => ({ ...(await orig<any>()), getVisitor: (...a: any[]) => getVisitor(...a) }));
const recordEvents = vi.fn();
vi.mock('@/lib/copilot/events', () => ({ recordEvents: (...a: any[]) => recordEvents(...a) }));
const checkChatLimits = vi.fn();
vi.mock('@/lib/copilot/rate-limit', () => ({ checkChatLimits: (...a: any[]) => checkChatLimits(...a) }));
const sendEmail = vi.fn();
vi.mock('@/lib/email', () => ({ sendEmail: (...a: any[]) => sendEmail(...a) }));

let session: any = null;
let messages: any[] = [];
let shown: any[] = [];
let sessionRecaps: any[] = [];
let addressRecaps: any[] = [];
let limitReadError: any = null;
const mock = makeDb((c: Chain) => {
  if (c.table === 'chat_sessions') return { data: session, error: null };
  if (c.table === 'chat_messages') return { data: messages, error: null };
  if (c.table === 'interaction_events') {
    if (hasOp(c, 'eq', 'type', 'resource_shown')) return { data: shown, error: null };
    if (c.ops.some((o) => o[0] === 'eq' && o[1] === 'payload->>to_hash')) return { data: addressRecaps, error: limitReadError };
    return { data: sessionRecaps, error: null };
  }
  return { data: null, error: null };
});
vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mock.db.from(t) } }));

import { buildRecapEmail, recipientHash } from '@/lib/copilot/recap';
import { POST } from '@/app/api/partner/v1/recap/route';

const req = (b: any) => new Request('http://x/api/partner/v1/recap', { method: 'POST', body: JSON.stringify(b) }) as any;
const HEBREW = /[֐-׿]/;
const VENDOR = /bestie|influencerbot|ldrs|imai/i;

describe('buildRecapEmail', () => {
  const p = {
    associationName: 'ABA',
    messages: [
      { role: 'user', content: 'Is <script>alert(1)</script> allowed?' },
      { role: 'assistant', content: 'See the safety page.', metadata: { copilot: { cited: [1], sources: [{ title: 'Fleet rules', url: 'https://aba.org/fleet' }] } } },
    ],
    sources: [{ title: 'Safety <guide>', url: 'https://aba.org/safety?a=1&b=2' }, { title: 'Bad', url: 'javascript:alert(1)' }, { title: 'Mail', url: 'mailto:x@y.z' }],
  };

  it('subject names the association assistant', () => {
    expect(buildRecapEmail(p).subject).toBe('Your conversation with the ABA assistant');
  });
  it('escapes the conversation and the links', () => {
    const { html } = buildRecapEmail(p);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Safety &lt;guide&gt;');
    expect(html).toContain('href="https://aba.org/safety?a=1&amp;b=2"');
    expect(html).toContain('See the safety page.');
  });
  it('lists cited links, http(s) only, including those in assistant metadata', () => {
    const { html } = buildRecapEmail(p);
    expect(html).toContain('https://aba.org/fleet');
    expect(html).toContain('Fleet rules');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('mailto:');
  });
  it('has no Hebrew characters and no vendor names', () => {
    const r = buildRecapEmail(p);
    expect(r.subject + r.html).not.toMatch(HEBREW);
    expect(r.subject + r.html).not.toMatch(VENDOR);
  });
});

describe('POST /recap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.calls.length = 0;
    session = { id: SID, account_id: 'acc', visitor_id: VID };
    messages = [{ role: 'assistant', content: 'Dues are $500.', metadata: { copilot: { cited: [1] } } }, { role: 'user', content: 'What are the dues?' }];
    shown = [{ payload: { urls: ['https://aba.org/dues', 'ftp://aba.org/x'] } }];
    sessionRecaps = [];
    addressRecaps = [];
    limitReadError = null;
    loadAssociation.mockResolvedValue({ accountId: 'acc', partnerId: 'pA', industry: 'motorcoach', branding: {}, openingQuestions: [], config: ENABLED });
    getVisitor.mockResolvedValue({ ...baseVisitor });
    checkChatLimits.mockResolvedValue({ allowed: true });
    sendEmail.mockResolvedValue({ success: true });
    process.env.GMAIL_SEND_FROM = 'assistant@mail.test';
  });

  it('409 recap_not_configured unless enabled, without sending', async () => {
    loadAssociation.mockResolvedValueOnce({ accountId: 'acc', partnerId: 'pA', industry: null, branding: {}, openingQuestions: [], config: { copilot: { recap: { enabled: 'true' } } } });
    const res = await POST(req({ visitorId: VID, sessionId: SID, email: 'sam@gmail.com' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('recap_not_configured');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('400 email_required when the visitor has no email, even if the body carries one', async () => {
    const res = await POST(req({ visitorId: VID, sessionId: SID, email: 'victim@example.com' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('email_required');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends the recap to the visitor email and records recap_sent', async () => {
    getVisitor.mockResolvedValueOnce({ ...baseVisitor, email: 'jane@acme.com' });
    const res = await POST(req({ visitorId: VID, sessionId: SID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('jane@acme.com');
    expect(mail.from).toBe('"ABA Assistant" <assistant@mail.test>');
    expect(mail.subject).toBe('Your conversation with the ABA assistant');
    expect(mail.html.indexOf('What are the dues?')).toBeLessThan(mail.html.indexOf('Dues are'));
    expect(mail.html).toContain('https://aba.org/dues');
    expect(mail.html).not.toContain('ftp://');
    expect(recordEvents).toHaveBeenCalledWith(expect.objectContaining({ visitorId: VID }), [expect.objectContaining({ type: 'recap_sent', sessionId: SID, payload: expect.objectContaining({ to_hash: recipientHash('jane@acme.com') }) })]);
    expect(JSON.stringify(recordEvents.mock.calls)).not.toContain('jane@acme.com');
    expect(recipientHash('Jane@Acme.com ')).toMatch(/^[0-9a-f]{64}$/);
    expect(recipientHash('Jane@Acme.com ')).toBe(recipientHash('jane@acme.com'));
    const perAddress = mock.calls.find((c) => c.table === 'interaction_events' && hasOp(c, 'eq', 'payload->>to_hash', recipientHash('jane@acme.com')))!;
    expect(hasOp(perAddress, 'eq', 'account_id', 'acc') && hasOp(perAddress, 'eq', 'type', 'recap_sent') && perAddress.ops.some((o) => o[0] === 'gte' && o[1] === 'occurred_at')).toBe(true);
    const ev = mock.calls.find((c) => c.table === 'interaction_events' && hasOp(c, 'eq', 'type', 'resource_shown'))!;
    expect(hasOp(ev, 'eq', 'session_id', SID) && hasOp(ev, 'eq', 'account_id', 'acc')).toBe(true);
  });

  it('ignores a body email: sends only to the visitor profile address', async () => {
    getVisitor.mockResolvedValueOnce({ ...baseVisitor, email: 'Jane@Acme.com' });
    await POST(req({ visitorId: VID, sessionId: SID, email: 'victim@example.com' }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('jane@acme.com');
  });

  it('409 recap_already_sent when the session already had a recap', async () => {
    getVisitor.mockResolvedValueOnce({ ...baseVisitor, email: 'jane@acme.com' });
    sessionRecaps = [{ id: 'e1' }];
    const res = await POST(req({ visitorId: VID, sessionId: SID }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('recap_already_sent');
    expect(sendEmail).not.toHaveBeenCalled();
    const q = mock.calls.find((c) => c.table === 'interaction_events' && hasOp(c, 'eq', 'session_id', SID) && hasOp(c, 'eq', 'type', 'recap_sent'))!;
    expect(hasOp(q, 'eq', 'account_id', 'acc')).toBe(true);
  });

  it('429 recap_limit_reached after 3 recaps to the same address in a day; 2 is still allowed', async () => {
    getVisitor.mockResolvedValue({ ...baseVisitor, email: 'jane@acme.com' });
    addressRecaps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const res = await POST(req({ visitorId: VID, sessionId: SID }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('recap_limit_reached');
    expect(sendEmail).not.toHaveBeenCalled();
    addressRecaps = [{ id: 'a' }, { id: 'b' }];
    expect((await POST(req({ visitorId: VID, sessionId: SID }))).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('a failed limit read refuses the send', async () => {
    getVisitor.mockResolvedValueOnce({ ...baseVisitor, email: 'jane@acme.com' });
    limitReadError = { message: 'db down' };
    const res = await POST(req({ visitorId: VID, sessionId: SID }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('recap_unavailable');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('validates ids before any lookup; refuses a foreign session before sending', async () => {
    expect((await POST(req({ visitorId: VID }))).status).toBe(400);
    expect((await POST(req({ visitorId: 'v1', sessionId: SID }))).status).toBe(400);
    expect(getVisitor).not.toHaveBeenCalled();
    getVisitor.mockResolvedValueOnce({ ...baseVisitor, email: 'jane@acme.com' });
    session = { id: SID, account_id: 'acc', visitor_id: 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee' };
    const res = await POST(req({ visitorId: VID, sessionId: SID }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('unknown_session');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(mock.calls.filter((c) => c.table !== 'chat_sessions')).toHaveLength(0);
  });

  it('a failed send is a neutral error and records nothing', async () => {
    sendEmail.mockResolvedValueOnce({ success: false, error: 'Gmail quota' });
    getVisitor.mockResolvedValueOnce({ ...baseVisitor, email: 'sam@gmail.com' });
    const res = await POST(req({ visitorId: VID, sessionId: SID }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('recap_unavailable');
    expect(JSON.stringify(body)).not.toMatch(/gmail/i);
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('limiter refusals pass through', async () => {
    checkChatLimits.mockResolvedValueOnce({ allowed: false, status: 503, error: 'rate_limiter_unavailable', retryAfterMs: 5000 });
    const res = await POST(req({ visitorId: VID, sessionId: SID, email: 'sam@gmail.com' }));
    expect(res.status).toBe(503);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
