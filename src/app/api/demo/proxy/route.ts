/**
 * Public Website Proxy — Fetches a website and strips frame-blocking headers.
 * Used by the demo page to show client websites in an iframe.
 * GET /api/demo/proxy?url=https://example.com
 *
 * No auth required — this is for public demo links shared with clients.
 * Limited to widget-enabled accounts' domains only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Cache allowed domains for 5 minutes
let cachedDomains: Set<string> | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getAllowedDomains(): Promise<Set<string>> {
  if (cachedDomains && Date.now() - cacheTime < CACHE_TTL) {
    return cachedDomains;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('accounts')
    .select('config')
    .eq('status', 'active')
    .not('config->widget', 'is', null);

  const domains = new Set<string>();
  for (const account of data || []) {
    const domain = account.config?.widget?.domain;
    if (domain) {
      // Store both with and without www
      domains.add(domain.replace(/^www\./, ''));
      domains.add(domain);
    }
  }

  cachedDomains = domains;
  cacheTime = Date.now();
  return domains;
}

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url');
  if (!targetUrl) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Only allow proxying widget-enabled domains
    const allowed = await getAllowedDomains();
    const hostname = parsed.hostname.replace(/^www\./, '');
    if (!allowed.has(hostname) && !allowed.has(parsed.hostname)) {
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return new Response(`Failed to fetch: ${response.status}`, { status: 502 });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return new Response(response.body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    let html = await response.text();

    // Inject <base> tag so relative URLs resolve to the original domain
    const basePath = targetUrl.endsWith('/') ? targetUrl : targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1) || parsed.origin + '/';
    const baseTag = `<base href="${basePath}">`;

    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
    } else {
      html = baseTag + html;
    }

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error: any) {
    console.error('[Demo Proxy] Error:', error.message);
    return new Response(
      `<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;direction:rtl;"><p>לא ניתן לטעון את האתר</p></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}
