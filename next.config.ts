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
    // Headers without X-Frame-Options (for iframe-embeddable routes)
    const headersNoFrame = securityHeaders.filter(
      (h) => h.key !== 'X-Frame-Options',
    );

    return [
      {
        // All routes EXCEPT proxy and widget get X-Frame-Options: DENY
        source: '/((?!api/admin/proxy|api/widget).*)',
        headers: securityHeaders,
      },
      {
        // Proxy + widget routes: no X-Frame-Options (must be embeddable)
        source: '/api/admin/proxy',
        headers: headersNoFrame,
      },
      {
        source: '/api/widget/:path*',
        headers: headersNoFrame,
      },
    ];
  },
};

export default nextConfig;
