'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MetaApiConsole from '@/components/admin/meta-review/MetaApiConsole';

/**
 * Standalone, fully-English (LTR) Meta App Review console.
 *
 * Lives under /admin so it shares the admin cookie auth, but AdminShell renders it
 * WITHOUT the Hebrew RTL sidebar/chrome (see AdminShell isBareRoute) — the recorded
 * surface must be 100% English for Meta App Review.
 */
export default function MetaReviewPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/admin')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) {
          setAuthed(true);
        } else {
          setAuthed(false);
          router.push('/admin');
        }
      })
      .catch(() => {
        setAuthed(false);
        router.push('/admin');
      });
  }, [router]);

  if (authed !== true) {
    return (
      <div
        dir="ltr"
        lang="en"
        style={{ direction: 'ltr' }}
        className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm"
      >
        {authed === false ? 'Redirecting to sign in…' : 'Loading…'}
      </div>
    );
  }

  return (
    <div dir="ltr" lang="en" style={{ direction: 'ltr' }} className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-5 py-4">
          <h1 className="text-base font-semibold text-gray-900">
            LDRS — Instagram API (Meta App Review)
          </h1>
          <p className="text-xs text-gray-500">
            Live Instagram Graph API calls demonstrating each requested permission.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-6">
        <MetaApiConsole accountId={accountId} />
      </main>
    </div>
  );
}
