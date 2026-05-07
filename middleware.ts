import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'node:crypto';

/**
 * Simple in-memory rate limiter for middleware
 * Note: This resets on cold start, which provides basic protection
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configs
const RATE_LIMITS = {
  chat: { windowMs: 60 * 1000, maxRequests: 100 },
  admin: { windowMs: 60 * 1000, maxRequests: 20 },
  auth: { windowMs: 60 * 1000, maxRequests: 50 },
  influencer: { windowMs: 60 * 1000, maxRequests: 200 }, // High limit for dashboard
  widget: { windowMs: 60 * 1000, maxRequests: 200 }, // Public widget — needs high limit
};

function getClientIP(request: NextRequest): string {
  // Try various headers for client IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  // Fallback
  return 'unknown';
}

function checkRateLimit(
  key: string,
  config: { windowMs: number; maxRequests: number }
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  
  // Cleanup old entries
  if (rateLimitStore.size > 10000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < now) {
        rateLimitStore.delete(k);
      }
    }
  }
  
  // No entry or expired
  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return { success: true, remaining: config.maxRequests - 1 };
  }
  
  // Check limit
  if (entry.count >= config.maxRequests) {
    return { success: false, remaining: 0 };
  }
  
  entry.count++;
  return { success: true, remaining: config.maxRequests - entry.count };
}

const ATTR_COOKIE = 'ldrs_attr';
const ATTR_COOKIE_TTL_SEC = 90 * 24 * 60 * 60;
const ATTR_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'ttclid',
] as const;

const RESERVED_PATHS = new Set([
  'admin',
  'api',
  'auth',
  'bestieai',
  'dashboard',
  'influencer',
  'login',
  'logout',
  'privacy',
  'support',
  'terms',
  '_next',
  'icons',
  'fonts',
  'images',
]);

function isChatSurfacePath(pathname: string): boolean {
  if (!pathname.startsWith('/')) return false;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return false;
  const first = segments[0];
  if (RESERVED_PATHS.has(first)) return false;
  if (first.includes('.')) return false;
  return true;
}

function signAttrPayload(payload: string): string {
  const secret =
    process.env.ANALYTICS_WIDGET_SECRET ||
    process.env.IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function maybeWriteAttributionCookie(request: NextRequest, response: NextResponse): void {
  if (request.cookies.get(ATTR_COOKIE)) return;
  const url = request.nextUrl;
  const captured: Record<string, string> = {};
  for (const key of ATTR_PARAMS) {
    const v = url.searchParams.get(key);
    if (v) captured[key] = v.slice(0, 200);
  }
  const referer = request.headers.get('referer') || '';
  let referrerHost = '';
  if (referer) {
    try {
      referrerHost = new URL(referer).host;
    } catch {
      /* ignore */
    }
  }
  const hasAttribution = Object.keys(captured).length > 0 || referrerHost;
  if (!hasAttribution) return;

  const payload = {
    ...captured,
    referrer_host: referrerHost || undefined,
    landing_path: url.pathname,
    arrival_at: new Date().toISOString(),
  };
  const payloadStr = JSON.stringify(payload);
  const sig = signAttrPayload(payloadStr);
  if (!sig) return;
  const cookieValue = `${Buffer.from(payloadStr).toString('base64url')}.${sig}`;

  response.cookies.set(ATTR_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ATTR_COOKIE_TTL_SEC,
  });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getClientIP(request);

  // Page-level attribution capture: write a signed cookie on first visit
  // to a chat surface so /api/track/visit can persist UTM/gclid/referrer
  // server-side, bypassing adblockers that target client-side trackers.
  if (!pathname.startsWith('/api/') && isChatSurfacePath(pathname)) {
    const response = NextResponse.next();
    maybeWriteAttributionCookie(request, response);
    return response;
  }

  // Rate limit API routes
  if (pathname.startsWith('/api/')) {
    let config = RATE_LIMITS.admin;
    let prefix = 'api';
    
    // Different limits for different endpoints
    if (pathname.startsWith('/api/widget')) {
      config = RATE_LIMITS.widget;
      prefix = 'widget';
    } else if (pathname.startsWith('/api/chat')) {
      config = RATE_LIMITS.chat;
      prefix = 'chat';
    } else if (pathname.includes('/auth')) {
      config = RATE_LIMITS.auth;
      prefix = 'auth';
    } else if (pathname.startsWith('/api/influencer/')) {
      config = RATE_LIMITS.influencer;
      prefix = 'influencer';
    }
    
    const key = `${prefix}:${ip}`;
    const result = checkRateLimit(key, config);
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { 
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Remaining': '0',
          }
        }
      );
    }
    
    // Add rate limit headers to response
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    return response;
  }
  
  // Pass through for non-API routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match API routes for rate limiting
    '/api/:path*',
    // Skip static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
