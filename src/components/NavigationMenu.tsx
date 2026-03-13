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
} from 'lucide-react';

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

  return (
    <>
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
            title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
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
            <span className="text-[10px]">{theme === 'dark' ? 'בהיר' : 'כהה'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
