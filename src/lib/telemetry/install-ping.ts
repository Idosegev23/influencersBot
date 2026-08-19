/**
 * Install-ping recorder.
 *
 * /api/widget/config receives the real Origin of every site embedding us and,
 * until now, threw it away. That header is the cheapest and most reliable proof
 * that a customer actually pasted the snippet — and unlike widget_events it does
 * not depend on ANALYTICS_WIDGET_SECRET being set, the env var whose absence
 * once caused a total widget-analytics blackout.
 */

import { redisSetNx, isRedisAvailable } from '@/lib/redis';
import { supabase } from '@/lib/supabase';

/** Scheme + lowercased host, or null when no usable origin exists. */
export function normalizeOrigin(
  originHeader: string | null,
  refererHeader: string | null,
): string | null {
  const candidate = originHeader && originHeader !== 'null' && originHeader !== '*'
    ? originHeader
    : refererHeader;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host.toLowerCase()}`;
  } catch {
    return null;
  }
}

function cleanPath(p: string | null): string | null {
  if (!p) return null;
  return p.split('?')[0].slice(0, 512);
}

// Fix 3 (whole-branch review, 2026-08-19): our own preview/demo/editor
// surfaces load the REAL public/widget.js against a REAL data-account-id —
// that's the whole point of them (single source of truth, no reimplemented
// drift-prone copy). But that means every one of them also hits
// /api/widget/config exactly like a genuine embed does, manufacturing install
// evidence for an account nobody actually installed anything on. Verified in
// production: /api/widget/preview/[accountId] and /widget-preview pings
// landed in install_pings with sample_path starting with those routes.
//
// Two independent, ORed signals are enough to catch every known surface
// (/api/widget/preview/[accountId], /widget-preview, /demo/[id],
// /admin/websites/[id]/preview, and the manage/[token] widget editor iframe):
//
//   1. the ping's own normalized origin equals the origin that served THIS
//      /api/widget/config request. Every preview surface loads widget.js via
//      `${window.location.origin}/widget.js` or `req.nextUrl.origin` — i.e.
//      our own app loading its own script against itself — so the resulting
//      Origin/Referer host is necessarily wherever the CURRENT deployment is
//      being served from (localhost:3001 in dev, a Vercel preview domain, or
//      whatever hostname/alias admin is using in prod — even a customer-
//      branded alias like bestie.ldrsgroup.com, which is exactly why this
//      check is self-referential instead of a hardcoded allowlist). A real
//      customer's storefront origin can never equal the origin serving our
//      own Next.js app.
//   2. the referer PATH starts with one of our known preview routes. This
//      catches the one case signal 1 can legitimately miss: the widget
//      preview PROXY (/api/widget/preview/[accountId]) fetches the
//      customer's real site and injects widget.js into it — so the
//      config-fetching browser tab's location is our proxy path, but nothing
//      stops a future surface built the same way from putting the widget on
//      a different visible origin. Path match is a cheap, reliable backstop.
const PREVIEW_PATH_PREFIXES = ['/api/widget/preview', '/widget-preview', '/demo/', '/admin/'];

function isPreviewSurface(path: string | null): boolean {
  if (!path) return false;
  return PREVIEW_PATH_PREFIXES.some((p) => path.startsWith(p));
}

export async function recordInstallPing(input: {
  accountId: string;
  origin: string | null;
  referer: string | null;
  path: string | null;
  widgetVersion: string | null;
  /** Origin serving THIS /api/widget/config request (req.nextUrl.origin). */
  requestOrigin?: string | null;
}): Promise<'written' | 'deduped' | 'skipped'> {
  const origin = normalizeOrigin(input.origin, input.referer);
  if (!origin) return 'skipped';

  if (input.requestOrigin && origin === normalizeOrigin(input.requestOrigin, null)) {
    return 'skipped';
  }
  if (isPreviewSurface(input.path)) return 'skipped';

  // One write per account+origin per minute. redisSetNx returns false BOTH when
  // the key exists AND when Redis is unavailable, so we must ask isRedisAvailable()
  // to tell those apart — otherwise a Redis outage silently disables install
  // detection. The upsert is idempotent on (account_id, origin, day), so writing
  // during an outage costs volume, never correctness.
  const minute = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  const claimed = await redisSetNx(`wping:${input.accountId}:${origin}:${minute}`, '1', 60);
  if (!claimed && isRedisAvailable()) return 'deduped';

  try {
    const { error } = await supabase.rpc('upsert_install_ping', {
      p_account_id: input.accountId,
      p_origin: origin,
      p_widget_version: input.widgetVersion,
      p_sample_path: cleanPath(input.path),
    });
    if (error) {
      console.error('[install-ping] upsert failed:', error.message);
      return 'skipped';
    }
    return 'written';
  } catch (e: any) {
    console.error('[install-ping] upsert threw:', e?.message);
    return 'skipped';
  }
}
