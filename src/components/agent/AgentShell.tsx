'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, FileText, LogOut, Menu, X, Sparkles, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match?: (p: string) => boolean;
};

const NAV: NavItem[] = [
  { href: '/agent', label: 'לקוחות', icon: Users, match: (p) => p === '/agent' || p.startsWith('/agent/clients') },
  { href: '/agent/quotes', label: 'הצעות מחיר', icon: FileText, match: (p) => p.startsWith('/agent/quotes') },
];

function Crumbs({ pathname }: { pathname: string }) {
  const labelOf = (s: string) => {
    const map: Record<string, string> = {
      agent: 'סוכן',
      clients: 'לקוחות',
      quotes: 'הצעות מחיר',
    };
    return map[s] || s;
  };
  const segments = pathname.split('/').filter(Boolean);
  const parts = segments.map((s, i) => ({ label: labelOf(s), href: '/' + segments.slice(0, i + 1).join('/') }));
  return (
    <nav className="flex items-center gap-1.5 text-[13px] text-[color:var(--ink-500)] min-w-0">
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

export default function AgentShell({
  children,
  agentName,
}: {
  children: React.ReactNode;
  agentName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch {}
    router.push('/admin');
  };

  const initial = (agentName || 'ס').trim().charAt(0).toUpperCase();

  return (
    <div className="admin-shell neon-admin min-h-screen" dir="rtl">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[color:var(--ink-900)]/20 backdrop-blur-[1px] md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar — right for RTL */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 right-0 z-50 w-[240px] bg-[color:var(--surface-0)] border-l border-[color:var(--line)]',
          'flex flex-col transition-transform duration-300 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--line)]">
          <Link href="/agent" className="flex items-center gap-2 min-w-0 group">
            <span className="w-7 h-7 rounded-[7px] bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--accent)] flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </span>
            <div className="flex flex-col min-w-0">
              <span className="font-display font-semibold text-[14px] text-[color:var(--ink-900)] leading-tight truncate">
                bestieAI
              </span>
              <span className="text-[10px] text-[color:var(--ink-500)] leading-tight">CRM סוכן</span>
            </div>
          </Link>
          <button
            aria-label="סגור תפריט"
            className="md:hidden w-8 h-8 rounded-md hover:bg-[color:var(--ink-100)] flex items-center justify-center text-[color:var(--ink-500)]"
            onClick={closeMobile}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <div className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = item.match ? item.match(pathname) : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  onClick={closeMobile}
                  className="ui-nav-item focus-ring"
                >
                  <Icon className="ui-nav-icon" strokeWidth={1.75} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {active && <span className="w-1 h-1 rounded-full bg-[color:var(--brand)]" aria-hidden />}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-[color:var(--line)] p-2">
          <div className="w-full flex items-center gap-2.5 p-2 rounded-[8px]">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--brand)]/20 to-[color:var(--accent)]/20 ring-1 ring-[color:var(--line)] flex items-center justify-center text-[11px] font-semibold text-[color:var(--ink-800)]">
              {initial}
            </div>
            <div className="flex-1 min-w-0 text-start">
              <div className="text-[12px] font-semibold text-[color:var(--ink-900)] truncate">{agentName}</div>
              <div className="text-[10.5px] text-[color:var(--ink-500)] truncate">סוכן</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full ui-btn ui-btn-sm ui-btn-ghost focus-ring mt-1 justify-center"
            aria-label="יציאה"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-[12px]">יציאה</span>
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="md:pr-[240px] min-h-screen flex flex-col">
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
          <div className="flex-1" />
        </header>

        <main className="flex-1 px-4 md:px-6 py-6">
          <div className="mx-auto max-w-[1440px] w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
