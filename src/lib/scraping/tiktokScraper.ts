/**
 * TikTok scraping via ScrapeCreators (https://api.scrapecreators.com).
 * Endpoints (verified against the live API):
 *   GET /v1/tiktok/profile          ?handle=x   -> { user, stats }
 *   GET /v3/tiktok/profile/videos   ?handle=x   -> { aweme_list: [{ aweme_id, desc, share_url, statistics }] }
 *   GET /v1/tiktok/video/transcript ?url=<share url>  -> { transcript }  (WEBVTT)
 */
import axios, { type AxiosInstance } from 'axios';

const API_KEY = process.env.SCRAPECREATORS_API_KEY;
const BASE_URL = process.env.SCRAPECREATORS_BASE_URL || 'https://api.scrapecreators.com';

export interface TiktokProfile {
  id: string;
  uniqueId: string;
  nickname?: string;
  followers?: number;
  videoCount?: number;
  avatar?: string;
}
export interface TiktokVideo {
  id: string;
  shareUrl: string;
  desc?: string;
  views?: number;
  likes?: number;
  comments?: number;
  createTime?: number;
  /** A browser-displayable (jpeg) cover; the first url_list entries are heic. */
  cover?: string;
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

/** '@handle', a URL, or a bare handle → the bare username ScrapeCreators expects. */
export function normalizeTiktokHandle(input: string): string {
  let s = (input ?? '').trim();
  const m = s.match(/tiktok\.com\/@([^/?#\s]+)/i);
  if (m) s = m[1];
  return s.replace(/^@+/, '').split(/[/?#\s]/)[0].trim();
}

export async function getTiktokProfile(handle: string): Promise<TiktokProfile | null> {
  try {
    const { data } = await client().get('/v1/tiktok/profile', { params: { handle: normalizeTiktokHandle(handle) } });
    const user = data?.user;
    if (!user?.id) return null;
    const stats = data?.stats || data?.statsV2 || {};
    return {
      id: String(user.id),
      uniqueId: user.uniqueId,
      nickname: user.nickname,
      followers: Number(stats.followerCount ?? stats.followers ?? 0) || undefined,
      videoCount: Number(stats.videoCount ?? 0) || undefined,
      avatar: user.avatarLarger || user.avatarMedium,
    };
  } catch {
    return null;
  }
}

/** TikTok lists heic first; Chrome and Firefox cannot render it. Prefer a jpeg variant. */
export function pickJpegCover(video: any): string | undefined {
  for (const key of ['cover', 'origin_cover', 'dynamic_cover']) {
    const urls: string[] = video?.[key]?.url_list || [];
    const jpeg = urls.find((u) => /\.jpe?g(\?|$)/i.test(u));
    if (jpeg) return jpeg;
  }
  return undefined;
}

export async function getTiktokVideos(handle: string, limit = 20): Promise<TiktokVideo[]> {
  try {
    const { data } = await client().get('/v3/tiktok/profile/videos', { params: { handle: normalizeTiktokHandle(handle) } });
    const list: any[] = data?.aweme_list || [];
    return list
      .slice(0, limit)
      .map((v) => ({
        id: String(v.aweme_id),
        shareUrl: v.share_url,
        desc: v.desc,
        views: v.statistics?.play_count,
        likes: v.statistics?.digg_count,
        comments: v.statistics?.comment_count,
        createTime: v.create_time,
        cover: pickJpegCover(v.video),
      }))
      .filter((v) => v.id && v.shareUrl);
  } catch {
    return [];
  }
}

/** Strip WEBVTT markup/timestamps to plain text. */
function vttToText(vtt: string): string {
  return vtt
    .split(/\r?\n/)
    .filter((line) => line.trim() && line.trim() !== 'WEBVTT' && !line.includes('-->') && !/^\d+$/.test(line.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getTiktokTranscript(shareUrl: string): Promise<string> {
  try {
    const { data } = await client().get('/v1/tiktok/video/transcript', { params: { url: shareUrl } });
    const raw: string = data?.transcript || '';
    return raw.includes('WEBVTT') || raw.includes('-->') ? vttToText(raw) : raw.trim();
  } catch {
    return '';
  }
}
