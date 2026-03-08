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
      {showNav && <NavigationMenu />}
      <div className="sm:pb-0 pb-14">{children}</div>
    </ThemeProvider>
  );
}
