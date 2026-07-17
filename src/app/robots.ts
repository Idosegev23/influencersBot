import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://bestie.ldrsgroup.com';

/**
 * Everything that is not the public marketing site is disallowed.
 *
 * These paths were previously fully crawlable: the admin console, the agent and
 * influencer dashboards, and the per-client login pages (which leak client names
 * into search results just by existing as indexable URLs).
 */
const PRIVATE_PATHS = [
  '/api/',
  '/admin',
  '/agent',
  '/influencer',
  '/internal',
  '/install',
  '/login',
  '/manage',
  '/onboard',
  '/preview',
  '/reply',
  '/feedback',
  '/sign',
  '/invoice',
  '/widget-preview',
  '/instagram',
  // Per-client surfaces — not ours to publish.
  '/argania',
  '/labeaute',
  '/studiopasha',
  '/footlocker',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
