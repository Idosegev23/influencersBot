import { describe, it, expect } from 'vitest';
import { cleanPageTitles, cleanExcerpt } from '@/lib/content/browse-card';
import { resolveCategoryTitle } from '@/lib/discovery/categories';
import { formatRelativeTime } from '@/lib/utils';

describe('cleanPageTitles', () => {
  const SITE = 'Dominican Republic Tourism - Official Website';
  const batch = [
    `Water Sports - Dominican Republic - ${SITE}`,
    `Marinas - Dominican Republic - ${SITE}`,
    `Billini Hotel - ${SITE}`,
    `Be Live Collection Marien - ${SITE}`,
  ];

  it('strips the branding every page of the batch ends with, peeling it segment by segment', () => {
    const out = cleanPageTitles(batch);
    expect(out[2]).toBe('Billini Hotel');
    expect(out[3]).toBe('Be Live Collection Marien');
    // "- Dominican Republic" is shared by only 2 of 4 pages: that one is part of the name.
    expect(out[0]).toBe('Water Sports - Dominican Republic');
  });

  it('leaves titles alone when there is no shared suffix, or too few to infer one', () => {
    expect(cleanPageTitles(['A - One', 'B - Two', 'C - Three'])).toEqual(['A - One', 'B - Two', 'C - Three']);
    expect(cleanPageTitles([`A - ${SITE}`, `B - ${SITE}`])).toEqual([`A - ${SITE}`, `B - ${SITE}`]);
  });

  it('never strips a title to nothing', () => {
    const out = cleanPageTitles([SITE, SITE, SITE, `X - ${SITE}`]);
    for (const t of out) expect(t.length).toBeGreaterThan(0);
  });

  it('decodes entities', () => {
    expect(cleanPageTitles(['Bed &amp; Breakfast'])[0]).toBe('Bed & Breakfast');
  });
});

describe('cleanExcerpt', () => {
  const hotel =
    'Title: Billini Hotel - Dominican Republic Tourism - Official Website\nDescription: Calle Padre Billini 256 &amp; 258, Colonial Zone\nSanto Domingo\n809-338-4040\nreservations@billinihotel.com\nhttp://www.billinihotel.com\n\nProduct: Billini Hotel';

  it('keeps the address, drops the title line, phone, email and url', () => {
    const out = cleanExcerpt(hotel, 'website');
    expect(out).toContain('Calle Padre Billini 256 & 258, Colonial Zone');
    expect(out).toContain('Santo Domingo');
    expect(out).not.toMatch(/Title:|Description:|Product:/);
    expect(out).not.toMatch(/809-338-4040|@|http/);
  });

  it('does not eat a date', () => {
    expect(cleanExcerpt('Description: Festival runs 2026-10-15 to 2026-10-18 in Sosúa', 'website')).toContain('2026-10-15');
  });

  it('removes transcript and caption markers', () => {
    const out = cleanExcerpt('[music] [music] >> Sometimes without even realizing it', 'transcription');
    expect(out).toBe('Sometimes without even realizing it');
    expect(cleanExcerpt('[carousel] A little taste of Santo Domingo', 'post')).toBe('A little taste of Santo Domingo');
  });

  it('truncates with an ellipsis', () => {
    const out = cleanExcerpt('word '.repeat(80), 'post', 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('English chrome', () => {
  it('uses the whole name for an organisation, the first name for a creator', () => {
    const tpl = "{name}'s most viral videos";
    expect(resolveCategoryTitle(tpl, 'Dominican Republic', { fullName: true })).toBe("Dominican Republic's most viral videos");
    expect(resolveCategoryTitle(tpl, 'Dana Cohen')).toBe("Dana's most viral videos");
  });

  it('formats a post older than a week in English, never Hebrew', () => {
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
    const out = formatRelativeTime(old, 'en');
    expect(out).toMatch(/[A-Za-z]/);
    expect(out).not.toMatch(/[֐-׿]/);
  });
});
