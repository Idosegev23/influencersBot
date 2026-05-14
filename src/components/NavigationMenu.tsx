'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import {
  LayoutDashboard,
  Briefcase,
  Tag,
  MessageCircle,
  LifeBuoy,
  TrendingUp,
  BarChart3,
  Settings,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getDashboardStrings, dashboardDir, type DashboardLang } from '@/lib/i18n/dashboard';

// b2b_saas also gets the "brand-like" tabs (support, attribution) — IMAI needs
// the support inbox in particular.
const BRAND_LIKE_ARCHETYPES = new Set(['brand', 'local_business', 'b2b_saas']);

type NavKey =
  | 'dashboard' | 'analytics' | 'partnerships' | 'coupons' | 'products'
  | 'conversations' | 'support' | 'attribution' | 'settings';

const BASE_NAV_ITEMS: {
  key: NavKey;
  icon: typeof LayoutDashboard;
  brandOnly?: boolean;
  requiresProducts?: boolean;
}[] = [
  { key: 'dashboard', icon: LayoutDashboard },
  { key: 'analytics', icon: BarChart3 },
  { key: 'partnerships', icon: Briefcase },
  { key: 'coupons', icon: Tag },
  { key: 'products', icon: Sparkles, requiresProducts: true },
  { key: 'conversations', icon: MessageCircle },
  { key: 'support', icon: LifeBuoy, brandOnly: true },
  { key: 'attribution', icon: TrendingUp, brandOnly: true },
  { key: 'settings', icon: Settings },
];

export function NavigationMenu() {
  const params = useParams();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const username = params.username as string;

  const [features, setFeatures] = useState<{
    archetype: string | null;
    hasProducts: boolean;
    language: DashboardLang;
  } | null>(null);
  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/influencer/nav-features?username=${username}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFeatures({
          archetype: data.archetype || null,
          hasProducts: !!data.hasProducts,
          language: data.language === 'en' ? 'en' : 'he',
        });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Default to most-permissive view while loading so brand accounts don't see a flicker
  // of missing tabs. Influencer-only adjustments apply once nav-features lands.
  const isBrandLike = features ? BRAND_LIKE_ARCHETYPES.has(features.archetype || '') : true;
  const hasProducts = features ? features.hasProducts : false;
  const lang: DashboardLang = features?.language || 'he';
  const t = getDashboardStrings(lang).nav;
  const dir = dashboardDir(lang);

  const NAV_ITEMS = BASE_NAV_ITEMS.filter((item) => {
    if (item.brandOnly && !isBrandLike) return false;
    if (item.requiresProducts && !hasProducts) return false;
    return true;
  }).map((item) => ({ ...item, label: t[item.key] }));

  return (
    <div dir={dir} style={{ direction: dir }}>
      {/* ── Desktop nav ── */}
      <nav className="sticky top-0 z-30 hidden sm:block glass-nav">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const href = `/influencer/${username}/${item.key}`;
              const isActive =
                pathname === href ||
                (item.key !== 'dashboard' && pathname.startsWith(href + '/'));

              return (
                <Link
                  key={item.key}
                  href={href}
                  className={`
                    px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-300
                    flex items-center gap-1.5 relative
                    ${isActive ? 'nav-pill-active' : ''}
                  `}
                  style={{
                    color: isActive ? 'var(--color-primary)' : 'var(--dash-text-2)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--dash-surface-hover)';
                      e.currentTarget.style.color = 'var(--dash-text)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--dash-text-2)';
                    }
                  }}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 relative overflow-hidden"
            style={{ color: 'var(--dash-text-3)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--dash-surface-hover)';
              e.currentTarget.style.color = 'var(--dash-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--dash-text-3)';
            }}
            title={theme === 'dark' ? t.themeLight : t.themeDark}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 pb-safe glass-nav"
        style={{ borderTop: '1px solid var(--dash-glass-border)' }}
      >
        <div className="grid grid-cols-6 h-14">
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const href = `/influencer/${username}/${item.key}`;
            const isActive =
              pathname === href ||
              (item.key !== 'dashboard' && pathname.startsWith(href + '/'));

            return (
              <Link
                key={item.key}
                href={href}
                className="flex flex-col items-center justify-center gap-0.5 transition-all duration-300 relative"
                style={{ color: isActive ? 'var(--color-primary)' : 'var(--dash-text-3)' }}
              >
                {isActive && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                    style={{ background: 'var(--color-primary)', boxShadow: `0 0 8px var(--dash-glow-primary)` }}
                  />
                )}
                <item.icon className="w-5 h-5" />
                <span className="text-[10px]">{item.label}</span>
              </Link>
            );
          })}

          <button
            onClick={toggle}
            className="flex flex-col items-center justify-center gap-0.5 transition-all duration-300"
            style={{ color: 'var(--dash-text-3)' }}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-[10px]">{theme === 'dark' ? t.themeLightShort : t.themeDarkShort}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
