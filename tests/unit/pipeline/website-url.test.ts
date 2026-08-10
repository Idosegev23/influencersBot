import { describe, it, expect } from 'vitest';
import { normalizeWebsiteUrl } from '@/lib/pipeline/website-url';

describe('normalizeWebsiteUrl', () => {
  // The incident this exists for: the onboarding wizard passed the bare domain
  // "triroars.co.il" straight through, and `new URL()` in sitemap discovery threw
  // "Invalid URL", failing the whole scan job at step 6 of 11.
  it('adds https:// to a bare domain', () => {
    expect(normalizeWebsiteUrl('triroars.co.il')).toBe('https://triroars.co.il');
    expect(normalizeWebsiteUrl('www.triroars.co.il')).toBe('https://www.triroars.co.il');
  });

  it('leaves an already-absolute URL alone', () => {
    expect(normalizeWebsiteUrl('https://triroars.co.il')).toBe('https://triroars.co.il');
    expect(normalizeWebsiteUrl('https://triroars.co.il/shop')).toBe('https://triroars.co.il/shop');
  });

  it('keeps http:// rather than silently upgrading it', () => {
    expect(normalizeWebsiteUrl('http://old.example.com')).toBe('http://old.example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeWebsiteUrl('  triroars.co.il  ')).toBe('https://triroars.co.il');
  });

  it('returns empty string for empty/nullish input', () => {
    expect(normalizeWebsiteUrl('')).toBe('');
    expect(normalizeWebsiteUrl('   ')).toBe('');
    expect(normalizeWebsiteUrl(null as any)).toBe('');
    expect(normalizeWebsiteUrl(undefined as any)).toBe('');
  });

  // Anything that still cannot parse must come back as '' rather than reaching the
  // pipeline, so a bad value is dropped at the boundary instead of throwing at step 6.
  it('returns empty string when the result is still not a valid URL', () => {
    expect(normalizeWebsiteUrl('http://')).toBe('');
    expect(normalizeWebsiteUrl('not a domain at all')).toBe('');
  });

  it('produces a value new URL() accepts', () => {
    expect(() => new URL(normalizeWebsiteUrl('triroars.co.il'))).not.toThrow();
  });
});
