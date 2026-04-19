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
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://generativelanguage.googleapis.com https://vercel.live",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      // Instagram CDN — use ** for nested subdomains (scontent-lga3-2.cdninstagram.com, instagram.fmia1-1.fbcdn.net)
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: '**.fna.fbcdn.net' },
      // Supabase Storage
      { protocol: 'https', hostname: '**.supabase.co' },
      // Product images (Argania widget)
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'media.my-quickshop.com' },
      // Recipe / website scraping
      { protocol: 'https', hostname: '**.cloudfront.net' },
      // Misc
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn-icons-png.freepik.com' },
      { protocol: 'https', hostname: 'avatar.vercel.sh' },
    ],
  },
  async headers() {
    // Security headers WITHOUT X-Frame-Options and with relaxed CSP (for embeddable routes)
    const headersWithoutFrame = securityHeaders
      .filter((h) => h.key !== 'X-Frame-Options')
      .map((h) =>
        h.key === 'Content-Security-Policy'
          ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors *") }
          : h,
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
      {
        // Static assets: long-lived cache (icons, SVGs, images in public/)
        source: '/icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Fonts
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
