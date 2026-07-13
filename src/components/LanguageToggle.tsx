'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Languages } from 'lucide-react';
import { getDashboardStrings, type DashboardLang } from '@/lib/i18n/dashboard';

interface LanguageToggleProps {
  /** The current dashboard language. */
  lang: DashboardLang;
  /** Visual variant — top nav (default) or the mobile bottom bar. */
  variant?: 'nav' | 'mobile';
}

/**
 * Reusable language switcher for the dashboard chrome. Persists the choice to the
 * account (POST /api/influencer/language), updates the local cache for a flicker-free
 * first paint, then reloads so every page re-renders in the new language + direction.
 */
export function LanguageToggle({ lang, variant = 'nav' }: LanguageToggleProps) {
  const params = useParams();
  const username = params?.username as string | undefined;
  const [busy, setBusy] = useState(false);

  const target: DashboardLang = lang === 'en' ? 'he' : 'en';
  const targetLabel = target === 'en' ? 'English' : 'עברית'; // native names — not translated
  const t = getDashboardStrings(lang).nav;

  async function switchLanguage() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/influencer/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: target }),
      });
      if (!res.ok) throw new Error('language update failed');
      try {
        if (username) window.localStorage.setItem(`dash_lang:${username}`, target);
      } catch {
        /* ignore cache write errors */
      }
      window.location.reload();
    } catch {
      setBusy(false); // keep the current language on failure — no half-applied state
    }
  }

  if (variant === 'mobile') {
    return (
      <button
        onClick={switchLanguage}
        disabled={busy}
        aria-label={t.langSwitchTitle}
        className="flex flex-col items-center justify-center gap-0.5 transition-all duration-300 disabled:opacity-50"
        style={{ color: 'var(--dash-text-3)' }}
      >
        <Languages className="w-5 h-5" />
        <span className="text-[10px]">{targetLabel}</span>
      </button>
    );
  }

  return (
    <button
      onClick={switchLanguage}
      disabled={busy}
      title={t.langSwitchTitle}
      aria-label={t.langSwitchTitle}
      className="h-8 px-2.5 rounded-xl flex items-center gap-1.5 transition-all duration-300 disabled:opacity-50"
      style={{ color: 'var(--dash-text-3)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--dash-surface-hover)';
        e.currentTarget.style.color = 'var(--dash-text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--dash-text-3)';
      }}
    >
      <Languages className="w-4 h-4" />
      <span className="text-xs font-medium">{targetLabel}</span>
    </button>
  );
}
