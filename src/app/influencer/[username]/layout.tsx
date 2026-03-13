'use client';

import { usePathname } from 'next/navigation';
import { NavigationMenu } from '@/components/NavigationMenu';
import { ThemeProvider } from '@/components/ThemeProvider';

export default function InfluencerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const showNav = !pathname.endsWith('/login');

  return (
    <ThemeProvider>
      <div style={{ background: 'var(--dash-bg)', minHeight: '100vh' }}>
        {/* Ambient background layers */}
        <div className="dash-ambient-bg" />
        <div className="dash-noise" />
        <div className="dash-vignette" />

        {/* Navigation */}
        {showNav && <NavigationMenu />}

        {/* Content */}
        <div className="relative z-10 sm:pb-0 pb-14">{children}</div>
      </div>
    </ThemeProvider>
  );
}
