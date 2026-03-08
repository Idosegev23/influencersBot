'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import {
  LayoutDashboard,
  Briefcase,
  Tag,
  MessageCircle,
  FileText,
  Sparkles,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'דשבורד', icon: LayoutDashboard },
  { key: 'partnerships', label: 'שת״פים', icon: Briefcase },
  { key: 'coupons', label: 'קופונים', icon: Tag },
  { key: 'conversations', label: 'שיחות', icon: MessageCircle },
  { key: 'documents', label: 'מסמכים', icon: FileText },
  { key: 'chatbot-persona', label: 'הבוט שלי', icon: Sparkles },
];

export function NavigationMenu() {
  const params = useParams();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const username = params.username as string;
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Desktop nav ── */}
      <nav
        className="sticky top-0 z-30 hidden sm:block border-b"
        style={{
          background: 'var(--dash-bg)',
          borderColor: 'var(--dash-border)',
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-11 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const href = `/influencer/${username}/${item.key}`;
              const isActive =
                pathname === href ||
                (item.key !== 'dashboard' && pathname.startsWith(href + '/'));

              return (
                <Link
                  key={item.key}
                  href={href}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
                  style={{
                    color: isActive ? 'var(--color-primary)' : 'var(--dash-text-2)',
                    background: isActive ? 'var(--dash-muted)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--dash-surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <button
            onClick={toggle}
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
            style={{ color: 'var(--dash-text-3)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <div
        className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t pb-safe"
        style={{
          background: 'var(--dash-bg)',
          borderColor: 'var(--dash-border)',
        }}
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
                className="flex flex-col items-center justify-center gap-0.5 transition-colors"
                style={{ color: isActive ? 'var(--color-primary)' : 'var(--dash-text-3)' }}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px]">{item.label}</span>
              </Link>
            );
          })}

          {/* More / theme toggle */}
          <button
            onClick={toggle}
            className="flex flex-col items-center justify-center gap-0.5"
            style={{ color: 'var(--dash-text-3)' }}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-[10px]">{theme === 'dark' ? 'בהיר' : 'כהה'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
