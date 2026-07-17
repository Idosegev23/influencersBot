'use client';

import { useEffect, useState } from 'react';

/**
 * Single source of truth for cookie consent.
 *
 * The banner used to write the user's choice to localStorage and nothing ever
 * read it — Meta Pixel, TikTok Pixel and GA4 loaded regardless, so "necessary
 * only" was purely decorative. Everything that drops a non-essential cookie
 * must gate on `readConsent()` / `useConsent()`.
 */

export const CONSENT_COOKIE_NAME = 'cookie_consent';

/** Fired on the window whenever consent is saved, so listeners re-read it. */
export const CONSENT_EVENT = 'bestie:consent-change';

export interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

export const DENY_ALL: CookiePreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
};

function parse(raw: string | null): CookiePreferences | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<CookiePreferences>;
    return {
      necessary: true,
      analytics: p.analytics === true,
      marketing: p.marketing === true,
    };
  } catch {
    return null;
  }
}

/**
 * Current consent, or null if the visitor has not chosen yet.
 * Null must be treated as "no consent" — never as implied consent.
 */
export function readConsent(): CookiePreferences | null {
  if (typeof window === 'undefined') return null;
  return parse(window.localStorage.getItem(CONSENT_COOKIE_NAME));
}

export function writeConsent(prefs: CookiePreferences): void {
  if (typeof window === 'undefined') return;
  const value = JSON.stringify(prefs);
  window.localStorage.setItem(CONSENT_COOKIE_NAME, value);
  document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${
    60 * 60 * 24 * 365
  }; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: prefs }));
}

/**
 * Reactive consent for client components. Returns null until read on the client,
 * so nothing renders a tracker during SSR or before the choice is known.
 */
export function useConsent(): CookiePreferences | null {
  const [prefs, setPrefs] = useState<CookiePreferences | null>(null);

  useEffect(() => {
    const sync = () => setPrefs(readConsent());
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    // Keep other tabs in step.
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CONSENT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return prefs;
}
