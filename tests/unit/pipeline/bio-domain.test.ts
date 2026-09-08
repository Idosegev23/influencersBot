import { describe, it, expect } from 'vitest';
import { pickSiteHostFromBioLinks } from '@/lib/pipeline/bio-domain';

describe('pickSiteHostFromBioLinks', () => {
  // The incident this exists for: rebar (d0deb82d) was scanned with no websiteUrl,
  // so finalize registered no config.widget.domain and /demo/<id> framed a raw
  // 404 JSON blob. Its Instagram bio held rebar.co.il the whole time — but the
  // FIRST link in that bio is an App Store link, so "take the first link" would
  // have registered apple.co as the customer's website.
  const rebarBio = [
    { url: 'https://apple.co/40XDTis' },
    { url: 'https://rebar.co.il/giftcards/?utm_source=social&utm_medium=Instagram+' },
    { url: 'https://rebar.co.il/recards/?utm_source=social&utm_campaign=loyalty+cards' },
    { url: 'https://rebar.co.il/reclub-new/?utm_source=social&utm_campaign=reclub' },
  ];

  it('picks the most frequent real site, not the first link', () => {
    expect(pickSiteHostFromBioLinks(rebarBio)).toBe('rebar.co.il');
  });

  it('skips aggregators, app stores, shorteners and social profiles', () => {
    expect(pickSiteHostFromBioLinks([
      { url: 'https://linktr.ee/somebrand' },
      { url: 'https://www.instagram.com/somebrand' },
      { url: 'https://wa.me/972500000000' },
      { url: 'https://bit.ly/xyz' },
      { url: 'https://l.instagram.com/?u=https%3A%2F%2Fexample.com' },
    ])).toBeNull();
  });

  it('treats co.il as a two-label suffix so it never returns a bare public suffix', () => {
    expect(pickSiteHostFromBioLinks([{ url: 'https://shop.argania.co.il/x' }])).toBe('shop.argania.co.il');
    // The guard that matters: a host that IS the public suffix must not win.
    expect(pickSiteHostFromBioLinks([{ url: 'https://co.il' }])).toBeNull();
  });

  it('groups www and bare host together and returns the more common spelling', () => {
    expect(pickSiteHostFromBioLinks([
      { url: 'https://www.bara.co.il/a' },
      { url: 'https://www.bara.co.il/b' },
      { url: 'https://bara.co.il/c' },
    ])).toBe('www.bara.co.il');
  });

  // Each of these came out of the real backfill dry run against production bios,
  // where it was wrongly registered as a customer's website.
  it('skips document hosts, link shorteners and social-suite trackers', () => {
    // ISRAEL BIDUR's bio pointed at a Google Doc.
    expect(pickSiteHostFromBioLinks([{ url: 'https://docs.google.com/document/d/abc' }])).toBeNull();
    // Lenovo's bio only carried Sprinklr's shortener.
    expect(pickSiteHostFromBioLinks([{ url: 'https://spr.ly/6018abcd' }])).toBeNull();
    // סולתם's bio led with an Israeli shortener before its real domain.
    expect(pickSiteHostFromBioLinks([
      { url: 'https://did.li/abc' },
      { url: 'https://soltam.co.il/shop' },
    ])).toBe('soltam.co.il');
  });

  it('survives junk without throwing', () => {
    expect(pickSiteHostFromBioLinks([{ url: 'not a url' }, { url: '' }, {} as any])).toBeNull();
    expect(pickSiteHostFromBioLinks([])).toBeNull();
    expect(pickSiteHostFromBioLinks(null as any)).toBeNull();
  });

  it('ignores non-http schemes', () => {
    expect(pickSiteHostFromBioLinks([
      { url: 'mailto:hi@brand.com' },
      { url: 'tel:+972500000000' },
    ])).toBeNull();
  });
});
