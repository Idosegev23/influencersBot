/**
 * LinkedIn company scraping via ScrapeCreators.
 *
 * Endpoints (verified against the live API on 2026-08-27 with a real company):
 *   GET /v1/linkedin/company        ?url=<company url>  -> profile + 10 posts
 *   GET /v1/linkedin/company/posts  ?url=<company url>  -> 10 recent posts
 *
 * TWO LIMITS worth knowing before relying on this.
 *
 * 1. NO DEEP ARCHIVE. The company response carries a `paginationToken`, but
 *    passing it back returns the SAME ten posts — verified, a full overlap. So
 *    LinkedIn contributes the company profile plus roughly ten recent posts, and
 *    nothing older. It is a source of positioning and current messaging, not of
 *    history.
 *
 * 2. NO ENGAGEMENT. Posts arrive with url, id, datePublished and text — no
 *    reactions, no comments, no images. That is why `linkedin` must be excluded
 *    from engagement rankings: zero here means "not measured", and reporting it
 *    as zero interactions would libel a channel we simply cannot see.
 *
 * The company profile is the richer half — description, slogan, founding year,
 * headquarters, employee count and the `specialties` list, which for a trade
 * association names its councils and is exactly what a member asks about.
 */
import axios, { type AxiosInstance } from 'axios';

const API_KEY = process.env.SCRAPECREATORS_API_KEY;
const BASE_URL = process.env.SCRAPECREATORS_BASE_URL || 'https://api.scrapecreators.com';

export interface LinkedInCompany {
  id: string;
  name?: string;
  url: string;
  handle?: string;
  description?: string;
  slogan?: string;
  industry?: string;
  type?: string;
  size?: string;
  founded?: string | number;
  headquarters?: string;
  website?: string;
  followers?: number;
  employeeCount?: number;
  specialties: string[];
  logo?: string;
  coverImage?: string;
}

export interface LinkedInPost {
  id: string;
  url?: string;
  text: string;
  /** ISO string, as `datePublished` is delivered. */
  publishedAt?: string;
}

function client(): AxiosInstance {
  if (!API_KEY) throw new Error('SCRAPECREATORS_API_KEY is not configured');
  return axios.create({
    baseURL: BASE_URL,
    timeout: 45000,
    headers: { 'x-api-key': API_KEY },
    validateStatus: (s) => s >= 200 && s < 300,
  });
}

/**
 * A company URL, a bare slug, or an '@handle' → the canonical company URL.
 *
 * A personal profile (`/in/…`) is rejected rather than coerced: the company
 * endpoint 400s on one, and silently turning a person into a company would
 * attach the wrong organisation's content to an account.
 */
export function normalizeLinkedInUrl(input: string): string {
  const s = (input ?? '').trim();
  if (!s) return '';
  if (/linkedin\.com\/in\//i.test(s)) return '';
  const m = s.match(/linkedin\.com\/(?:company|school)\/([^/?#\s]+)/i);
  if (m) return `https://www.linkedin.com/company/${m[1]}`;
  if (/^https?:\/\//i.test(s)) return '';
  const slug = s.replace(/^@+/, '').split(/[/?#\s]/)[0].trim();
  return slug ? `https://www.linkedin.com/company/${slug}` : '';
}

/** Shape one raw post. Exported so normalisation is testable without a network. */
export function normalizeLinkedInPost(raw: any): LinkedInPost | null {
  const id = raw?.id != null ? String(raw.id) : '';
  const text = String(raw?.text ?? '').trim();
  // A LinkedIn post with no text carries nothing at all here — there is no
  // engagement to count and no image to show, so an empty one is pure noise.
  if (!id || !text) return null;
  return {
    id,
    url: raw?.url || undefined,
    text,
    publishedAt: raw?.datePublished || undefined,
  };
}

export async function getLinkedInCompany(input: string): Promise<LinkedInCompany | null> {
  const url = normalizeLinkedInUrl(input);
  if (!url) return null;
  try {
    const { data } = await client().get('/v1/linkedin/company', { params: { url } });
    if (!data?.id) return null;
    const loc = data.location || {};
    return {
      id: String(data.id),
      name: data.name || undefined,
      url: data.url || url,
      handle: data.handle || undefined,
      description: data.description || undefined,
      slogan: data.slogan || undefined,
      industry: data.industry || undefined,
      type: data.type || undefined,
      size: data.size || undefined,
      founded: data.founded || undefined,
      headquarters:
        data.headquarters || [loc.city, loc.state, loc.country].filter(Boolean).join(', ') || undefined,
      website: data.website || undefined,
      followers: Number(data.followers ?? 0) || undefined,
      employeeCount: Number(data.employeeCount ?? 0) || undefined,
      specialties: Array.isArray(data.specialties) ? data.specialties.map(String) : [],
      logo: data.logo || undefined,
      coverImage: data.coverImage || undefined,
    };
  } catch (e: any) {
    console.error('[linkedinScraper] company failed:', e?.message || e);
    return null;
  }
}

/**
 * Recent company posts. Roughly ten; see the note at the top of this file for
 * why there is no pagination loop here.
 */
export async function getLinkedInPosts(input: string): Promise<LinkedInPost[]> {
  const url = normalizeLinkedInUrl(input);
  if (!url) return [];
  try {
    const { data } = await client().get('/v1/linkedin/company/posts', { params: { url } });
    const raw: any[] = Array.isArray(data?.posts) ? data.posts : [];
    const seen = new Set<string>();
    const out: LinkedInPost[] = [];
    for (const r of raw) {
      const post = normalizeLinkedInPost(r);
      if (!post || seen.has(post.id)) continue;
      seen.add(post.id);
      out.push(post);
    }
    return out;
  } catch (e: any) {
    console.error('[linkedinScraper] posts failed:', e?.message || e);
    return [];
  }
}
