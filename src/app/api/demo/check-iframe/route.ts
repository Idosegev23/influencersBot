/**
 * Check if a website allows being embedded in an iframe.
 * GET /api/demo/check-iframe?url=https://example.com
 * Returns { frameable: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url');
  if (!targetUrl) {
    return NextResponse.json({ frameable: false });
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    const xfo = res.headers.get('x-frame-options')?.toLowerCase() || '';
    const csp = res.headers.get('content-security-policy')?.toLowerCase() || '';

    // Blocked if X-Frame-Options is DENY or SAMEORIGIN
    if (xfo.includes('deny') || xfo.includes('sameorigin')) {
      return NextResponse.json({ frameable: false });
    }

    // Blocked if CSP frame-ancestors doesn't allow us
    if (csp.includes('frame-ancestors') && !csp.includes('frame-ancestors *')) {
      return NextResponse.json({ frameable: false });
    }

    return NextResponse.json({ frameable: true });
  } catch {
    return NextResponse.json({ frameable: false });
  }
}
