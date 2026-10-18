// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildInstructions, allowedCtaUrls } from '@/lib/copilot/prompt';

const base = {
  associationName: 'American Bus Association', websiteUrl: 'https://www.buses.org', today: '2026-10-18',
  sources: [{ n: 1, id: 'c1', title: 'Membership', url: 'https://buses.org/membership/', excerpt: 'Operator members...', entityType: 'website' }],
  events: [{ id: 'ev1', title: 'Marketplace 2027', startsOn: '2027-01-10', endsOn: '2027-01-13', location: 'Columbus, OH', url: 'https://buses.org/marketplace', registrationUrl: 'https://buses.org/register', summary: null }],
  member: null, identified: false, joinUrl: 'https://buses.org/join', renewUrl: null,
  topics: ['membership', 'events'], tone: null,
};

describe('buildInstructions', () => {
  it('lists numbered sources with URLs, upcoming events and the META contract', () => {
    const p = buildInstructions(base as any);
    expect(p).toContain('You are the assistant on the American Bus Association website');
    expect(p).toContain('[1] Membership — https://buses.org/membership/');
    expect(p).toContain('id=ev1');
    expect(p).toContain('2027-01-10');
    expect(p).toContain('<<META>>');
    expect(p).toContain('English');
    expect(p).not.toMatch(/bestie|influencerbot|ldrs|imai/i);
  });
  it('describes a member with renewal due and never shows member data for anonymous visitors', () => {
    const anon = buildInstructions(base as any);
    expect(anon).toContain('not signed in');
    const member = buildInstructions({ ...base, identified: true, renewUrl: 'https://buses.org/renew', member: { memberRef: 'M1', email: null, name: 'Pat', company: 'Acme Coaches', status: 'active', type: 'Operator', renewalDate: '2026-11-30', registrations: [], fetchedAt: '' } } as any);
    expect(member).toContain('Acme Coaches');
    expect(member).toContain('renewal date 2026-11-30');
    expect(member).toContain('within 60 days');
  });
  it('says there are no upcoming events when the list is empty', () => {
    expect(buildInstructions({ ...base, events: [] } as any)).toContain('No upcoming events are known');
  });
  it('contains no http(s) URL other than the sources, events and key links', () => {
    const ctx = { ...base, renewUrl: 'https://buses.org/renew' } as any;
    const allowed = new Set<string>([...ctx.sources.map((s: any) => s.url), ...allowedCtaUrls(ctx)]);
    const found = buildInstructions(ctx).match(/https?:\/\/[^\s|)]+/g) ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const u of found) expect(allowed.has(u)).toBe(true);
    expect(buildInstructions(ctx)).not.toContain('www.buses.org');
  });
});

describe('allowedCtaUrls', () => {
  it('collects join, renew and event links', () => {
    expect(allowedCtaUrls({ ...base, renewUrl: 'https://buses.org/renew' } as any).sort())
      .toEqual(['https://buses.org/join', 'https://buses.org/marketplace', 'https://buses.org/register', 'https://buses.org/renew'].sort());
  });
});
