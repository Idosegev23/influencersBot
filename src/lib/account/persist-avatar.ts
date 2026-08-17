/**
 * Persist an account's Instagram profile picture into the `avatars`
 * Supabase Storage bucket and write the resulting public URL to
 * `accounts.config.avatar_url`.
 *
 * Why: Instagram CDN URLs are signed and expire (~2 weeks). Without
 * persistence, the chat header shows the first letter of the brand
 * name instead of the actual logo once the URL goes stale.
 *
 * Idempotent — if `accounts.config.avatar_url` already points to our
 * own Supabase Storage, this is a no-op and returns the existing URL.
 *
 * Best-effort — never throws on download/upload failures. The caller
 * gets `{ ok: false, reason }` and can decide whether to retry.
 */

import { createClient } from '@/lib/supabase';

const BUCKET = 'avatars';
const SUPABASE_HOST_HINT = '/storage/v1/object/public/avatars/';

const IG_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.instagram.com/',
};

function pickExt(contentType: string | null | undefined): string {
  if (!contentType) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

export interface PersistAvatarResult {
  ok: boolean;
  url?: string;
  reason?: string;
  source?: 'cache' | 'instagram' | 'fallback';
}

export async function persistAccountAvatar(
  accountId: string,
  opts: { force?: boolean } = {},
): Promise<PersistAvatarResult> {
  const supabase = createClient();

  const { data: account, error: acctErr } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();

  if (acctErr || !account) {
    return { ok: false, reason: `account not found: ${acctErr?.message || 'no row'}` };
  }

  const cfg = (account.config as any) || {};
  const existing: string | undefined = cfg.avatar_url;

  if (!opts.force && existing && existing.includes(SUPABASE_HOST_HINT)) {
    return { ok: true, url: existing, source: 'cache' };
  }

  const { data: profile } = await supabase
    .from('instagram_profile_history')
    .select('profile_pic_url')
    .eq('account_id', accountId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const storedUrl = profile?.profile_pic_url || (existing && !existing.includes(SUPABASE_HOST_HINT) ? existing : null);

  async function download(url: string): Promise<{ buffer: Buffer; contentType: string } | string> {
    try {
      const res = await fetch(url, { headers: IG_HEADERS, signal: AbortSignal.timeout(20000) });
      if (!res.ok) return `download failed: ${res.status}`;
      return {
        contentType: res.headers.get('content-type') || 'image/jpeg',
        buffer: Buffer.from(await res.arrayBuffer()),
      };
    } catch (e: any) {
      return `download error: ${e?.message || e}`;
    }
  }

  // Every URL we have on file is an Instagram CDN link with a signed expiry,
  // and this function only ever runs because one of them went stale. So when
  // the stored URL will not download, re-read the profile from the scraper and
  // try the live one — otherwise the account is stuck showing a coloured
  // initial forever, which is the exact failure this is meant to prevent.
  let got = storedUrl ? await download(storedUrl) : 'no instagram profile_pic_url on file';

  if (typeof got === 'string') {
    const username: string | undefined = cfg.username;
    if (!username) return { ok: false, reason: `${got}; no username to refetch with` };
    try {
      const { scrapeInstagramProfile } = await import('@/lib/scraping/scrapeCreatorsClient');
      const fresh = await scrapeInstagramProfile(username);
      const freshUrl = (fresh as any)?.profile_pic_url;
      if (!freshUrl) return { ok: false, reason: `${got}; scraper returned no profile_pic_url` };
      got = await download(freshUrl);
    } catch (e: any) {
      return { ok: false, reason: `${got}; refetch failed: ${e?.message || e}` };
    }
  }

  if (typeof got === 'string') return { ok: false, reason: got };
  const { buffer, contentType } = got;

  const path = `${accountId}/profile.${pickExt(contentType)}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (upErr) {
    return { ok: false, reason: `upload failed: ${upErr.message}` };
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    return { ok: false, reason: 'no public URL returned by storage' };
  }

  const newConfig = { ...cfg, avatar_url: publicUrl };
  const { error: updErr } = await supabase
    .from('accounts')
    .update({ config: newConfig })
    .eq('id', accountId);
  if (updErr) {
    return { ok: false, reason: `db update failed: ${updErr.message}` };
  }

  return { ok: true, url: publicUrl, source: 'instagram' };
}
