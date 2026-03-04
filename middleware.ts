import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getClientIP(request);
  
  // Rate limit API routes
  if (pathname.startsWith('/api/')) {
    let config = RATE_LIMITS.admin;
    let prefix = 'api';
    
    // Different limits for different endpoints
    if (pathname.startsWith('/api/chat')) {
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
