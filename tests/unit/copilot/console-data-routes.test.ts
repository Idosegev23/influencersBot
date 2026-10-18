// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ db: null as any, jobs: [] as any[] }));
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_t, k) => (h.db as any)[k] }) }));
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({
  getScanJobsRepo: () => ({
    getByAccount: async (id: string, n: number) => h.jobs.filter((j) => j.account_id === id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, n),
  }),
}));
const requireTenant = vi.fn();
vi.mock('@/lib/copilot/auth', () => ({ requireTenant: (...a: any[]) => requireTenant(...a) }));

import { GET as listGET } from '@/app/api/partner/v1/console/associations/route';
import { GET as detailGET } from '@/app/api/partner/v1/console/associations/[id]/route';
import { GET as convGET } from '@/app/api/partner/v1/console/associations/[id]/conversations/route';
import { GET as transcriptGET } from '@/app/api/partner/v1/console/associations/[id]/conversations/[sessionId]/route';
import { PATCH as settingsPATCH } from '@/app/api/partner/v1/console/associations/[id]/settings/route';
import { redactContact } from '@/lib/copilot/console-data';
import { SECRET, ACC1, ACC2, ACCX, S1, BASE, tokenFor, tenantFor, world, type UserKey } from './console-fixture';

let db: ReturnType<typeof world>;

function req(user: UserKey | null, url = 'http://x/', init: RequestInit = {}) {
  if (user) requireTenant.mockResolvedValue(tenantFor(user));
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (user) headers['x-console-token'] = tokenFor(user);
  return new Request(url, { ...init, headers });
}
const p = <T,>(v: T) => ({ params: Promise.resolve(v) });
const patch = (user: UserKey, id: string, body: any) =>
  settingsPATCH(req(user, 'http://x/', { method: 'PATCH', body: JSON.stringify(body) }), p({ id }));

beforeEach(() => {
  process.env.CONSOLE_SESSION_SECRET = SECRET;
  db = world();
  h.db = db;
  h.jobs = [];
  requireTenant.mockReset();
});

describe('authorisation on every console data route', () => {
  const routes: Array<[string, (u: UserKey, id: string) => Promise<Response>]> = [
    ['detail', (u, id) => detailGET(req(u), p({ id }))],
    ['conversations', (u, id) => convGET(req(u), p({ id }))],
    ['transcript', (u, id) => transcriptGET(req(u), p({ id, sessionId: S1 }))],
    ['settings', (u, id) => patch(u, id, { tone: 'warm' })],
  ];

  beforeEach(() => {
    db.tables.chat_sessions.push({ id: S1, account_id: ACC1, ref_source: 'copilot', created_at: '2026-10-10T00:00:00Z', message_count: 2 });
  });

  it.each(routes)('%s: association staff asking for another association -> 403', async (_n, call) => {
    for (const u of ['assocAdmin', 'assocViewer'] as UserKey[]) {
      const r = await call(u, ACC2);
      expect(r.status).toBe(403);
      expect((await r.json()).error).toBe('forbidden');
    }
  });

  it.each(routes)('%s: another partner\'s association -> 404 (even for partner staff)', async (_n, call) => {
    const r = await call('owner', ACCX);
    expect(r.status).toBe(404);
  });

  it.each(routes)('%s: the other partner cannot reach our association either', async (_n, call) => {
    const r = await call('otherOwner', ACC1);
    expect(r.status).toBe(404);
  });

  it.each(routes)('%s: no token -> 401', async (_n) => {
    requireTenant.mockResolvedValue(tenantFor('owner'));
    const r = await detailGET(new Request('http://x/'), p({ id: ACC1 }));
    expect(r.status).toBe(401);
  });

  it.each(routes)('%s: a token used through an association host -> 400', async (_n, call) => {
    requireTenant.mockResolvedValue({ partnerId: 'partner-A', accountId: ACC1, host: `aba.${BASE}` });
    const r = await detailGET(new Request('http://x/', { headers: { 'x-console-token': tokenFor('owner') } }), p({ id: ACC1 }));
    expect(r.status).toBe(400);
    void call;
  });

  it('a token of partner B presented on partner A\'s host -> 401', async () => {
    requireTenant.mockResolvedValue(tenantFor('owner'));
    const r = await detailGET(new Request('http://x/', { headers: { 'x-console-token': tokenFor('otherOwner') } }), p({ id: ACC1 }));
    expect(r.status).toBe(401);
  });

  it('read routes are open to viewers and association staff on their own association', async () => {
    for (const u of ['owner', 'viewer', 'assocAdmin', 'assocViewer'] as UserKey[]) {
      expect((await detailGET(req(u), p({ id: ACC1 }))).status).toBe(200);
      expect((await convGET(req(u), p({ id: ACC1 }))).status).toBe(200);
      expect((await transcriptGET(req(u), p({ id: ACC1, sessionId: S1 }))).status).toBe(200);
    }
  });

  it('settings: viewers (partner or association) -> 403; owner, admin and association admin -> 200', async () => {
    expect((await patch('viewer', ACC1, { tone: 'x' })).status).toBe(403);
    expect((await patch('assocViewer', ACC1, { tone: 'x' })).status).toBe(403);
    expect((await patch('owner', ACC1, { tone: 'x' })).status).toBe(200);
    expect((await patch('admin', ACC1, { tone: 'x' })).status).toBe(200);
    expect((await patch('assocAdmin', ACC1, { tone: 'x' })).status).toBe(200);
  });

  it('a non-uuid id is 404', async () => {
    expect((await detailGET(req('owner'), p({ id: 'nope' }))).status).toBe(404);
  });
});

describe('GET associations', () => {
  it('partner staff see every association of their partner, with slug, status and counts', async () => {
    h.jobs.push({ id: 'j1', account_id: ACC2, status: 'running', created_at: '2026-10-18T00:00:00Z', step_logs: [{ step: 'create-account', status: 'completed', timestamp: '2026-10-18T00:00:01Z' }, { step: 'site-crawl', status: 'running', timestamp: '2026-10-18T00:01:00Z' }] });
    h.jobs.push({ id: 'j0', account_id: ACC1, status: 'succeeded', created_at: '2026-10-01T00:00:00Z', step_logs: [] });
    const res = await listGET(req('owner'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { id: ACC1, slug: 'aba', name: 'American Bus Association', websiteUrl: 'https://www.buses.org/', status: 'ready', scan: null,
        counts: { sessions30: 3, messages30: 12, escalations30: 1, lastActivity: '2026-10-17T10:00:00Z' } },
      { id: ACC2, slug: 'nta', name: 'NTA', websiteUrl: 'https://ntaonline.com', status: 'scanning', scan: { percent: 7, currentStep: 'site-crawl' },
        counts: { sessions30: 0, messages30: 0, escalations30: 0, lastActivity: null } },
    ]);
  });

  it('association staff see only theirs', async () => {
    const body = await (await listGET(req('assocViewer'))).json();
    expect(body.map((a: any) => a.id)).toEqual([ACC1]);
  });

  it('the other partner sees only its own', async () => {
    const body = await (await listGET(req('otherOwner'))).json();
    expect(body.map((a: any) => a.id)).toEqual([ACCX]);
    expect(body[0].slug).toBe('theirs');
  });

  it('a failed latest scan is failed', async () => {
    h.jobs.push({ id: 'j2', account_id: ACC2, status: 'failed', created_at: '2026-10-18T00:00:00Z' });
    const body = await (await listGET(req('owner'))).json();
    expect(body[1].status).toBe('failed');
  });
});

describe('GET associations/:id', () => {
  it('returns counts, topics, recent escalations and the whitelisted settings', async () => {
    db.tables.conversation_topics.push(
      { account_id: ACC1, label: 'Membership', session_count: 9, is_active: true },
      { account_id: ACC1, label: 'Old', session_count: 50, is_active: false },
      { account_id: ACC2, label: 'Theirs', session_count: 99, is_active: true },
    );
    db.tables.support_requests.push({ account_id: ACC1, source: 'copilot_escalation', escalation_reason: 'Abusive language', created_at: '2026-10-15T00:00:00Z', customer_email: 'x@y.z' });
    const body = await (await detailGET(req('owner'), p({ id: ACC1 }))).json();
    expect(body).toMatchObject({
      id: ACC1, slug: 'aba', name: 'American Bus Association', status: 'ready', scan: null,
      counts: { d7: { sessions: 3, messages: 12, escalations: 1 }, d30: { sessions: 3, messages: 12, escalations: 1 }, lastActivity: '2026-10-17T10:00:00Z' },
      topTopics: [{ label: 'Membership', sessions: 9 }],
      recentEscalations: [{ reason: 'Abusive language', createdAt: '2026-10-15T00:00:00Z' }],
    });
    expect(body.settings).toEqual({
      branding: { primary: '#041423' },
      opening_questions: ['How do I join?'],
      exclusions: [],
      contact_trigger: [{ kind: 'on_intent', topics: ['membership', 'events'] }, { kind: 'before_escalation' }],
      escalation: { recipients: ['help@buses.org'] },
      links: { join: 'https://buses.org/join', renew: null },
      tone: null,
      industry: 'motorcoach',
    });
    expect(JSON.stringify(body)).not.toContain('secret-ref');
    expect(JSON.stringify(body)).not.toContain('secret_token');
  });
});

describe('GET associations/:id/conversations', () => {
  beforeEach(() => {
    for (let i = 0; i < 30; i++) {
      const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, '0')}`;
      db.tables.chat_sessions.push({ id, account_id: ACC1, ref_source: 'copilot', created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), last_turn_at: null, message_count: 2, identified_at: i === 29 ? '2026-10-02T00:00:00Z' : null, anon_id: 'anon_secret', visitor_id: 'v-secret' });
      db.tables.chat_messages.push({ session_id: id, role: 'user', content: `Q${i} call me at +1 (202) 555-0147 or me@corp.com ${'x'.repeat(200)}`, created_at: new Date(Date.UTC(2026, 9, 1, 0, i, 1)).toISOString() });
    }
    db.tables.chat_sessions.push({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', account_id: ACC1, ref_source: 'widget', created_at: '2026-10-05T00:00:00Z' });
    db.tables.chat_sessions.push({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', account_id: ACC2, ref_source: 'copilot', created_at: '2026-10-05T00:00:00Z' });
    db.tables.support_requests.push({ account_id: ACC1, source: 'copilot_escalation', session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000028', created_at: '2026-10-05T00:00:00Z' });
  });

  it('pages 25 newest first, then the rest via the cursor', async () => {
    const first = await (await convGET(req('owner'), p({ id: ACC1 }))).json();
    expect(first.conversations).toHaveLength(25);
    expect(first.conversations[0].id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-000000000029');
    expect(first.nextCursor).toBe(first.conversations[24].startedAt);
    const second = await (await convGET(req('owner', `http://x/?cursor=${encodeURIComponent(first.nextCursor)}`), p({ id: ACC1 }))).json();
    expect(second.conversations).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const all = [...first.conversations, ...second.conversations].map((c: any) => c.id);
    expect(new Set(all).size).toBe(30);
  });

  it('rows carry flags and a 120-char first message, anonymised unless identified, never raw ids', async () => {
    const { conversations } = await (await convGET(req('owner'), p({ id: ACC1 }))).json();
    const identified = conversations[0];
    const escalated = conversations[1];
    expect(identified).toMatchObject({ identified: true, escalated: false, messageCount: 2 });
    expect(escalated).toMatchObject({ identified: false, escalated: true });
    expect(escalated.firstMessage.length).toBeLessThanOrEqual(120);
    expect(escalated.firstMessage).toContain('[phone]');
    expect(escalated.firstMessage).toContain('[email]');
    expect(escalated.firstMessage).not.toContain('me@corp.com');
    expect(Object.keys(escalated).sort()).toEqual(['escalated', 'firstMessage', 'id', 'identified', 'lastTurnAt', 'messageCount', 'startedAt']);
    expect(JSON.stringify(conversations)).not.toMatch(/anon_secret|v-secret/);
  });

  it('a bad cursor is 400', async () => {
    expect((await convGET(req('owner', 'http://x/?cursor=garbage'), p({ id: ACC1 }))).status).toBe(400);
  });
});

describe('GET associations/:id/conversations/:sessionId', () => {
  beforeEach(() => {
    db.tables.visitors.push({ id: 'v1', account_id: ACC1, identity_source: 'ams_email', name: 'Typed Name', email: 'typed@corp.com', anon_id: 'anon_zzz' });
    db.tables.visitors.push({ id: 'v2', account_id: ACC1, identity_source: 'ams_login', name: 'Jane Member' });
    db.tables.chat_sessions.push({ id: S1, account_id: ACC1, ref_source: 'copilot', visitor_id: 'v1', created_at: '2026-10-10T00:00:00Z' });
    db.tables.chat_messages.push(
      { session_id: S1, role: 'user', content: 'I am typed@corp.com', created_at: '2026-10-10T00:00:01Z' },
      { session_id: S1, role: 'assistant', content: 'See [1]', created_at: '2026-10-10T00:00:02Z', metadata: { copilot: { sources: [{ n: 1, title: 'Join', url: 'https://buses.org/join' }, { n: 2, title: 'bad', url: 'javascript:x' }] } } },
      { session_id: S1, role: 'system', content: 'internal', created_at: '2026-10-10T00:00:03Z' },
    );
  });

  it('an unverified visitor is "Visitor", typed contact details are redacted, sources kept, no raw ids', async () => {
    const body = await (await transcriptGET(req('assocViewer'), p({ id: ACC1, sessionId: S1 }))).json();
    expect(body.visitor).toEqual({ label: 'Visitor', identified: false });
    expect(body.messages).toEqual([
      { role: 'user', content: 'I am [email]', createdAt: '2026-10-10T00:00:01Z', sources: [] },
      { role: 'assistant', content: 'See [1]', createdAt: '2026-10-10T00:00:02Z', sources: [{ n: 1, title: 'Join', url: 'https://buses.org/join' }] },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/Typed Name|typed@corp|anon_zzz|"v1"/);
  });

  it('a verified member shows their name', async () => {
    db.tables.chat_sessions[0].visitor_id = 'v2';
    const body = await (await transcriptGET(req('owner'), p({ id: ACC1, sessionId: S1 }))).json();
    expect(body.visitor).toEqual({ label: 'Jane Member', identified: true });
  });

  it('a session of another association (or not a copilot session) is 404', async () => {
    db.tables.chat_sessions[0].account_id = ACC2;
    expect((await transcriptGET(req('owner'), p({ id: ACC1, sessionId: S1 }))).status).toBe(404);
    db.tables.chat_sessions[0].account_id = ACC1;
    db.tables.chat_sessions[0].ref_source = 'widget';
    expect((await transcriptGET(req('owner'), p({ id: ACC1, sessionId: S1 }))).status).toBe(404);
  });
});

describe('PATCH associations/:id/settings', () => {
  it('whitelists, merges through the RPC, keeps unmanaged keys, returns the snapshot', async () => {
    const res = await patch('owner', ACC1, {
      branding: { primary: '#03538A', logo: 'https://www.buses.org/logo.svg', header_links: [{ label: 'Events', url: 'https://buses.org/events' }] },
      opening_questions: [' How do I join? ', 'When is Marketplace?'],
      exclusions: ['/members-only', 'https://buses.org/private'],
      contact_trigger: [{ kind: 'after_n_questions', n: 3 }],
      escalation: { recipients: ['Help@Buses.org', 'ops@buses.org'] },
      links: { renew: 'https://buses.org/renew' },
      tone: 'Warm and plain.',
    });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings).toMatchObject({
      branding: { primary: '#03538A', logo: 'https://www.buses.org/logo.svg', header_links: [{ label: 'Events', url: 'https://buses.org/events' }] },
      opening_questions: ['How do I join?', 'When is Marketplace?'],
      exclusions: ['/members-only', 'https://buses.org/private'],
      contact_trigger: [{ kind: 'after_n_questions', n: 3 }],
      escalation: { recipients: ['help@buses.org', 'ops@buses.org'] },
      links: { join: 'https://buses.org/join', renew: 'https://buses.org/renew' },
      tone: 'Warm and plain.',
    });
    const cp = db.tables.accounts.find((a) => a.id === ACC1)!.config.copilot;
    expect(cp.identify_secret_ref).toBe('secret-ref');
    expect(cp.industry).toBe('motorcoach');
    expect(cp.escalation.extra).toBe(1);
    expect(cp.links.other).toBe('https://buses.org/o');
    expect(db.tables.accounts.find((a) => a.id === ACC1)!.config.username).toBe('aba');
  });

  it('clears a link with null', async () => {
    const { settings } = await (await patch('owner', ACC1, { links: { join: null } })).json();
    expect(settings.links.join).toBeNull();
  });

  it.each([
    [{ identify_secret_ref: 'x' }, 'identify_secret_ref'],
    [{ ams: { provider: 'real' } }, 'ams'],
    [{ branding: { primary: 'red; background:url(x)' } }, 'branding.primary'],
    [{ branding: { logo: 'http://insecure.test/l.png' } }, 'branding.logo'],
    [{ branding: { secret_token: 'x' } }, 'branding.secret_token'],
    [{ branding: { font: 'Inter"; }' } }, 'branding.font'],
    [{ opening_questions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, 'opening_questions'],
    [{ opening_questions: ['x'.repeat(121)] }, 'opening_questions'],
    [{ exclusions: ['members'] }, 'exclusions'],
    [{ exclusions: Array.from({ length: 51 }, () => '/a') }, 'exclusions'],
    [{ contact_trigger: [{ kind: 'always' }] }, 'contact_trigger'],
    [{ escalation: { recipients: ['not-an-email'] } }, 'escalation.recipients'],
    [{ escalation: { recipients: Array.from({ length: 11 }, (_, i) => `a${i}@b.co`) } }, 'escalation.recipients'],
    [{ escalation: { recipients: [], enabled: false } }, 'escalation'],
    [{ links: { join: 'http://buses.org/join' } }, 'links.join'],
    [{ links: { join: 'javascript:alert(1)' } }, 'links.join'],
    [{ tone: 'x'.repeat(301) }, 'tone'],
    [{}, 'body'],
  ])('refuses %j -> 400 naming %s, writes nothing', async (body, field) => {
    const before = JSON.stringify(db.tables.accounts);
    const res = await patch('owner', ACC1, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_settings', field });
    expect(JSON.stringify(db.tables.accounts)).toBe(before);
  });
});

describe('redactContact', () => {
  it('redacts emails and phone numbers but keeps dates and short numbers', () => {
    expect(redactContact('mail a.b@x.org or call 054-123-4567 on 2026-10-18 about order 12345'))
      .toBe('mail [email] or call [phone] on 2026-10-18 about order 12345');
  });
});
