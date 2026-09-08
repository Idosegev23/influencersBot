/**
 * Recover a customer's website from their Instagram bio links.
 *
 * Why this exists: an account scanned from an Instagram handle alone never gets
 * a `websiteUrl`, so `site-discover` no-ops, `finalize` registers no
 * `config.widget.domain`, and the shareable demo at /demo/<id> ends up framing a
 * raw 404 JSON blob — while the scan job reports `succeeded`. 55 of 80 active
 * accounts were in that state; for 23 of them the real site was sitting in
 * `instagram_profile_history.bio_links` the whole time.
 *
 * The rule is FREQUENCY, not order. rebar's bio lists an App Store link first
 * and rebar.co.il three times after it — "take the first link" would register
 * `apple.co` as the customer's website.
 */
import { registrableDomain } from '@/lib/pipeline/apify-crawl';

export interface BioLink { url?: string | null }

/**
 * Hosts that appear in bios but are never the customer's own site. Matched on
 * the registrable domain, so `l.instagram.com` is covered by `instagram.com`.
 */
const NOT_A_CUSTOMER_SITE = new Set([
  // link aggregators
  'linktr.ee', 'linktree.com', 'beacons.ai', 'taplink.cc', 'msha.ke', 'linkin.bio',
  'campsite.bio', 'lnk.bio', 'later.com', 'shorby.com', 'solo.to', 'carrd.co',
  // app stores
  'apple.co', 'apps.apple.com', 'itunes.apple.com', 'play.google.com', 'onelink.to',
  'app.link', 'appsflyer.com', 'adjust.com',
  // social + messaging
  'instagram.com', 'facebook.com', 'fb.me', 'tiktok.com', 'youtube.com', 'youtu.be',
  'twitter.com', 'x.com', 'linkedin.com', 'pinterest.com', 'snapchat.com',
  'wa.me', 'whatsapp.com', 't.me', 'telegram.me',
  // shorteners + trackers
  'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at',
  'did.li', 'onelink.me', 'urlgeni.us', 'linkpop.com', 'short.io', 'trib.al',
  // social-suite shorteners: these belong to the agency's publishing tool, not
  // the brand. spr.ly (Sprinklr) resolved Lenovo to the shortener itself.
  'spr.ly', 'linkis.co.il', 'sprinklr.com', 'hubs.ly', 'okt.to', 'lnkd.in',
  // document/form hosts — a brand's price list on Google Docs is not its website.
  // Backfill caught ISRAEL BIDUR resolving to docs.google.com this way.
  'google.com', 'forms.gle', 'notion.site', 'canva.com', 'dropbox.com', 'wetransfer.com',
  'eventbrite.com', 'typeform.com', 'jotform.com', 'airtable.com',
  // storefront/booking aggregators that aren't the brand's own domain
  'linktr.ee', 'wolt.com', 'tabit.cloud', 'mishlohim.co.il', 'spotify.com', 'open.spotify.com',
]);

/**
 * The host to register as the customer's website, or null when the bio holds
 * nothing but aggregators. Returns the HOST (`www.bara.co.il`), not the
 * registrable domain — the spelling the brand actually links to is the one whose
 * TLS cert and redirects we know work.
 */
export function pickSiteHostFromBioLinks(links: BioLink[] | null | undefined): string | null {
  if (!Array.isArray(links) || links.length === 0) return null;

  // group (registrable domain) -> host -> count
  const groups = new Map<string, { total: number; hosts: Map<string, number> }>();

  for (const link of links) {
    const raw = typeof link?.url === 'string' ? link.url.trim() : '';
    if (!raw) continue;

    let host: string;
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      host = u.host.toLowerCase();
    } catch {
      continue; // not a URL — bios contain plain text too
    }
    if (!host) continue;

    // A host we cannot reduce to a registrable domain is either an IP or a bare
    // public suffix (`co.il`). Registering either would point the demo proxy at
    // something that is not the customer.
    const group = registrableDomain(host);
    if (!group) continue;
    if (NOT_A_CUSTOMER_SITE.has(group)) continue;

    const g = groups.get(group) ?? { total: 0, hosts: new Map<string, number>() };
    g.total += 1;
    g.hosts.set(host, (g.hosts.get(host) ?? 0) + 1);
    groups.set(group, g);
  }

  if (groups.size === 0) return null;

  // Most-linked domain wins. Map iteration is insertion-ordered, so a tie falls
  // to whichever appeared first in the bio.
  let best: { total: number; hosts: Map<string, number> } | null = null;
  for (const g of groups.values()) {
    if (!best || g.total > best.total) best = g;
  }
  if (!best) return null;

  let bestHost: string | null = null;
  let bestCount = -1;
  for (const [host, count] of best.hosts) {
    if (count > bestCount) { bestHost = host; bestCount = count; }
  }
  return bestHost;
}
