import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Record<string, any> = {};
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: rows[table]?.[v] ?? null }) }),
      }),
      update: () => ({ eq: () => ({ then: (fn: any) => fn() }) }),
    }),
  },
}));

import { resolveTenant } from '@/lib/copilot/tenant';
import { requireTenant } from '@/lib/copilot/auth';
import { hashPartnerKey } from '@/lib/copilot/keys';

const KEY_A = 'cpk_partnerA';
beforeEach(() => {
  rows.partner_api_keys = {
    [hashPartnerKey(KEY_A)]: { id: 'k1', partner_id: 'pA', status: 'active' },
    [hashPartnerKey('cpk_revoked')]: { id: 'k2', partner_id: 'pA', status: 'revoked' },
  };
  rows.tenant_domains = {
    'aba.copilot.test': { host: 'aba.copilot.test', partner_id: 'pA', account_id: 'acc-aba' },
    'copilot.test': { host: 'copilot.test', partner_id: 'pA', account_id: null },
    'other.partner.test': { host: 'other.partner.test', partner_id: 'pB', account_id: 'acc-x' },
  };
});

function req(headers: Record<string, string>) {
  return new Request('http://x/api/partner/v1/session', { headers });
}

describe('resolveTenant', () => {
  it('resolves an association host owned by the key partner', async () => {
    const r = await resolveTenant(hashPartnerKey(KEY_A), 'aba.copilot.test');
    expect(r).toEqual({ ok: true, tenant: { partnerId: 'pA', accountId: 'acc-aba', host: 'aba.copilot.test' } });
  });
  it('refuses a host owned by another partner with 403', async () => {
    const r = await resolveTenant(hashPartnerKey(KEY_A), 'other.partner.test');
    expect(r).toEqual({ ok: false, status: 403, error: 'host_not_owned' });
  });
  it('refuses unknown keys, revoked keys and unknown hosts', async () => {
    expect(await resolveTenant(hashPartnerKey('cpk_nope'), 'aba.copilot.test')).toMatchObject({ ok: false, status: 401 });
    expect(await resolveTenant(hashPartnerKey('cpk_revoked'), 'aba.copilot.test')).toMatchObject({ ok: false, status: 401 });
    expect(await resolveTenant(hashPartnerKey(KEY_A), 'missing.test')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('requireTenant', () => {
  it('returns the tenant for a valid association request', async () => {
    const t = await requireTenant(req({ authorization: `Bearer ${KEY_A}`, 'x-tenant-host': 'ABA.copilot.test' }), { association: true });
    expect(t).toEqual({ partnerId: 'pA', accountId: 'acc-aba', host: 'aba.copilot.test' });
  });
  it('requires an association host when asked', async () => {
    const t = await requireTenant(req({ authorization: `Bearer ${KEY_A}`, 'x-tenant-host': 'copilot.test' }), { association: true });
    expect(t).toBeInstanceOf(Response);
    expect((t as Response).status).toBe(400);
  });
  it('returns 401 without a key and 400 without a host', async () => {
    expect(((await requireTenant(req({ 'x-tenant-host': 'aba.copilot.test' }), { association: true })) as Response).status).toBe(401);
    expect(((await requireTenant(req({ authorization: `Bearer ${KEY_A}` }), { association: true })) as Response).status).toBe(400);
  });
  it('refusal bodies carry no vendor names', async () => {
    const t = (await requireTenant(req({ authorization: `Bearer ${KEY_A}`, 'x-tenant-host': 'other.partner.test' }), { association: true })) as Response;
    const body = await t.text();
    expect(body).toContain('host_not_owned');
    expect(body).not.toMatch(/bestie|influencerbot|ldrs|imai/i);
  });
});
