import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: 'scontent.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: 'scontent-*.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: 'instagram.*.fbcdn.net',
      },
      {
        protocol: 'https',
        hostname: '*.fbcdn.net',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  async headers() {
    // Security headers WITHOUT X-Frame-Options (for embeddable routes)
    const headersWithoutFrame = securityHeaders.filter(
      (h) => h.key !== 'X-Frame-Options',
    );

    return [
      {
        // Widget + proxy routes: allow iframe embedding
        source: '/api/widget/:path*',
        headers: headersWithoutFrame,
      },
      {
        source: '/api/admin/proxy',
        headers: headersWithoutFrame,
      },
      {
        // Static blob animation: allow self-embedding
        source: '/blob-animation.html',
        headers: headersWithoutFrame,
      },
      {
        // Manage routes: allow iframe embedding (live preview)
        source: '/manage/:path*',
        headers: headersWithoutFrame,
      },
      {
        // All other routes: full security headers including X-Frame-Options
        source: '/((?!api/widget|api/admin/proxy|blob-animation|manage|widget-preview).*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
