/**
 * Facebook page scraping via ScrapeCreators (https://api.scrapecreators.com).
 *
 * Endpoints (verified against the live API on 2026-08-26 with a real page):
 *   GET /v1/facebook/profile        ?url=<page url>  -> page metadata
 *   GET /v1/facebook/profile/posts  ?url=<page url>[&cursor=x]
 *                                   -> { posts: [...], cursor }
 *   GET /v1/facebook/post           ?url=<post url>  -> full post, incl. media
 *
 * Both cost one credit per call. The posts endpoint returns THREE posts per call,
 * so a 300-post scan is ~100 calls — bounded, but worth knowing before raising a
 * limit. There is no page-size parameter; `cursor` is the only way forward.
 *
 * No Facebook Graph token is involved. This reads a public page the same way a
 * logged-out visitor does.
 */
import axios, { type AxiosInstance } from 'axios';

const API_KEY = process.env.SCRAPECREATORS_API_KEY;
const BASE_URL = process.env.SCRAPECREATORS_BASE_URL || 'https://api.scrapecreators.com';

/** Posts returned per API call. Fixed by the provider, not a request parameter. */
export const FB_POSTS_PER_CALL = 3;

export interface FacebookProfile {
  id: string;
  name?: string;
  url: string;
  intro?: string;
  category?: string;
  followers?: number;
  likes?: number;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  avatar?: string;
  coverPhoto?: string;
  creationDate?: string;
  /** e.g. "94% recommend (225 Reviews)" — kept verbatim, it is display text. */
  rating?: string;
  ratingCount?: number;
}

export interface FacebookComment {
  /** Provider comment id — stable, so re-scans update rather than duplicate. */
  id: string;
  text: string;
  author?: string;
  /** Unix seconds. */
  publishTime?: number;
}

export interface FacebookPost {
  id: string;
  url?: string;
  text: string;
  image?: string;
  reactions: number;
  comments: number;
  videoViews?: number;
  /** Unix seconds, as `publishTime` is delivered. */
  publishTime?: number;
  /** ISO string, as `creation_time` is delivered. Preferred when present. */
  createdAt?: string;
  topComments: FacebookComment[];
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
 * A page URL, a bare slug, or an '@handle' → the canonical page URL the API wants.
 * Profile ids (`profile.php?id=…`) are passed through untouched, since their slug
 * form does not exist.
 */
export function normalizeFacebookUrl(input: string): string {
  const s = (input ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    // Strip tracking/query noise but keep profile.php's id, which IS the identity.
    try {
      const u = new URL(s);
      if (u.pathname.replace(/\/$/, '').endsWith('/profile.php')) {
        const id = u.searchParams.get('id');
        return id ? `https://www.facebook.com/profile.php?id=${id}` : s;
      }
      return `https://www.facebook.com${u.pathname.replace(/\/$/, '')}`;
    } catch {
      return s;
    }
  }
  const slug = s.replace(/^@+/, '').split(/[/?#\s]/)[0].trim();
  return slug ? `https://www.facebook.com/${slug}` : '';
}

export async function getFacebookProfile(input: string): Promise<FacebookProfile | null> {
  const url = normalizeFacebookUrl(input);
  if (!url) return null;
  try {
    const { data } = await client().get('/v1/facebook/profile', { params: { url } });
    if (!data?.id) return null;
    return {
      id: String(data.id),
      name: data.name || undefined,
      url: data.url || url,
      intro: data.pageIntro || undefined,
      category: data.category || undefined,
      followers: Number(data.followerCount ?? 0) || undefined,
      likes: Number(data.likeCount ?? 0) || undefined,
      website: data.website || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      address: data.address || undefined,
      avatar: data.profilePicLarge || data.profilePicMedium || undefined,
      coverPhoto: data.coverPhoto?.photo?.image?.uri || undefined,
      creationDate: data.creationDate || undefined,
      rating: data.rating || undefined,
      ratingCount: Number(data.ratingCount ?? 0) || undefined,
    };
  } catch (e: any) {
    console.error('[facebookScraper] profile failed:', e?.message || e);
    return null;
  }
}

/** Shape one raw API post. Exported so the normalisation is testable without a network. */
export function normalizeFacebookPost(raw: any): FacebookPost | null {
  const id = raw?.id != null ? String(raw.id) : '';
  if (!id) return null;

  // topComments is present but frequently empty; a missing array is not an error.
  // Comments without an id fall back to a per-post positional id so they can still
  // be stored under the (post_id, comment_id) unique key without colliding.
  const topComments: FacebookComment[] = Array.isArray(raw?.topComments)
    ? raw.topComments
        .map((c: any, i: number) => ({
          id: String(c?.id ?? `${id}_c${i}`),
          text: String(c?.text ?? c?.body ?? '').trim(),
          author: c?.author?.name || c?.name || undefined,
          publishTime: Number(c?.publishTime ?? 0) || undefined,
        }))
        .filter((c: FacebookComment) => c.text.length > 0)
    : [];

  return {
    id,
    url: raw?.url || undefined,
    text: String(raw?.text ?? '').trim(),
    image: raw?.image || undefined,
    reactions: Number(raw?.reactionCount ?? 0) || 0,
    comments: Number(raw?.commentCount ?? 0) || 0,
    videoViews: Number(raw?.videoViewCount ?? 0) || undefined,
    publishTime: Number(raw?.publishTime ?? 0) || undefined,
    createdAt: raw?.creation_time || undefined,
    topComments,
  };
}

/**
 * Walk a page's posts until `limit` is reached or the cursor runs out.
 *
 * Stops on a page that yields no posts even when a cursor is returned — the API
 * hands back a cursor on the final page too, and following it forever would spend
 * credits on nothing.
 */
export async function getFacebookPosts(input: string, limit = 60): Promise<FacebookPost[]> {
  const url = normalizeFacebookUrl(input);
  if (!url) return [];

  const http = client();
  const out: FacebookPost[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  // Generous ceiling on top of the arithmetic: the provider occasionally returns a
  // short page, and this stops a malformed cursor from looping.
  const maxCalls = Math.ceil(limit / FB_POSTS_PER_CALL) + 10;

  for (let call = 0; call < maxCalls && out.length < limit; call++) {
    let data: any;
    try {
      ({ data } = await http.get('/v1/facebook/profile/posts', {
        params: cursor ? { url, cursor } : { url },
      }));
    } catch (e: any) {
      // One transient failure must not discard the posts already collected —
      // a 300-post walk is ~100 calls and will occasionally lose one.
      console.error(`[facebookScraper] posts call ${call} failed:`, e?.message || e);
      break;
    }

    const rawPosts: any[] = Array.isArray(data?.posts) ? data.posts : [];
    if (rawPosts.length === 0) break;

    for (const raw of rawPosts) {
      const post = normalizeFacebookPost(raw);
      if (!post || seen.has(post.id)) continue;
      seen.add(post.id);
      out.push(post);
      if (out.length >= limit) break;
    }

    cursor = data?.cursor || undefined;
    if (!cursor) break;
  }

  return out;
}

/**
 * The image for ONE post, from the single-post endpoint.
 *
 * The list endpoint returns `image: null` for a large share of posts — 137 of
 * ABA's 300 — because a link share carries its picture on the ATTACHMENT, not on
 * the post. The detail endpoint exposes `images`, `image_url`, `thumbnail`, the
 * video thumbnail and `link_attachment.image_url`; this picks the first that
 * exists, in the order a reader would consider them.
 *
 * One credit per call, so callers should only reach for it when the list gave
 * them nothing.
 */
export async function getFacebookPostImage(postUrl: string): Promise<string | null> {
  if (!postUrl) return null;
  try {
    const { data } = await client().get('/v1/facebook/post', { params: { url: postUrl } });
    const candidates = [
      Array.isArray(data?.images) ? data.images[0]?.url ?? data.images[0] : null,
      data?.image_url,
      data?.thumbnail,
      data?.video?.thumbnail,
      Array.isArray(data?.videos) ? data.videos[0]?.thumbnail : null,
      data?.link_attachment?.image_url,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.startsWith('http')) return c;
    }
    return null;
  } catch (e: any) {
    console.error('[facebookScraper] post detail failed:', e?.message || e);
    return null;
  }
}
