import { describe, it, expect, vi, beforeEach } from 'vitest';

const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const requireTenant = vi.fn();
vi.mock('@/lib/copilot/auth', () => ({ requireTenant: (...a: any[]) => requireTenant(...a) }));
const getOrCreateVisitor = vi.fn();
vi.mock('@/lib/copilot/visitors', async (orig) => ({ ...(await orig<any>()), getOrCreateVisitor: (...a: any[]) => getOrCreateVisitor(...a) }));
const recordEvents = vi.fn();
vi.mock('@/lib/copilot/events', () => ({ recordEvents: (...a: any[]) => recordEvents(...a) }));
vi.mock('@/lib/copilot/association', () => ({
  loadAssociation: async () => ({ accountId: 'acc', partnerId: 'pA', industry: 'motorcoach', branding: { primary: '#0b2a4a' }, openingQuestions: ['How do I join?'], config: {} }),
}));

const sessions: any[] = [];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: sessions.find((s) => s.id === id) ?? null }) }) }),
      insert: (row: any) => ({ select: () => ({ single: async () => { const s = { id: `s${sessions.length + 1}`, ...row }; sessions.push(s); return { data: s, error: null }; } }) }),
    }),
  },
}));

import { POST } from '@/app/api/partner/v1/session/route';

function req(body: any) {
  return new Request('http://x/api/partner/v1/session', { method: 'POST', body: JSON.stringify(body) }) as any;
}

beforeEach(() => {
  sessions.length = 0;
  requireTenant.mockResolvedValue(T);
  getOrCreateVisitor.mockResolvedValue({ id: 'v1', identity_source: null });
  recordEvents.mockClear();
});

describe('POST /session', () => {
  it('opens a new session and records session_started', async () => {
    const res = await POST(req({ anonId: 'anon_aaaaaaaaaaaaaaaa' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ visitorId: 'v1', sessionId: 's1', resumed: false, openingQuestions: ['How do I join?'], identity: { identified: false, source: null } });
    expect(sessions[0]).toMatchObject({ account_id: 'acc', visitor_id: 'v1', anon_id: 'anon_aaaaaaaaaaaaaaaa', ref_source: 'copilot' });
    expect(recordEvents).toHaveBeenCalledWith(expect.objectContaining({ visitorId: 'v1' }), [expect.objectContaining({ type: 'session_started', sessionId: 's1' })]);
  });

  it('resumes a session that belongs to the same visitor', async () => {
    sessions.push({ id: 'old', account_id: 'acc', visitor_id: 'v1' });
    const body = await (await POST(req({ anonId: 'anon_aaaaaaaaaaaaaaaa', sessionId: 'old' }))).json();
    expect(body).toMatchObject({ sessionId: 'old', resumed: true });
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('opens a new session instead of resuming someone else’s', async () => {
    sessions.push({ id: 'theirs', account_id: 'acc', visitor_id: 'v999' });
    const body = await (await POST(req({ anonId: 'anon_aaaaaaaaaaaaaaaa', sessionId: 'theirs' }))).json();
    expect(body.sessionId).not.toBe('theirs');
    expect(body.resumed).toBe(false);
  });

  it('rejects a bad anon id with 400', async () => {
    expect((await POST(req({ anonId: 'x' }))).status).toBe(400);
  });

  it('passes through a tenant refusal', async () => {
    requireTenant.mockResolvedValue(Response.json({ error: 'host_not_owned' }, { status: 403 }));
    expect((await POST(req({ anonId: 'anon_aaaaaaaaaaaaaaaa' }))).status).toBe(403);
  });
});
