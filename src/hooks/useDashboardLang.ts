'use client';

/**
 * useDashboardLang — fetch the account language for the dashboard surface.
 *
 * The influencer-side pages don't have direct access to the account row,
 * but `/api/influencer/nav-features` is already loaded by NavigationMenu
 * and now returns `language`. We cache the result in localStorage keyed by
 * username so subsequent renders inside the same dashboard session are
 * synchronous and flicker-free.
 *
 * Returns:
 *   { lang: 'he' | 'en', loading: boolean }
 *
 * Default while loading is the cached value (if any) → 'he' → so existing
 * Hebrew accounts never flicker into English.
 */

import { useEffect, useState } from 'react';

type Lang = 'he' | 'en';

function readCached(username: string): Lang | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(`dash_lang:${username}`);
    if (v === 'en' || v === 'he') return v;
  } catch { /* ignore */ }
  return null;
}

function writeCached(username: string, lang: Lang) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`dash_lang:${username}`, lang);
  } catch { /* ignore */ }
}

export function useDashboardLang(username: string | null | undefined): {
  lang: Lang;
  loading: boolean;
} {
  const initial: Lang = username ? readCached(username) || 'he' : 'he';
  const [lang, setLang] = useState<Lang>(initial);
  const [loading, setLoading] = useState<boolean>(!readCached(username || ''));

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/influencer/nav-features?username=${username}`);
        if (!res.ok) return;
        const data = await res.json();
        const fetched: Lang = data?.language === 'en' ? 'en' : 'he';
        if (cancelled) return;
        if (fetched !== lang) setLang(fetched);
        writeCached(username, fetched);
      } catch { /* ignore */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  return { lang, loading };
}
