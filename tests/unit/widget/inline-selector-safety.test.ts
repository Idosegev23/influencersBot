import { describe, it, expect } from 'vitest';
import { resolveInlineMount, isStableSelector, isUnsafeSelector } from '@/lib/widget/inline';

const mount = (selector: string, extra: Record<string, unknown> = {}) =>
  ({ widget: { inline: { enabled: true, selector, ...extra } } });

describe('isUnsafeSelector', () => {
  it('refuses the document root, body and head — replace mode would delete the page', () => {
    for (const s of ['html', 'body', 'head', 'HTML', ' body ', 'html > body']) {
      expect(isUnsafeSelector(s)).toBe(true);
    }
  });

  it('allows an ordinary content selector', () => {
    expect(isUnsafeSelector('.content_home-c-hero')).toBe(false);
    expect(isUnsafeSelector('#hero-search')).toBe(false);
  });
});

describe('isStableSelector', () => {
  it('accepts an id and a single readable class', () => {
    expect(isStableSelector('#hero-search')).toBe(true);
    expect(isStableSelector('.content_home-c-hero')).toBe(true);
  });

  it('rejects a deep nth-child chain — it breaks on the next publish', () => {
    expect(isStableSelector('div > div:nth-child(2) > div:nth-child(4) > span')).toBe(false);
  });

  it('rejects builder-generated hash classes', () => {
    expect(isStableSelector('.css-1x9f3ab')).toBe(false);
    expect(isStableSelector('.w-node-a1b2c3d4e5f6-7a8b9c0d')).toBe(false);
    expect(isStableSelector('.sc-bdVaJa')).toBe(false);
  });
});

describe('resolveInlineMount refuses an unsafe mount', () => {
  it('returns null for body, whatever the mode', () => {
    expect(resolveInlineMount(mount('body', { mode: 'replace' }))).toBeNull();
    expect(resolveInlineMount(mount('html'))).toBeNull();
  });

  it('still resolves an ordinary selector', () => {
    expect(resolveInlineMount(mount('.content_home-c-hero'))!.selector).toBe('.content_home-c-hero');
  });
});
