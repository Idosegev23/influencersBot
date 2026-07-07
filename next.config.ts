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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://va.vercel-scripts.com https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://analytics.tiktok.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://generativelanguage.googleapis.com https://vercel.live https://vitals.vercel-insights.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.facebook.com https://analytics.tiktok.com https://*.tiktok.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    // Skip Vercel image optimization: our /api/image-proxy already caches
    // Instagram URLs (max-age=86400), and Vercel's optimizer rejects
    // internal API routes with query strings (INVALID_IMAGE_OPTIMIZE_REQUEST).
    unoptimized: true,
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

    // Same-origin framing only — our /sign page embeds the quote PDF from the same
    // origin (/api/signatures/:token/document). Third parties still can't frame it.
    const sameOriginFrameHeaders = securityHeaders
      .filter((h) => h.key !== 'X-Frame-Options')
      .map((h) =>
        h.key === 'Content-Security-Policy'
          ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") }
          : h,
      )
      .concat([{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }]);

    // Permissive CSP for the preview proxy ONLY — the proxied HTML is the
    // customer's actual site and loads scripts/CSS/fonts/images from many
    // third-party CDNs (Shopify, Cloudflare, Google Fonts, …). Locking it to
    // 'self' would break visual rendering. This iframe is shown ONLY inside
    // our admin panel to authenticated admins.
    const previewProxyHeaders = headersWithoutFrame.map((h) =>
      h.key === 'Content-Security-Policy'
        ? {
          ...h,
          value:
            "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; " +
            "script-src * 'unsafe-inline' 'unsafe-eval'; " +
            "style-src * 'unsafe-inline'; " +
            "img-src * data: blob:; " +
            "font-src * data:; " +
            "connect-src *; " +
            "frame-ancestors *;",
        }
        : h,
    );

    return [
      {
        // Widget + proxy routes: allow iframe embedding
        source: '/api/widget/:path*',
        headers: headersWithoutFrame,
      },
      {
        // Preview proxy override: must come AFTER /api/widget/:path* so its
        // permissive CSP replaces the restrictive one (Next.js applies all
        // matching rules in order; later headers with same key win).
        source: '/api/widget/preview/:path*',
        headers: previewProxyHeaders,
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
        // Signature document PDF is framed by our own /sign page (same-origin).
        source: '/api/signatures/:path*',
        headers: sameOriginFrameHeaders,
      },
      {
        // All other routes: full security headers including X-Frame-Options
        source: '/((?!api/widget|api/admin/proxy|blob-animation|manage|widget-preview|api/signatures).*)',
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
        // Widget JS — must revalidate every load. We ship behavior changes
        // frequently and the script lives on third-party customer sites where
        // we have no other invalidation lever. Browsers send conditional
        // requests (If-Modified-Since) on every page load; CDN responds 304
        // when unchanged so this isn't actually expensive.
        source: '/widget.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
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
