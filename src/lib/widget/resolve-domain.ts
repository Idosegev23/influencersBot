/**
 * The domain a demo preview should proxy — recovering it when the scan never set one.
 *
 * 55 of 80 active accounts had no `config.widget.domain`, because a scan started
 * from an Instagram handle alone never sets `state.websiteUrl`: `site-discover`
 * no-ops, `finalize` skips domain registration, and the job still reports
 * `succeeded`. The customer's real site was in their Instagram bio the whole time.
 *
 * Self-heal lives HERE and not in the public widget-config route on purpose: this
 * runs only when someone actually opens a demo preview, so an unauthenticated
 * endpoint can't be used to drive repeated outbound probes.
 */
import { createClient } from '@/lib/supabase/server';
import { pickSiteHostFromBioLinks } from '@/lib/pipeline/bio-domain';
import { registrableDomain } from '@/lib/pipeline/apify-crawl';

const PROBE_TIMEOUT_MS = 6000;

/** Does this host actually serve a page? Registering one that doesn't just moves the failure. */
async function servesAPage(host: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${host}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: {
        // Same UA the proxy itself uses — a site that answers us here is a site
        // the proxy can render. rebar.co.il 403s a default UA and 200s this one.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * The best host to preview for a bio link, or null if none responds.
 *
 * Bios link to campaign and tracking subdomains — `campaigns.mta.ac.il`,
 * `a.myofer.co.il` — which render a single landing page rather than the site a
 * prospect should be shown. So try the apex first and keep the subdomain only
 * when the apex has nothing to serve.
 */
export async function chooseReachableHost(host: string): Promise<string | null> {
  const apex = registrableDomain(host);
  const candidates = apex && apex !== host ? [apex, host] : [host];
  for (const candidate of candidates) {
    if (await servesAPage(candidate)) return candidate;
  }
  return null;
}

/**
 * Returns the registered `config.widget.domain`, or derives one from the
 * account's Instagram bio and persists it. Null when there is no site to show.
 */
export async function resolveWidgetDomain(accountId: string, cfg: any): Promise<string | null> {
  const existing = cfg?.widget?.domain;
  if (typeof existing === 'string' && existing.trim()) return existing.trim();

  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('instagram_profile_history')
      .select('bio_links')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const fromBio = pickSiteHostFromBioLinks((data as any)?.bio_links);
    if (!fromBio) return null;
    const host = await chooseReachableHost(fromBio);
    if (!host) return null;

    // Read-modify-write MERGE: config is a single jsonb column that other steps
    // also write, so a blind overwrite would drop their keys.
    const { data: fresh } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .single();
    const next: Record<string, any> = { ...((fresh as any)?.config ?? {}) };
    // Someone else may have registered a domain between our read and now.
    if (next.widget?.domain) return String(next.widget.domain);
    // ONLY widget.domain. Deliberately not `website_url`: that field is what
    // makes a future scan crawl the site, which costs money per account and is a
    // decision to take on purpose rather than as a side effect of someone opening
    // a demo link.
    next.widget = { ...(next.widget ?? {}), domain: host };
    await supabase.from('accounts').update({ config: next }).eq('id', accountId);

    return host;
  } catch {
    // Recovery is best-effort; the caller falls back to the stand-in page.
    return null;
  }
}
