/**
 * Media storage helper — downloads Instagram CDN images and uploads them
 * to the Supabase "post-media" bucket so URLs never expire.
 *
 * Instagram CDN URLs are signed and expire after ~1-2 weeks. Without
 * persistence, images in the widget, content feed, and DMs break over time.
 * This helper mirrors the "avatars" bucket pattern used for profile pics.
 */

const BUCKET = 'post-media';

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
