'use client';

import { useEffect } from 'react';
import { usePathname, useParams } from 'next/navigation';
import { NavigationMenu } from '@/components/NavigationMenu';
import { ThemeProvider } from '@/components/ThemeProvider';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { dashboardDir } from '@/lib/i18n/dashboard';
import FirstRunTutorial from '@/components/FirstRunTutorial';

export default function InfluencerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const username = params?.username as string | undefined;
  const { lang } = useDashboardLang(username);
  const dir = dashboardDir(lang);
  const showNav = !pathname.endsWith('/login');

  // Metric 10 — the brand opening its own system. Once per browser session, not
  // per navigation, so the number means "visits" and not "clicks". Never blocks
  // the render, and the login screen is excluded.
  useEffect(() => {
    if (!username || !showNav) return;
    const key = `bestie_dash_visit_${username}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* private mode — fall through and record once per load */ }
    fetch(`/api/influencer/dashboard-visit?username=${encodeURIComponent(username)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ });
  }, [username, showNav, pathname]);

  return (
    <ThemeProvider>
      <div dir={dir} style={{ background: 'var(--dash-bg)', minHeight: '100vh', direction: dir }}>
        {/* Ambient background layers */}
        <div className="dash-ambient-bg" />
        <div className="dash-noise" />
        <div className="dash-vignette" />

        {/* Navigation */}
        {showNav && <NavigationMenu />}

        {/* First-run guided tour (self-gates: only for freshly-onboarded accounts) */}
        {showNav && username && <FirstRunTutorial username={username} />}

        {/* Content */}
        <div className="relative z-10 sm:pb-0 pb-14">{children}</div>
      </div>
    </ThemeProvider>
  );
}
