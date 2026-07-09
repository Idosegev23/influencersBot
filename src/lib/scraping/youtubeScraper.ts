/**
 * YouTube scraping via ScrapeCreators (https://api.scrapecreators.com).
 * Endpoints (verified against the live API):
 *   GET /v1/youtube/channel          ?handle=@x | ?url=<channel url>
 *   GET /v1/youtube/channel-videos   ?handle=@x | ?url=<channel url>
 *   GET /v1/youtube/video/transcript ?url=<video url>   -> { transcript_only_text }
 */
import axios, { type AxiosInstance } from 'axios';

const API_KEY = process.env.SCRAPECREATORS_API_KEY;
const BASE_URL = process.env.SCRAPECREATORS_BASE_URL || 'https://api.scrapecreators.com';

export interface YoutubeChannel {
  channelId: string;
  name?: string;
  description?: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCount?: number;
  avatar?: string;
  handle?: string;
}
export interface YoutubeVideo {
  id: string;
  url: string;
  title?: string;
  description?: string;
  views?: number;
  lengthSeconds?: number;
  publishedTime?: string;
  publishDate?: string; // absolute date (ISO-ish) when available
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

/** A raw channel input (URL or @handle) → the params ScrapeCreators expects. */
function channelParams(handleOrUrl: string): Record<string, string> {
  const s = handleOrUrl.trim();
  if (/youtube\.com|youtu\.be/i.test(s)) return { url: s };
  return { handle: s.startsWith('@') ? s : `@${s}` };
}

export async function getYoutubeChannel(handleOrUrl: string): Promise<YoutubeChannel | null> {
  try {
    const { data } = await client().get('/v1/youtube/channel', { params: channelParams(handleOrUrl) });
    if (!data?.channelId) return null;
    return {
      channelId: data.channelId,
      name: data.name,
      description: data.description,
      subscriberCount: data.subscriberCount,
      videoCount: data.videoCount,
      viewCount: data.viewCount,
      avatar: data.avatar,
      handle: data.handle,
    };
  } catch {
    return null;
  }
}

export async function getYoutubeVideos(handleOrUrl: string, limit = 30): Promise<YoutubeVideo[]> {
  try {
    const { data } = await client().get('/v1/youtube/channel-videos', { params: channelParams(handleOrUrl) });
    const videos: any[] = data?.videos || [];
    return videos
      .slice(0, limit)
      .map((v) => ({
        id: v.id,
        url: v.url,
        title: v.title,
        description: v.description,
        views: v.viewCountInt,
        lengthSeconds: v.lengthSeconds,
        publishedTime: v.publishedTime,
        publishDate: v.publishDate || v.publishedTimeText,
      }))
      .filter((v) => v.id && v.url);
  } catch {
    return [];
  }
}

export async function getYoutubeTranscript(videoUrl: string): Promise<string> {
  try {
    const { data } = await client().get('/v1/youtube/video/transcript', { params: { url: videoUrl } });
    return (data?.transcript_only_text || '').trim();
  } catch {
    return '';
  }
}
