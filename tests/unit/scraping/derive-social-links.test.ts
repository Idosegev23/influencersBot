import { describe, it, expect } from 'vitest';
import { deriveSocialLinks } from '@/lib/scraping/derive-social-links';

describe('deriveSocialLinks', () => {
  it('maps known platforms, dedupes per platform, ignores non-http', () => {
    const r = deriveSocialLinks([
      'https://instagram.com/x',
      'https://tiktok.com/@x',
      'ftp://no',
      'https://instagram.com/y',
    ]);
    expect(r).toEqual([
      { platform: 'instagram', url: 'https://instagram.com/x' },
      { platform: 'tiktok', url: 'https://tiktok.com/@x' },
    ]);
  });

  it('injects the IG profile from username when no IG link is present', () => {
    const r = deriveSocialLinks([], 'burgerkingisrael');
    expect(r[0]).toEqual({ platform: 'instagram', url: 'https://instagram.com/burgerkingisrael' });
  });

  it('does not inject IG when an IG link already exists', () => {
    const r = deriveSocialLinks(['https://instagram.com/real'], 'ignored');
    expect(r).toEqual([{ platform: 'instagram', url: 'https://instagram.com/real' }]);
  });

  it('matches facebook, fb.com and youtu.be', () => {
    const r = deriveSocialLinks([
      'https://fb.com/page',
      'https://youtu.be/abc',
    ]);
    expect(r).toEqual([
      { platform: 'facebook', url: 'https://fb.com/page' },
      { platform: 'youtube', url: 'https://youtu.be/abc' },
    ]);
  });

  it('returns [] on empty/garbage input', () => {
    expect(deriveSocialLinks([null, undefined, '', 'notaurl'])).toEqual([]);
  });
});
