import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signIdentify, signNewsletterToken } from '@/lib/copilot/signature';

const SECRET = 'aba-secret';
const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const visitor = { id: 'v1', account_id: 'acc', identity_source: null, member_ref: null, email: null, name: null, company: null, company_domain: null, membership: null, merged_into: null };

vi.mock('@/lib/copilot/auth', () => ({ requireTenant: async () => T }));
vi.mock('@/lib/copilot/association', () => ({ loadAssociation: async () => ({ accountId: 'acc', partnerId: 'pA', industry: 'motorcoach', branding: {}, openingQuestions: [], config: { copilot: { ams: { provider: 'stub', stub_members: [{ memberRef: 'M1', email: 'jane@acme.com', name: 'Jane', company: 'Acme Coaches', status: 'active', type: 'Operator', renewalDate: '2026-11-15', registrations: [] }] } } } }) }));
const getSecret = vi.fn(async () => SECRET as string | null);
vi.mock('@/lib/copilot/secrets', () => ({ getIdentifySecret: () => getSecret() }));
const getVisitor = vi.fn(async () => visitor as any);
const applyIdentity = vi.fn(async (_t: any, v: any, upd: any) => ({ visitor: { ...v, identity_source: upd.source }, merged: false }));
vi.mock('@/lib/copilot/visitors', async (orig) => ({ ...(await orig<any>()), getVisitor: (...a: any[]) => getVisitor(...(a as [])), applyIdentity: (...a: any[]) => applyIdentity(...(a as [any, any, any])) }));
const recordEvents = vi.fn();
vi.mock('@/lib/copilot/events', () => ({ recordEvents: (...a: any[]) => recordEvents(...a) }));
const sessionUpdates: any[] = [];
const orFilters: string[] = [];
const SID = '123e4567-e89b-42d3-a456-426614174000';
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ update: (p: any) => ({ eq: () => ({ eq: () => ({ or: async (f: string) => { sessionUpdates.push(p); orFilters.push(f); return { error: null }; } }) }) }) }) } }));

import { IdentityConflictError } from '@/lib/copilot/visitors';
import { POST } from '@/app/api/partner/v1/identify/route';

const req = (b: any) => new Request('http://x/api/partner/v1/identify', { method: 'POST', body: JSON.stringify(b) }) as any;

beforeEach(() => { applyIdentity.mockClear(); recordEvents.mockClear(); getSecret.mockResolvedValue(SECRET); getVisitor.mockResolvedValue(visitor); sessionUpdates.length = 0; orFilters.length = 0; });

describe('POST /identify', () => {
  it('identifies a signed-in member and pulls the AMS snapshot', async () => {
    const ts = Date.now();
    const sig = signIdentify(SECRET, { memberId: 'M1', email: 'jane@acme.com', ts });
    const res = await POST(req({ visitorId: 'v1', sessionId: SID, memberId: 'M1', email: 'jane@acme.com', ts, signature: sig }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ visitorId: 'v1', identified: true, membership: { status: 'active', renewalDate: '2026-11-15' } });
    expect(applyIdentity).toHaveBeenCalledWith(T, visitor, expect.objectContaining({ source: 'ams_login', memberRef: 'M1', company: 'Acme Coaches' }));
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'identified', sessionId: SID, payload: { source: 'ams_login', merged: false } })]);
    expect(sessionUpdates[0]).toHaveProperty('identified_at');
    expect(orFilters[0]).toContain('visitor_id.is.null');
    expect(orFilters[0]).toContain('visitor_id.eq.v1');
  });

  it('identifies from a newsletter token', async () => {
    const tok = signNewsletterToken(SECRET, { memberId: 'M1', email: null, expiresAt: Date.now() + 60_000 });
    const res = await POST(req({ visitorId: 'v1', newsletterToken: tok }));
    expect(res.status).toBe(200);
    expect(applyIdentity).toHaveBeenCalledWith(T, visitor, expect.objectContaining({ source: 'newsletter', memberRef: 'M1' }));
  });

  it('refuses a forged signature and leaves the visitor alone', async () => {
    const ts = Date.now();
    const sig = signIdentify('wrong', { memberId: 'M1', email: null, ts });
    const res = await POST(req({ visitorId: 'v1', memberId: 'M1', ts, signature: sig }));
    expect(res.status).toBe(401);
    expect(applyIdentity).not.toHaveBeenCalled();
  });

  it('refuses a stale signature', async () => {
    const ts = Date.now() - 11 * 60 * 1000;
    const res = await POST(req({ visitorId: 'v1', memberId: 'M1', ts, signature: signIdentify(SECRET, { memberId: 'M1', email: null, ts }) }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('expired_signature');
  });

  it('409 when the association has no secret, 404 for a foreign visitor, 400 for junk', async () => {
    getSecret.mockResolvedValueOnce(null);
    expect((await POST(req({ visitorId: 'v1', memberId: 'M1', ts: Date.now(), signature: 'a'.repeat(64) }))).status).toBe(409);
    getVisitor.mockResolvedValueOnce(null);
    expect((await POST(req({ visitorId: 'vX', memberId: 'M1', ts: Date.now(), signature: 'a'.repeat(64) }))).status).toBe(404);
    expect((await POST(req({ visitorId: 'v1' }))).status).toBe(400);
  });

  it('409 identity_conflict when the visitor belongs to another member, with no events or session writes', async () => {
    applyIdentity.mockRejectedValueOnce(new IdentityConflictError('shared device'));
    const ts = Date.now();
    const sig = signIdentify(SECRET, { memberId: 'M1', email: null, ts });
    const res = await POST(req({ visitorId: 'v1', sessionId: SID, memberId: 'M1', ts, signature: sig }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('identity_conflict');
    expect(recordEvents).not.toHaveBeenCalled();
    expect(sessionUpdates).toHaveLength(0);
  });

  it('drops a non-UUID sessionId: no session update, events carry null', async () => {
    const ts = Date.now();
    const sig = signIdentify(SECRET, { memberId: 'M1', email: null, ts });
    const res = await POST(req({ visitorId: 'v1', sessionId: 's1', memberId: 'M1', ts, signature: sig }));
    expect(res.status).toBe(200);
    expect(sessionUpdates).toHaveLength(0);
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'identified', sessionId: null })]);
  });

  it('refuses a forged newsletter token', async () => {
    const tok = signNewsletterToken('wrong', { memberId: 'M1', email: null, expiresAt: Date.now() + 60_000 });
    const res = await POST(req({ visitorId: 'v1', newsletterToken: tok }));
    expect(res.status).toBe(401);
    expect(applyIdentity).not.toHaveBeenCalled();
  });
});
