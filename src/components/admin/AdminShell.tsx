'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Globe,
  Activity,
  ListChecks,
  UserPlus,
  LogOut,
  Search,
  Bell,
  ChevronLeft,
  Menu,
  X,
  Command,
  Sparkles,
  Settings,
  ExternalLink,
  ChevronsUpDown,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  match?: (pathname: string) => boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    label: 'סקירה',
    items: [
      {
        href: '/admin/dashboard',
        label: 'דשבורד',
        icon: LayoutDashboard,
        match: (p) => p === '/admin/dashboard' || p === '/admin',
      },
    ],
  },
  {
    label: 'ניהול',
    items: [
      {
        href: '/admin/accounts',
        label: 'חשבונות',
        icon: Users,
        match: (p) => p.startsWith('/admin/accounts') || p.startsWith('/admin/influencers'),
      },
      {
        href: '/admin/websites',
        label: 'אתרים',
        icon: Globe,
        match: (p) => p.startsWith('/admin/websites'),
      },
      {
        href: '/admin/add',
        label: 'קליטה',
        icon: UserPlus,
      },
      {
        href: '/admin/onboarding',
        label: 'אונבורדינג',
        icon: ListChecks,
      },
    ],
  },
  {
    label: 'מערכת',
    items: [
      {
        href: '/admin/monitoring',
        label: 'מוניטורינג',
        icon: Activity,
      },
    ],
  },
];

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      data-active={active}
      onClick={onClick}
      className="ui-nav-item focus-ring"
    >
      <Icon className="ui-nav-icon" strokeWidth={1.75} />
      <span className="flex-1 truncate">{item.label}</span>
      {active && (
        <span className="w-1 h-1 rounded-full bg-[color:var(--brand)]" aria-hidden />
      )}
    </Link>
  );
}

function Crumbs({ pathname }: { pathname: string }) {
  const segments = pathname.split('/').filter(Boolean);
  // Labels lookup for common admin routes
  const labelOf = (s: string) => {
    const map: Record<string, string> = {
      admin: 'אדמין',
      dashboard: 'דשבורד',
      accounts: 'חשבונות',
      influencers: 'חשבונות',
      websites: 'אתרים',
      add: 'קליטה',
      onboarding: 'אונבורדינג',
      monitoring: 'מוניטורינג',
      checklist: 'צ׳קליסט',
      'chatbot-persona': 'פרסונת צ׳אטבוט',
    };
    return map[s] || s;
  };
  const parts = segments.map((s, i) => ({
    label: labelOf(s),
    href: '/' + segments.slice(0, i + 1).join('/'),
  }));
  return (
    <nav className="flex items-center gap-1.5 text-[13px] text-[color:var(--ink-500)] min-w-0" aria-label="breadcrumbs">
      {parts.map((p, i) => {
        const last = i === parts.length - 1;
        return (
          <span key={p.href} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronLeft className="w-3.5 h-3.5 text-[color:var(--ink-300)] rtl:rotate-180" />}
            {last ? (
              <span className="font-medium text-[color:var(--ink-900)] truncate">{p.label}</span>
            ) : (
              <Link href={p.href} className="hover:text-[color:var(--ink-800)] transition-colors truncate">
                {p.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isLoginPage = pathname === '/admin';
  const closeMobile = () => setMobileOpen(false);

  // ⌘K placeholder — keyboard hint for future command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const el = document.getElementById('admin-search') as HTMLInputElement | null;
        el?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (isLoginPage) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch {}
    router.push('/admin');
  };

  return (
    <div className="admin-shell neon-admin min-h-screen" dir="rtl">
      {/* Load Inter font */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[color:var(--ink-900)]/20 backdrop-blur-[1px] md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — right side for RTL */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 right-0 z-50 w-[240px] bg-[color:var(--surface-0)] border-l border-[color:var(--line)]',
          'flex flex-col transition-transform duration-300',
          'md:translate-x-0',
          mobileOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--line)]">
          <Link href="/admin/dashboard" className="flex items-center gap-2 min-w-0 group">
            <span className="w-7 h-7 rounded-[7px] bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--accent)] flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </span>
            <div className="flex flex-col min-w-0">
              <span className="font-display font-semibold text-[14px] text-[color:var(--ink-900)] leading-tight truncate">
                bestieAI
              </span>
              <span className="text-[10px] text-[color:var(--ink-500)] leading-tight">Admin Console</span>
            </div>
          </Link>
          <button
            aria-label="סגור תפריט"
            className="md:hidden w-8 h-8 rounded-md hover:bg-[color:var(--ink-100)] flex items-center justify-center text-[color:var(--ink-500)]"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV.map((group, idx) => (
            <div key={group.label} className={idx > 0 ? 'mt-4' : ''}>
              <div className="ui-nav-section">{group.label}</div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = item.match ? item.match(pathname) : pathname === item.href;
                  return <NavLink key={item.href} item={item} active={active} onClick={closeMobile} />;
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User pane */}
        <div className="border-t border-[color:var(--line)] p-2">
          <button className="w-full flex items-center gap-2.5 p-2 rounded-[8px] hover:bg-[color:var(--ink-100)] transition-colors group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--brand)]/20 to-[color:var(--accent)]/20 ring-1 ring-[color:var(--line)] flex items-center justify-center text-[11px] font-semibold text-[color:var(--ink-800)]">
              A
            </div>
            <div className="flex-1 min-w-0 text-start">
              <div className="text-[12px] font-semibold text-[color:var(--ink-900)] truncate">Admin</div>
              <div className="text-[10.5px] text-[color:var(--ink-500)] truncate">מנהל מערכת</div>
            </div>
            <ChevronsUpDown className="w-3.5 h-3.5 text-[color:var(--ink-400)]" />
          </button>
          <div className="flex items-center gap-1 mt-1">
            <Link
              href="/admin/settings"
              className="flex-1 ui-btn ui-btn-sm ui-btn-ghost focus-ring"
              aria-label="הגדרות"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="text-[12px]">הגדרות</span>
            </Link>
            <button
              onClick={handleLogout}
              className="ui-btn ui-btn-sm ui-btn-ghost focus-ring"
              aria-label="יציאה"
              title="יציאה"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="md:pr-[240px] min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 md:px-6 bg-[color:var(--surface-1)]/80 backdrop-blur-md border-b border-[color:var(--line)]">
          <button
            aria-label="תפריט"
            className="md:hidden w-8 h-8 rounded-md hover:bg-[color:var(--ink-100)] flex items-center justify-center text-[color:var(--ink-600)]"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="hidden md:block flex-shrink min-w-0">
            <Crumbs pathname={pathname} />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search (⌘K) */}
          <div className="relative hidden sm:block w-[260px] max-w-[40vw]">
            <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-3.5 h-3.5 text-[color:var(--ink-400)] pointer-events-none" />
            <input
              id="admin-search"
              type="search"
              placeholder="חיפוש מהיר..."
              className="ui-input focus-ring h-8 ps-8 pe-16 text-[12.5px]"
              aria-label="חיפוש"
            />
            <span className="absolute top-1/2 -translate-y-1/2 end-2 flex items-center gap-1">
              <kbd className="ui-kbd">
                <Command className="w-2.5 h-2.5" />
              </kbd>
              <kbd className="ui-kbd">K</kbd>
            </span>
          </div>

          <Separator orientation="vertical" className="!h-6 hidden sm:block" />

          <Button variant="ghost" size="icon-sm" aria-label="התראות" className="relative">
            <Bell className="w-4 h-4" strokeWidth={1.75} />
            <span className="absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-[color:var(--brand)] ring-2 ring-[color:var(--surface-1)]" />
          </Button>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="ui-btn ui-btn-sm ui-btn-outline focus-ring gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>צפייה באתר</span>
          </a>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 md:px-6 py-6">
          <div className="mx-auto max-w-[1440px] w-full">{children}</div>
        </main>

        {/* Footer */}
        <footer className="border-t border-[color:var(--line)] bg-[color:var(--surface-0)]/50">
          <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4 flex flex-col sm:flex-row-reverse items-center justify-between gap-3 text-[12px] text-[color:var(--ink-500)]">
            <div className="flex items-center gap-4">
              <a className="hover:text-[color:var(--ink-800)] transition-colors" href="#">תנאי שימוש</a>
              <a className="hover:text-[color:var(--ink-800)] transition-colors" href="#">פרטיות</a>
              <a className="hover:text-[color:var(--ink-800)] transition-colors" href="#">תמיכה</a>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[color:var(--ink-700)] font-semibold">bestieAI</span>
              <span>© 2026</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
