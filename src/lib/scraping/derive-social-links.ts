/**
 * deriveSocialLinks — map scraped profile URLs (bio links + external_url) to
 * the widget's `config.widget.socialLinks` shape. Pure + deterministic so it's
 * unit-testable and safe to call from the scan orchestrator.
 */
export interface SocialLink {
  platform: string;
  url: string;
}

const PATTERNS: { platform: string; re: RegExp }[] = [
  { platform: 'instagram', re: /instagram\.com\//i },
  { platform: 'facebook', re: /(facebook|fb)\.com\//i },
  { platform: 'tiktok', re: /tiktok\.com\//i },
  { platform: 'youtube', re: /(youtube\.com|youtu\.be)\//i },
];

/**
 * Maps a list of URLs to known social platforms (first match per platform
 * wins), dropping non-http(s) values. If `instagramUsername` is given and no
 * Instagram link was found, the profile's own IG URL is prepended.
 */
export function deriveSocialLinks(
  urls: (string | null | undefined)[],
  instagramUsername?: string | null,
): SocialLink[] {
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    for (const p of PATTERNS) {
      if (p.re.test(url) && !seen.has(p.platform)) {
        seen.add(p.platform);
        out.push({ platform: p.platform, url });
      }
    }
  }
  // Ensure the IG profile itself is present when we know the handle.
  if (instagramUsername && !seen.has('instagram')) {
    out.unshift({
      platform: 'instagram',
      url: 'https://instagram.com/' + String(instagramUsername).replace(/^@/, ''),
    });
  }
  return out;
}
