import { describe, it, expect, vi, beforeEach } from 'vitest';

const db: { visitors: any[]; rpc: any[]; inserts: any[] } = { visitors: [], rpc: [], inserts: [] };

function q(table: string) {
  const filters: Record<string, unknown> = {};
  const api: any = {
    select: () => api,
    eq: (c: string, v: unknown) => { filters[c] = v; return api; },
    is: (c: string, v: unknown) => { filters[c] = v; return api; },
    neq: (c: string, v: unknown) => { filters['!' + c] = v; return api; },
    maybeSingle: async () => ({ data: db.visitors.find((r) => Object.entries(filters).every(([k, v]) => k.startsWith('!') ? r[k.slice(1)] !== v : r[k] === v)) ?? null }),
    single: async () => api.maybeSingle(),
    upsert: (row: any) => { if (!db.visitors.find((r) => r.account_id === row.account_id && r.anon_id === row.anon_id)) db.visitors.push({ id: `v${db.visitors.length + 1}`, merged_into: null, identity_source: null, member_ref: null, email: null, name: null, company: null, company_domain: null, membership: null, identity_resolved_at: null, ...row }); return { then: (f: any) => f({ error: null }) }; },
    update: (patch: any) => ({ eq: async (_c: string, id: string) => { Object.assign(db.visitors.find((r) => r.id === id), patch); return { error: null }; } }),
    insert: async (rows: any) => { db.inserts.push(...rows); return { error: null }; },
  };
  return api;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => q(t),
    rpc: async (name: string, args: any) => {
      db.rpc.push({ name, args });
      if (name === 'copilot_merge_visitor') {
        const from = db.visitors.find((r) => r.id === args.p_from);
        from.merged_into = args.p_into; from.member_ref = null;
      }
      return { error: null };
    },
  },
}));

import { getOrCreateVisitor, getVisitor, applyIdentity, isValidAnonId, IdentityConflictError } from '@/lib/copilot/visitors';
import { recordEvents } from '@/lib/copilot/events';

const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const ANON1 = 'anon_aaaaaaaaaaaaaaaa';
const ANON2 = 'anon_bbbbbbbbbbbbbbbb';

beforeEach(() => { db.visitors = []; db.rpc = []; db.inserts = []; });

describe('visitors', () => {
  it('validates anon ids', () => {
    expect(isValidAnonId(ANON1)).toBe(true);
    expect(isValidAnonId('short')).toBe(false);
    expect(isValidAnonId('has space aaaaaaaaaaaa')).toBe(false);
  });

  it('creates once and returns the same visitor for the same anon id', async () => {
    const a = await getOrCreateVisitor(T, ANON1);
    const b = await getOrCreateVisitor(T, ANON1);
    expect(a.id).toBe(b.id);
    expect(db.visitors).toHaveLength(1);
  });

  it('merges a second device into the existing member profile', async () => {
    const first = await getOrCreateVisitor(T, ANON1);
    await applyIdentity(T, first, { source: 'ams_login', memberRef: 'M1', company: 'Acme' });
    const second = await getOrCreateVisitor(T, ANON2);
    const r = await applyIdentity(T, second, { source: 'ams_login', memberRef: 'M1' });
    expect(r.merged).toBe(true);
    expect(r.visitor.id).toBe(first.id);
    expect(db.rpc).toContainEqual({ name: 'copilot_merge_visitor', args: { p_from: second.id, p_into: first.id } });
    // The merged device now resolves to the member profile.
    expect((await getOrCreateVisitor(T, ANON2)).id).toBe(first.id);
  });

  it('identifying an already merged visitor again does not merge into itself', async () => {
    const first = await getOrCreateVisitor(T, ANON1);
    await applyIdentity(T, first, { source: 'ams_login', memberRef: 'M1' });
    const second = await getOrCreateVisitor(T, ANON2);
    await applyIdentity(T, second, { source: 'ams_login', memberRef: 'M1' });
    const resolved = await getVisitor(T, second.id);
    expect(resolved!.id).toBe(first.id);
    const again = await applyIdentity(T, resolved!, { source: 'ams_login', memberRef: 'M1' });
    expect(again.merged).toBe(false);
    expect(again.visitor.id).toBe(first.id);
    expect(db.rpc.filter((r) => r.name === 'copilot_merge_visitor')).toHaveLength(1);
  });

  it('refuses to re-identify a visitor as a different member', async () => {
    const v = await getOrCreateVisitor(T, ANON1);
    await applyIdentity(T, v, { source: 'ams_login', memberRef: 'M1' });
    const cur = (await getVisitor(T, v.id))!;
    await expect(applyIdentity(T, cur, { source: 'ams_login', memberRef: 'M2' })).rejects.toBeInstanceOf(IdentityConflictError);
    expect(db.visitors.find((r) => r.id === v.id).member_ref).toBe('M1');
    expect(db.rpc).toHaveLength(0);
  });

  it('identifies an anonymous visitor as a member', async () => {
    const v = await getOrCreateVisitor(T, ANON1);
    const r = await applyIdentity(T, v, { source: 'ams_login', memberRef: 'M2' });
    expect(r.visitor.member_ref).toBe('M2');
    expect(db.visitors.find((x) => x.id === v.id).member_ref).toBe('M2');
  });

  it('getVisitor refuses a visitor from another account', async () => {
    const v = await getOrCreateVisitor(T, ANON1);
    expect(await getVisitor({ ...T, accountId: 'other' }, v.id)).toBeNull();
  });
});

describe('recordEvents', () => {
  it('writes rows with tenant context', async () => {
    await recordEvents({ partnerId: 'pA', accountId: 'acc', visitorId: 'v1', industry: 'motorcoach' }, [{ type: 'session_started', sessionId: 's1' }]);
    expect(db.inserts[0]).toMatchObject({ partner_id: 'pA', account_id: 'acc', visitor_id: 'v1', session_id: 's1', type: 'session_started', industry: 'motorcoach', payload: {} });
  });
  it('does nothing for an empty batch', async () => {
    await recordEvents({ partnerId: 'pA', accountId: 'acc', visitorId: 'v1', industry: null }, []);
    expect(db.inserts).toHaveLength(0);
  });
});
