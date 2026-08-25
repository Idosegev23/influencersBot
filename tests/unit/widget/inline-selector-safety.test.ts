import { describe, it, expect } from 'vitest';
import { resolveInlineMount, isStableSelector, isUnsafeSelector } from '@/lib/widget/inline';

const mount = (selector: string, extra: Record<string, unknown> = {}) =>
  ({ widget: { inline: { enabled: true, selector, ...extra } } });

describe('isUnsafeSelector', () => {
  // A blocklist of dangerous spellings is unwinnable — there are unbounded
  // ways to write a selector that resolves to <body> or <html>, and a
  // string-level parser keeps missing new ones (two rounds of patching
  // individual bypasses proved it). So this checks a GRAMMAR instead: the
  // picker only ever emits an id or a short class chain, so that is the
  // whole shape we accept. Everything outside that shape is refused,
  // including every adversarial spelling below — not because each one was
  // special-cased, but because none of them are an id or a class chain.
  it('refuses every selector that resolves to <body> or <html>, however it is spelled', () => {
    const dangerous = [
      'html',
      'body',
      'head',
      'HTML',
      ' body ',
      'html > body',
      '*',
      ':root',
      ':is(body)',
      ':where(body)',
      ':has(body)',
      ':has(> body)',
      ':is(body, .foo)',
      'body[title="a b"]',
      'body,.foo',
      'body, .foo',
      'body:not(.x)',
      'div[data-x="body"]',
    ];
    for (const s of dangerous) {
      expect(isUnsafeSelector(s)).toBe(true);
    }
  });

  it('refuses a hand-written combinator chain — not because it is dangerous, but because it is outside the id/class-chain grammar the picker emits', () => {
    expect(isUnsafeSelector('section.hero > div')).toBe(true);
    expect(isUnsafeSelector('#a b')).toBe(true);
  });

  it('refuses an empty string and an oversized garbage string', () => {
    expect(isUnsafeSelector('')).toBe(true);
    expect(isUnsafeSelector('x'.repeat(300))).toBe(true);
  });

  it('allows an id or a short chain of one to three classes — the exact grammar the picker emits', () => {
    expect(isUnsafeSelector('#hero-search')).toBe(false);
    expect(isUnsafeSelector('.content_home-c-hero')).toBe(false);
    expect(isUnsafeSelector('.a.b')).toBe(false);
    expect(isUnsafeSelector('.a.b.c')).toBe(false);
  });

  it('is a grammar check, not the safety guarantee — a class that happens to sit on <body> passes here and is caught at mount time instead, by inlineTargetIsSafe in public/widget.js comparing real element identity', () => {
    // `<body class="page">` plus `.page` is exactly this case: shaped like an
    // ordinary content class, indistinguishable from one at the string level.
    expect(isUnsafeSelector('.page')).toBe(false);
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
