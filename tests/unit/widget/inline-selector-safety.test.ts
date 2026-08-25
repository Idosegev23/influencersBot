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

  it('refuses a selector list with a dangerous member anywhere in it — a list resolves to the first DOCUMENT-ORDER match across every member, not the first member written, and body precedes nearly everything', () => {
    expect(isUnsafeSelector('body,.foo')).toBe(true);
    expect(isUnsafeSelector('body, .foo')).toBe(true);
  });

  it('refuses a pseudo-class filter on body — it narrows the match, it does not retarget it', () => {
    expect(isUnsafeSelector('body:not(.x)')).toBe(true);
  });

  it('allows an attribute filter whose value happens to contain the word "body"', () => {
    expect(isUnsafeSelector('div[data-x="body"]')).toBe(false);
  });

  it('allows a class or id that merely starts with "body"', () => {
    expect(isUnsafeSelector('.body-content')).toBe(false);
    expect(isUnsafeSelector('body-content')).toBe(false);
  });

  it('fails safe on a descendant chain ending in a bare body — not a real mount anyone wants, refused anyway', () => {
    expect(isUnsafeSelector('#hero body')).toBe(true);
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
