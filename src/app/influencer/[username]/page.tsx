'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Influencer Landing Page
 * Redirects to:
 * - Dashboard if authenticated
 * - Login page if not authenticated
 */
export default function InfluencerLandingPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        // Check if already authenticated
        const res = await fetch(`/api/influencer/auth?username=${username}`);
        const data = await res.json();

        if (data.authenticated) {
          // Redirect to dashboard
          router.push(`/influencer/${username}/dashboard`);
        } else {
          // Redirect to login page
          router.push(`/influencer/${username}/login`);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        // On error, redirect to login
        router.push(`/influencer/${username}/login`);
      }
    }

    checkAuth();
  }, [username, router]);

  // Show loading spinner while checking auth
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      dir="rtl"
      style={{ background: 'var(--dash-bg)' }}
    >
      <div className="text-center">
        <Loader2
          className="w-8 h-8 animate-spin mx-auto mb-4"
          style={{ color: 'var(--color-primary)' }}
        />
        <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>מפנה...</p>
      </div>
    </div>
  );
}
