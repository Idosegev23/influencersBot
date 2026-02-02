import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit';

export function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             '127.0.0.1';

  // Skip rate limiting for scraping endpoints (they have long-running jobs with frequent polling)
  if (request.nextUrl.pathname.startsWith('/api/scraping/')) {
    return NextResponse.next();
  }

  // Rate limit chat API
  if (request.nextUrl.pathname.startsWith('/api/chat')) {
    const key = getRateLimitKey(ip, 'chat');
    const result = checkRateLimit(key, RATE_LIMITS.chat);
    
    if (!result.success) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetTime.toString(),
          },
        }
      );
    }
  }

  // Rate limit admin API
  if (request.nextUrl.pathname.startsWith('/api/admin')) {
    const key = getRateLimitKey(ip, 'admin');
    const result = checkRateLimit(key, RATE_LIMITS.admin);
    
    if (!result.success) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetTime.toString(),
          },
        }
      );
    }
  }

  // Rate limit auth endpoints more strictly
  if (request.nextUrl.pathname.includes('/auth')) {
    const key = getRateLimitKey(ip, 'auth');
    const result = checkRateLimit(key, RATE_LIMITS.auth);
    
    if (!result.success) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many login attempts. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetTime.toString(),
          },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/chat/:path*',
    '/api/admin/:path*',
    '/api/influencer/:path*',
    // Note: /api/scraping/* is intentionally excluded from rate limiting
    // to allow frequent polling during long-running scraping jobs
  ],
};








