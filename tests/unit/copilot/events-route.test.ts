import { describe, it, expect, vi, beforeEach } from 'vitest';

const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const visitor = { id: 'v1', account_id: 'acc', partner_id: 'pA', merged_into: null };
const OWNED = '123e4567-e89b-42d3-a456-426614174000';
const FOREIGN = '223e4567-e89b-42d3-a456-426614174000';

vi.mock('@/lib/copilot/auth', () => ({ requireTenant: async () => T }));
vi.mock('@/lib/copilot/association', () => ({ loadAssociation: async () => ({ industry: 'motorcoach' }) }));
const getVisitor = vi.fn(async () => visitor as any);
vi.mock('@/lib/copilot/visitors', () => ({ getVisitor: (...a: any[]) => getVisitor(...(a as [])) }));
const recordEvents = vi.fn();
vi.mock('@/lib/copilot/events', async (orig) => ({ ...(await orig<any>()), recordEvents: (...a: any[]) => recordEvents(...a) }));

// chat_sessions rows: only OWNED belongs to (acc, v1); FOREIGN belongs to another visitor.
const sessions = [
  { id: OWNED, account_id: 'acc', visitor_id: 'v1' },
  { id: FOREIGN, account_id: 'acc', visitor_id: 'v-other' },
];
const queries: any[] = [];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const f: { in?: string[]; eq: Record<string, unknown> } = { eq: {} };
      const api: any = {
        select: () => api,
        in: (_c: string, ids: string[]) => { f.in = ids; return api; },
        eq: (c: string, v: unknown) => { f.eq[c] = v; return api; },
        then: (res: any, rej: any) => {
          queries.push({ table, ...f });
          const data = sessions.filter((s) => f.in!.includes(s.id) && Object.entries(f.eq).every(([k, v]) => (s as any)[k] === v)).map((s) => ({ id: s.id }));
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return api;
    },
  },
}));

import { POST } from '@/app/api/partner/v1/events/route';

const req = (b: any) => new Request('http://x/api/partner/v1/events', { method: 'POST', body: JSON.stringify(b) }) as any;

beforeEach(() => { recordEvents.mockClear(); getVisitor.mockResolvedValue(visitor); queries.length = 0; });

describe('POST /events', () => {
  it('keeps an owned session id and nulls a foreign or unknown one', async () => {
    const UNKNOWN = '323e4567-e89b-42d3-a456-426614174000';
    const res = await POST(req({
      visitorId: 'v1',
      events: [
        { type: 'page_view', sessionId: OWNED, payload: { path: '/a' } },
        { type: 'page_view', sessionId: FOREIGN, payload: { path: '/b' } },
        { type: 'link_clicked', sessionId: UNKNOWN, payload: { target: 'x' } },
        { type: 'page_view', payload: { path: '/c' } },
        { type: 'not_allowed' },
      ],
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 4, rejected: 1 });
    expect(queries).toEqual([{ table: 'chat_sessions', in: expect.arrayContaining([OWNED, FOREIGN, UNKNOWN]), eq: { account_id: 'acc', visitor_id: 'v1' } }]);
    expect(queries[0].in).toHaveLength(3);
    const [ctx, events] = recordEvents.mock.calls[0];
    expect(ctx).toMatchObject({ partnerId: 'pA', accountId: 'acc', visitorId: 'v1' });
    expect(events[0].sessionId).toBe(OWNED);
    expect(events[1].sessionId ?? null).toBeNull();
    expect(events[2].sessionId ?? null).toBeNull();
    expect(events[3].sessionId ?? null).toBeNull();
  });

  it('skips the session lookup when no event carries a session id', async () => {
    const res = await POST(req({ visitorId: 'v1', events: [{ type: 'page_view', payload: { path: '/' } }] }));
    expect(await res.json()).toEqual({ accepted: 1, rejected: 0 });
    expect(queries).toHaveLength(0);
  });

  it('404 for an unknown visitor, 400 for junk', async () => {
    getVisitor.mockResolvedValueOnce(null);
    expect((await POST(req({ visitorId: 'vX', events: [] }))).status).toBe(404);
    expect((await POST(req({ events: [] }))).status).toBe(400);
  });
});
