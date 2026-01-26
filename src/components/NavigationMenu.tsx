'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

export function NavigationMenu() {
  const params = useParams();
  const pathname = usePathname();
  const username = params.username as string;

  const menuItems = [
    {
      label: 'דשבורד',
      href: `/influencer/${username}/dashboard`,
      icon: '🏠',
    },
    {
      label: 'שת"פים',
      href: `/influencer/${username}/partnerships`,
      icon: '🤝',
    },
    {
      label: 'משימות',
      href: `/influencer/${username}/tasks`,
      icon: '✅',
    },
    {
      label: 'קופונים',
      href: `/influencer/${username}/coupons`,
      icon: '🎫',
    },
    {
      label: 'תקשורת',
      href: `/influencer/${username}/communications`,
      icon: '💬',
    },
    {
      label: 'קהל',
      href: `/influencer/${username}/audience`,
      icon: '👥',
    },
    {
      label: 'מסמכים',
      href: `/influencer/${username}/documents`,
      icon: '📄',
    },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <Link
            href={`/influencer/${username}/dashboard`}
            className="text-xl font-bold text-gray-900"
          >
            InfluencerBot
          </Link>

          {/* Navigation */}
          <div className="flex gap-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">@{username}</span>
            <button
              onClick={() => {
                // Clear cookie and redirect to login
                document.cookie = `influencer_session_${username}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
                window.location.href = `/influencer/${username}/login`;
              }}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              התנתק
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
