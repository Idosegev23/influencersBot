import { describe, it, expect } from 'vitest';
import { planIdentityPatch, companyFromEmail, identityFromEmail, type VisitorIdentity } from '@/lib/copilot/identity';
import { StubAmsAdapter } from '@/lib/copilot/ams/stub';
import { AmsUnavailableError, type AmsAdapter } from '@/lib/copilot/ams/types';

const NOW = '2026-10-01T10:00:00.000Z';
const anon: VisitorIdentity = { identity_source: null, member_ref: null, email: null, name: null, company: null, company_domain: null, membership: null };

describe('planIdentityPatch', () => {
  it('applies any source to an anonymous visitor', () => {
    expect(planIdentityPatch(anon, { source: 'email_domain', email: 'a@acme.com', company: 'Acme', companyDomain: 'acme.com' }, NOW))
      .toEqual({ identity_source: 'email_domain', identity_resolved_at: NOW, email: 'a@acme.com', company: 'Acme', company_domain: 'acme.com' });
  });
  it('lets a stronger source replace a weaker one', () => {
    const cur = { ...anon, identity_source: 'email_domain' as const, company: 'Acme' };
    const p = planIdentityPatch(cur, { source: 'ams_login', memberRef: 'M1', company: 'Acme Coaches' }, NOW);
    expect(p).toMatchObject({ identity_source: 'ams_login', member_ref: 'M1', company: 'Acme Coaches' });
  });
  it('never lets a weaker source overwrite a stronger one, only fill gaps', () => {
    const cur = { ...anon, identity_source: 'ams_login' as const, member_ref: 'M1', company: 'Acme Coaches', email: null };
    const p = planIdentityPatch(cur, { source: 'external', company: 'Some ISP', email: 'x@y.com' }, NOW);
    expect(p).toEqual({ email: 'x@y.com' });
  });
  it('returns null when nothing would change', () => {
    const cur = { ...anon, identity_source: 'ams_login' as const, company: 'Acme' };
    expect(planIdentityPatch(cur, { source: 'external', company: 'Other' }, NOW)).toBeNull();
  });
});

describe('companyFromEmail', () => {
  it('derives a company from a business domain', () => {
    expect(companyFromEmail('Jane@Greyhound.com')).toEqual({ domain: 'greyhound.com', company: 'Greyhound' });
    expect(companyFromEmail('a@coach-usa.com')).toEqual({ domain: 'coach-usa.com', company: 'Coach Usa' });
    expect(companyFromEmail('a@mail.nationalexpress.co.uk')).toEqual({ domain: 'mail.nationalexpress.co.uk', company: 'Nationalexpress' });
  });
  it('returns null for consumer mail, US ISPs and junk', () => {
    expect(companyFromEmail('john@gmail.com')).toBeNull();
    expect(companyFromEmail('john@comcast.net')).toBeNull();
    expect(companyFromEmail('john@sbcglobal.net')).toBeNull();
    expect(companyFromEmail('not-an-email')).toBeNull();
    for (const a of ['a@yahoo.co.uk', 'a@hotmail.co.uk', 'a@live.co.uk', 'a@btinternet.com', 'a@rogers.com', 'a@-.com']) {
      expect(companyFromEmail(a), a).toBeNull();
    }
    expect(companyFromEmail('a@greyhound.com')?.company).toBe('Greyhound');
  });
});

describe('identityFromEmail', () => {
  const ams = new StubAmsAdapter([{ memberRef: 'M9', email: 'pat@acme.com', name: 'Pat', company: 'Acme Coaches', status: 'active', type: 'Operator', renewalDate: '2027-01-01', registrations: [] }]);
  it('identifies a member through the AMS', async () => {
    const r = await identityFromEmail('PAT@acme.com', ams);
    expect(r.amsUnavailable).toBe(false);
    expect(r.update).toMatchObject({ source: 'ams_email', memberRef: 'M9', company: 'Acme Coaches', email: 'pat@acme.com' });
  });
  it('falls back to the email domain for a non-member', async () => {
    const r = await identityFromEmail('lee@greyhound.com', ams);
    expect(r.update).toMatchObject({ source: 'email_domain', company: 'Greyhound', companyDomain: 'greyhound.com' });
  });
  it('gives no identity for a consumer email that is not a member', async () => {
    expect((await identityFromEmail('lee@gmail.com', ams)).update).toBeNull();
  });
  it('reports an AMS outage and still uses the domain', async () => {
    const down: AmsAdapter = { provider: 'x', getMember: async () => { throw new AmsUnavailableError('down'); }, findMemberByEmail: async () => { throw new AmsUnavailableError('down'); } };
    const r = await identityFromEmail('lee@greyhound.com', down);
    expect(r.amsUnavailable).toBe(true);
    expect(r.update?.source).toBe('email_domain');
  });
});
