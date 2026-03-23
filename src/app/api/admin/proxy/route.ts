/**
 * Website Proxy — Fetches a website server-side and strips frame-blocking headers.
 * Used by the preview page to show client websites in an iframe.
 * GET /api/admin/proxy?url=https://example.com
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'bestieai_admin_session';

async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  return session?.value === 'authenticated';
}

export async function GET(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetUrl = req.nextUrl.searchParams.get('url');
  if (!targetUrl) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Referer': parsed.origin + '/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      // Return a styled fallback page instead of raw error text
      return new Response(
        `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a12;font-family:'Heebo',system-ui,sans-serif;direction:rtl;">
          <div style="text-align:center;color:rgba(255,255,255,0.4);">
            <div style="font-size:48px;margin-bottom:12px;">🌐</div>
            <p style="font-size:16px;margin:0;">האתר לא זמין לתצוגה מקדימה</p>
            <p style="font-size:13px;margin-top:6px;color:rgba(255,255,255,0.2);">הווידג׳ט עדיין פעיל באתר עצמו</p>
          </div>
        </body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      // Non-HTML (CSS, JS, images) — pipe through as-is
      return new Response(response.body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    let html = await response.text();

    // Inject <base> tag so relative URLs resolve to the original domain
    const baseOrigin = parsed.origin;
    const basePath = targetUrl.endsWith('/') ? targetUrl : targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1) || baseOrigin + '/';
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
        'Cache-Control': 'no-cache',
        // Explicitly NOT setting X-Frame-Options or CSP frame-ancestors
      },
    });
  } catch (error: any) {
    console.error('[Proxy] Error:', error.message);
    return new Response(
      `<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;direction:rtl;"><p>לא ניתן לטעון את האתר: ${error.message}</p></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}
