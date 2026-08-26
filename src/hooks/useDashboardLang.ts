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

import { useEffect, useLayoutEffect, useState } from 'react';

// useLayoutEffect warns when it runs during SSR; this hook is used inside client
// components that are still server-rendered, so fall back to useEffect there.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
  // Start where the SERVER starts.
  //
  // Reading the cache during the first render looks free, but the server cannot
  // read localStorage, so it renders 'he' while the client's first render has
  // 'en'. React hydrates, its virtual DOM now says 'en', and the real DOM still
  // says 'he' — and because the two vDOMs agree from then on, React never writes
  // the attribute again. The Bestie launcher's aria-label and alt stayed Hebrew
  // on an English dashboard permanently, while the panel inside it (rendered
  // later, after a genuine state change) was correctly English.
  //
  // Matching the server on render 1 and applying the cache in a layout effect
  // makes it a REAL state change, which React does write to the DOM. The layout
  // effect runs before paint, so there is still no visible flicker.
  const [lang, setLang] = useState<Lang>('he');
  const [loading, setLoading] = useState<boolean>(!readCached(username || ''));

  useIsomorphicLayoutEffect(() => {
    if (!username) return;
    const cached = readCached(username);
    if (cached) setLang(cached);
  }, [username]);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      try {
        // Prefer the authenticated endpoint (also returns archetype + hasProducts);
        // fall back to the public language-only endpoint when the operator
        // isn't logged in yet (e.g. on /influencer/[username]/login).
        let fetchedLang: Lang | null = null;
        const res = await fetch(`/api/influencer/nav-features?username=${username}`);
        if (res.ok) {
          const data = await res.json();
          fetchedLang = data?.language === 'en' ? 'en' : 'he';
        } else {
          const pub = await fetch(`/api/account/language?username=${username}`);
          if (pub.ok) {
            const data = await pub.json();
            fetchedLang = data?.language === 'en' ? 'en' : 'he';
          }
        }
        if (cancelled || !fetchedLang) return;
        if (fetchedLang !== lang) setLang(fetchedLang);
        writeCached(username, fetchedLang);
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
