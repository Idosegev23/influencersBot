'use client';

import { usePathname } from 'next/navigation';
import { NavigationMenu } from '@/components/NavigationMenu';

export default function InfluencerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // Don't show navigation on login page
  const showNav = !pathname.endsWith('/login');

  return (
    <>
      {showNav && <NavigationMenu />}
      {children}
    </>
  );
}








