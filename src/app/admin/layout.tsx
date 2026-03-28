'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'לוח בקרה', icon: 'dashboard', filled: true },
  { href: '/admin/influencers', label: 'משפיענים', icon: 'group' },
  { href: '/admin/add', label: 'קליטה', icon: 'person_add' },
  { href: '/admin/onboarding', label: 'אונבורדינג', icon: 'checklist' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="neon-admin" dir="rtl">
      {/* Google Fonts for admin */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600&display=swap" rel="stylesheet" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      {/* Top Navigation Bar */}
      <nav className="fixed top-0 w-full z-50 h-14 md:h-16 flex items-center justify-between px-4 md:px-8 neon-glass-nav">
        <div className="flex items-center gap-4 md:gap-6">
          {/* Mobile hamburger */}
          <button
            className="md:hidden w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#9334EB]/5 transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <span className="material-symbols-outlined text-[#4b5563]">
              {sidebarOpen ? 'close' : 'menu'}
            </span>
          </button>
          <span className="text-lg md:text-xl font-black tracking-tight neon-brand font-headline">bestieAI</span>
          <div className="hidden md:flex gap-6 items-center">
            <Link href="/admin/dashboard" className="text-[#474747] font-medium hover:text-[#9334EB] transition-colors text-sm">דשבורד</Link>
            <Link href="/admin/influencers" className="text-[#474747] font-medium hover:text-[#9334EB] transition-colors text-sm">משפיענים</Link>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-[#9334EB]/5 transition-colors">
            <span className="material-symbols-outlined text-[#4b5563] text-[20px] md:text-[24px]">notifications</span>
          </button>
          <button className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-[#9334EB]/5 transition-colors">
            <span className="material-symbols-outlined text-[#4b5563] text-[20px] md:text-[24px]">account_circle</span>
          </button>
        </div>
      </nav>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Side Navigation */}
      <aside className={`
        fixed right-0 top-0 h-full w-64 flex flex-col p-4 z-40 bg-[#f3f4f6] mt-14 md:mt-16
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        md:translate-x-0
      `}>
        <div className="mb-6 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#9334EB]/10 border-2 border-[#9334EB]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#9334EB]">shield</span>
          </div>
          <div>
            <p className="text-sm font-bold text-[#2663EB]">ניהול מערכת</p>
            <p className="text-[10px] opacity-70">ממשק מנהל</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-full transition-all duration-300 ${
                  isActive
                    ? 'text-[#9334EB] font-bold bg-white shadow-sm'
                    : 'text-[#474747] opacity-70 hover:opacity-100 hover:bg-white/50 hover:translate-x-[-4px]'
                }`}
              >
                <span
                  className="material-symbols-outlined"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/admin"
          className="flex items-center gap-3 px-4 py-3 text-[#474747] opacity-70 hover:opacity-100 hover:text-[#DC2627] rounded-full transition-all duration-300"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="font-medium text-sm">יציאה</span>
        </Link>
      </aside>

      {/* Main Content */}
      <main className="md:mr-64 pt-20 md:pt-24 pb-12 px-4 md:px-8 min-h-screen">
        {children}
      </main>

      {/* Footer */}
      <footer className="md:mr-64 flex flex-col md:flex-row-reverse justify-between items-center gap-4 px-4 md:px-8 py-6 md:py-8 border-t border-[#f3f4f6] bg-[#f8f9fc] text-xs">
        <div className="flex items-center gap-6">
          <a className="text-[#474747] opacity-80 hover:text-[#DC2627] transition-colors" href="#">תנאי שימוש</a>
          <a className="text-[#474747] opacity-80 hover:text-[#DC2627] transition-colors" href="#">פרטיות</a>
          <a className="text-[#474747] opacity-80 hover:text-[#DC2627] transition-colors" href="#">תמיכה</a>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#9334EB]">bestieAI</span>
          <span className="text-[#474747] opacity-60">© 2024 כל הזכויות שמורות</span>
        </div>
      </footer>
    </div>
  );
}
