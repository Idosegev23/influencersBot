import { describe, it, expect } from 'vitest';
import { isBlockingHeader, filterUpstreamHeaders } from '@/lib/widget/preview-headers';

describe('preview proxy header filtering', () => {
  // The incident: rebar.co.il is a Next.js site and answers with
  // `x-middleware-rewrite: /he`. The proxy echoed it, our own Next.js runtime
  // read it as a routing directive, and the demo link 500'd with
  // "NextResponse.rewrite() was used in a app route handler".
  it('drops framework routing headers from the customer site', () => {
    expect(isBlockingHeader('x-middleware-rewrite')).toBe(true);
    expect(isBlockingHeader('X-Middleware-Next')).toBe(true);
    expect(isBlockingHeader('x-nextjs-cache')).toBe(true);
    expect(isBlockingHeader('x-nextjs-matched-path')).toBe(true);
  });

  it('drops framing headers so the iframe can render at all', () => {
    expect(isBlockingHeader('X-Frame-Options')).toBe(true);
    expect(isBlockingHeader('content-security-policy')).toBe(true);
  });

  it('drops transport headers that would corrupt the mutated body', () => {
    expect(isBlockingHeader('Content-Encoding')).toBe(true);
    expect(isBlockingHeader('content-length')).toBe(true);
    expect(isBlockingHeader('transfer-encoding')).toBe(true);
  });

  it('does not set the customer site cookies on our own origin', () => {
    expect(isBlockingHeader('Set-Cookie')).toBe(true);
  });

  it('keeps ordinary headers — the filter must not strip everything', () => {
    // Presence assertion beside the drops above: a filter that blocked every
    // header would satisfy all of them and still be wrong.
    expect(isBlockingHeader('content-type')).toBe(false);
    expect(isBlockingHeader('date')).toBe(false);
    expect(isBlockingHeader('etag')).toBe(false);
    expect(isBlockingHeader('x-custom-brand-header')).toBe(false);
  });

  it('filters a real upstream header set end to end', () => {
    const src = new Headers({
      'content-type': 'text/html; charset=utf-8',
      'x-middleware-rewrite': '/he',
      'x-nextjs-cache': 'HIT',
      'content-encoding': 'gzip',
      'x-frame-options': 'SAMEORIGIN',
      etag: 'W/"abc"',
    });
    const out = filterUpstreamHeaders(src);
    expect(out.get('content-type')).toBe('text/html; charset=utf-8');
    expect(out.get('etag')).toBe('W/"abc"');
    expect(out.get('x-middleware-rewrite')).toBeNull();
    expect(out.get('x-nextjs-cache')).toBeNull();
    expect(out.get('content-encoding')).toBeNull();
    expect(out.get('x-frame-options')).toBeNull();
  });
});
