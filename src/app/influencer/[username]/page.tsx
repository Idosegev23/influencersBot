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
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-4" />
        <p className="text-gray-600 text-sm">מפנה...</p>
      </div>
    </div>
  );
}








