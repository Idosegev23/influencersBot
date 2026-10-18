/**
 * X (Twitter) scraping via ScrapeCreators.
 *
 * Endpoints (verified against the live API on 2026-10-18 with @GoDomRep):
 *   GET /v1/twitter/profile     ?handle=x  -> user object (core, legacy, location, avatar)
 *   GET /v1/twitter/user-tweets ?handle=x  -> { tweets: [...] }  (1 credit each)
 *
 * ONE LIMIT worth knowing before relying on this. The tweets endpoint is NOT a
 * timeline. The provider documents that X "publicly only returns 100 of a user's
 * most popular tweets", there is no cursor, and the live sample for @GoDomRep
 * spans 2015 to 2023. So X contributes the account's best-performing messaging
 * and its profile, never what it posted last week. That makes the sample biased
 * toward winners — see NO_ENGAGEMENT_DATA in insights/deterministic.ts for why
 * it is kept out of timing and cross-platform comparisons.
 */
import axios, { type AxiosInstance } from 'axios';

const API_KEY = process.env.SCRAPECREATORS_API_KEY;
const BASE_URL = process.env.SCRAPECREATORS_BASE_URL || 'https://api.scrapecreators.com';

export interface TwitterProfile {
  id: string;
  handle: string;
  name?: string;
  description?: string;
  location?: string;
  url?: string;
  followers?: number;
  tweetCount?: number;
  avatar?: string;
  createdAt?: string;
}

export interface Tweet {
  id: string;
  url: string;
  text: string;
  createdAt?: string;
  likes: number;
  replies: number;
  retweets: number;
  quotes: number;
  views?: number;
  /** Direct image urls (pbs.twimg.com) — permanent, unlike Instagram's signed CDN urls. */
  images: string[];
  hasVideo: boolean;
}

function client(): AxiosInstance {
  if (!API_KEY) throw new Error('SCRAPECREATORS_API_KEY is not configured');
  return axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'x-api-key': API_KEY },
    validateStatus: (s) => s >= 200 && s < 300,
  });
}

/** '@handle', x.com/handle, twitter.com/handle/status/..., or a bare handle → the bare handle. */
export function normalizeTwitterHandle(input: string): string {
  let s = (input ?? '').trim();
  const m = s.match(/(?:x|twitter)\.com\/@?([^/?#\s]+)/i);
  if (m) s = m[1];
  return s.replace(/^@+/, '').split(/[/?#\s]/)[0].trim();
}

export async function getTwitterProfile(handle: string): Promise<TwitterProfile | null> {
  try {
    const h = normalizeTwitterHandle(handle);
    const { data } = await client().get('/v1/twitter/profile', { params: { handle: h } });
    const id = data?.rest_id || data?.id;
    if (!id) return null;
    const legacy = data?.legacy || {};
    return {
      id: String(id),
      handle: legacy.screen_name || data?.core?.screen_name || h,
      name: legacy.name || data?.core?.name,
      description: legacy.description || undefined,
      location: data?.location?.location || undefined,
      url: legacy.entities?.url?.urls?.[0]?.expanded_url || undefined,
      followers: Number(legacy.followers_count ?? 0) || undefined,
      tweetCount: Number(legacy.statuses_count ?? 0) || undefined,
      avatar: data?.avatar?.image_url?.replace('_normal.', '_400x400.'),
      createdAt: legacy.created_at,
    };
  } catch {
    return null;
  }
}

/** t.co links carry no information in a caption, and the media ones trail the text. */
export function cleanTweetText(text: string): string {
  return (text || '')
    .replace(/https?:\/\/t\.co\/\w+/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** X's `created_at` ("Thu Jun 04 21:30:38 +0000 2015") is not ISO; Date.parse reads it. */
export function tweetDateToIso(createdAt?: string): string | undefined {
  if (!createdAt) return undefined;
  const ms = Date.parse(createdAt);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

export function parseTweet(raw: any): Tweet | null {
  const legacy = raw?.legacy;
  const id = raw?.rest_id || legacy?.id_str;
  if (!legacy || !id) return null;
  // A retweet's text is the "RT @x:" stub — the original is someone else's words.
  if (legacy.retweeted_status_result) return null;
  const media: any[] = legacy.extended_entities?.media || legacy.entities?.media || [];
  const handle = raw?.core?.user_results?.result?.legacy?.screen_name || raw?.core?.user_results?.result?.core?.screen_name;
  const views = Number(raw?.views?.count);
  return {
    id: String(id),
    url: raw.url || (handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/status/${id}`),
    text: cleanTweetText(legacy.full_text || ''),
    createdAt: tweetDateToIso(legacy.created_at),
    likes: Number(legacy.favorite_count) || 0,
    replies: Number(legacy.reply_count) || 0,
    retweets: Number(legacy.retweet_count) || 0,
    quotes: Number(legacy.quote_count) || 0,
    views: Number.isFinite(views) ? views : undefined,
    images: media.filter((m) => m?.type === 'photo' && m.media_url_https).map((m) => m.media_url_https as string),
    hasVideo: media.some((m) => m?.type === 'video' || m?.type === 'animated_gif'),
  };
}

export async function getTwitterTweets(handle: string, limit = 100): Promise<Tweet[]> {
  try {
    const { data } = await client().get('/v1/twitter/user-tweets', { params: { handle: normalizeTwitterHandle(handle) } });
    const list: any[] = data?.tweets || [];
    return list
      .map(parseTweet)
      .filter((t): t is Tweet => !!t && (t.text.length > 0 || t.images.length > 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}
