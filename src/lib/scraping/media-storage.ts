/**
 * Media storage helper — downloads Instagram CDN images and uploads them
 * to the Supabase "post-media" bucket so URLs never expire.
 *
 * Instagram CDN URLs are signed and expire after ~1-2 weeks. Without
 * persistence, images in the widget, content feed, and DMs break over time.
 * This helper mirrors the "avatars" bucket pattern used for profile pics.
 */

const BUCKET = 'post-media';
// Separate bucket: `post-media` is capped at 10MB and restricted to image MIME
// types, which is the guard rail that stops a routine scan from filling it
// with video. See migration 077.
const VIDEO_BUCKET = 'reel-video';

type AnySupabase = {
  storage: {
    from(bucket: string): {
      upload(path: string, body: Buffer | Blob, opts?: Record<string, unknown>): Promise<{ error: Error | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } | null };
    };
  };
};

const IG_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.instagram.com/',
};

function pickExtension(contentType: string | null): string {
  if (!contentType) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { headers: IG_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType: ct };
  } catch {
    return null;
  }
}

/**
 * Persist one image URL to storage. Returns the public storage URL on
 * success, or null on failure (caller keeps the original CDN URL as
 * a soft fallback).
 */
async function persistOne(
  supabase: AnySupabase,
  accountId: string,
  keyPrefix: string,
  index: number,
  sourceUrl: string,
): Promise<string | null> {
  // Skip if already a Supabase/public URL (idempotent re-runs)
  if (!/cdninstagram\.com|fbcdn\.net/.test(sourceUrl)) {
    return sourceUrl;
  }

  const downloaded = await downloadImage(sourceUrl);
  if (!downloaded) return null;

  const ext = pickExtension(downloaded.contentType);
  const path = `${accountId}/${keyPrefix}/${index}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, downloaded.buffer, { contentType: downloaded.contentType, upsert: true });

  if (error) return null;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

export interface PersistedPost {
  stored_media_urls: string[] | null;
  stored_thumbnail_url: string | null;
  media_stored_at: string | null;
}

/**
 * Persist all images for a single post (media_urls + thumbnail_url).
 * Always returns an object — fields are null if persistence failed.
 */
export async function persistPostMedia(
  supabase: AnySupabase,
  accountId: string,
  shortcode: string,
  mediaUrls: string[] | null | undefined,
  thumbnailUrl: string | null | undefined,
): Promise<PersistedPost> {
  const keyPrefix = `posts/${shortcode}`;
  const storedMediaUrls: string[] = [];
  let storedThumbnail: string | null = null;

  if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
    const results = await Promise.all(
      mediaUrls.map((url, i) => persistOne(supabase, accountId, keyPrefix, i, url)),
    );
    for (const r of results) {
      if (r) storedMediaUrls.push(r);
    }
  }

  if (thumbnailUrl) {
    storedThumbnail = await persistOne(supabase, accountId, keyPrefix, 9999, thumbnailUrl);
  }

  const anySaved = storedMediaUrls.length > 0 || !!storedThumbnail;

  return {
    stored_media_urls: storedMediaUrls.length > 0 ? storedMediaUrls : null,
    stored_thumbnail_url: storedThumbnail,
    media_stored_at: anySaved ? new Date().toISOString() : null,
  };
}

/**
 * Persist a reel's mp4 to storage and return its public URL.
 *
 * Kept separate from persistPostMedia, which handles images only and is called
 * for every post on every scan — videos are 3-8MB each and persisting all of
 * them would blow up storage and scan time for no benefit. Only the handful of
 * reels chosen for a banner rotation need a permanent URL.
 *
 * This exists because Instagram's mp4 URLs are signed with a short `oe=`
 * expiry: the ones sitting in `instagram_posts.media_urls` are typically dead
 * within a week or two, so a reel can only be played from our own storage.
 * Pass a URL fetched fresh from the scraper, not one read back from the DB.
 */
export interface PersistedReel {
  url: string | null;
  bytes: number;
  /** Why it failed, for the caller to print. Null on success. */
  error: string | null;
}

export async function persistReelVideo(
  supabase: AnySupabase,
  accountId: string,
  shortcode: string,
  videoUrl: string,
): Promise<PersistedReel> {
  if (!/cdninstagram\.com|fbcdn\.net/.test(videoUrl)) {
    return { url: videoUrl, bytes: 0, error: null };
  }

  let buffer: Buffer;
  let contentType: string;
  try {
    // Longer than the image timeout: multi-megabyte bodies over a CDN that
    // throttles unauthenticated range-less reads.
    const res = await fetch(videoUrl, {
      headers: { ...IG_HEADERS, Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) return { url: null, bytes: 0, error: `download ${res.status} ${res.statusText}` };
    contentType = res.headers.get('content-type') || 'video/mp4';
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (e: any) {
    return { url: null, bytes: 0, error: `download threw: ${e?.message || e}` };
  }

  // An expired signed URL comes back as a short HTML/JSON error body with a
  // 200, not a 4xx — so size is the only reliable liveness check.
  const bytes = buffer.byteLength;
  if (bytes < 100_000) {
    return { url: null, bytes, error: `body too small (${bytes}B) — URL likely expired` };
  }

  const path = `${accountId}/${shortcode}.mp4`;
  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  // Surface the real reason. Returning a bare null here hid a bucket MIME
  // restriction behind "expired URL" and cost a full debugging round.
  if (error) return { url: null, bytes, error: `upload: ${error.message}` };

  const { data } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl || null, bytes, error: data?.publicUrl ? null : 'no public URL' };
}

/**
 * Persist a single highlight item (media_url + thumbnail_url).
 */
export async function persistHighlightItem(
  supabase: AnySupabase,
  accountId: string,
  highlightId: string,
  itemId: string,
  mediaUrl: string | null | undefined,
  thumbnailUrl: string | null | undefined,
): Promise<{ stored_media_url: string | null; stored_thumbnail_url: string | null; media_stored_at: string | null }> {
  const keyPrefix = `highlights/${highlightId}/${itemId}`;
  const storedMedia = mediaUrl ? await persistOne(supabase, accountId, keyPrefix, 0, mediaUrl) : null;
  const storedThumb = thumbnailUrl ? await persistOne(supabase, accountId, keyPrefix, 1, thumbnailUrl) : null;

  const anySaved = !!storedMedia || !!storedThumb;
  return {
    stored_media_url: storedMedia,
    stored_thumbnail_url: storedThumb,
    media_stored_at: anySaved ? new Date().toISOString() : null,
  };
}
