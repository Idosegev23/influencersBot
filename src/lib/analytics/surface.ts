/**
 * Which analytics surface a pathname belongs to.
 *
 * The tracker used to mount on EVERY route from the root layout, so gtag /
 * Meta / TikTok fired on admin dashboards and — worse — on the token pages
 * (/sign/<token>, /invoice/<token>, …), shipping the secret token to Google
 * and the ad networks inside current_path / route_change.to_path.
 *
 * This is an ALLOWLIST: only the public marketing site and the public account
 * chat get analytics. Anything unlisted — admin, dashboards, and every
 * [token] route — resolves to 'none' and gets no tracker at all. A new route
 * added later defaults to 'none' (no silent leak); opt it in explicitly here.
 */

export type AnalyticsSurface = 'marketing' | 'chat' | 'none';

/** Public marketing routes (exact match, trailing slash ignored). */
const MARKETING_EXACT = new Set([
  '/',
  '/contact',
  '/privacy',
  '/terms',
  '/data-deletion',
  '/onboarding-guide',
  '/install',
]);

/** Public marketing route trees (prefix match). */
const MARKETING_PREFIXES = ['/demo'];

/** Token-bearing routes whose dynamic segment is a secret credential. */
const SECRET_ROUTE_PREFIXES = ['/sign', '/invoice', '/onboard', '/reply', '/feedback'];

function normalize(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

export function analyticsSurface(pathname: string | null | undefined): AnalyticsSurface {
  if (!pathname) return 'none';
  const path = normalize(pathname);
  if (MARKETING_EXACT.has(path)) return 'marketing';
  if (MARKETING_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) return 'marketing';
  if (path === '/chat' || path.startsWith('/chat/')) return 'chat';
  return 'none';
}

/**
 * Defense-in-depth: redact the secret segment from a path before it is put on
 * an analytics event. The surface gate already blocks tracking on these routes,
 * but if a path ever reaches an event anyway, the token must not travel with it.
 * `/sign/abc123` → `/sign/[redacted]`; every other path is returned unchanged.
 */
export function sanitizeTrackedPath(path: string | null | undefined): string {
  if (!path) return '';
  const bare = path.split('?')[0].split('#')[0];
  for (const pref of SECRET_ROUTE_PREFIXES) {
    if (bare === pref || bare.startsWith(pref + '/')) return `${pref}/[redacted]`;
  }
  return path;
}
