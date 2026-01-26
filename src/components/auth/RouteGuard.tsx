'use client';

/**
 * RouteGuard Component - הגנה על routes לפי role
 * 
 * שימוש:
 * <RouteGuard requiredRole="influencer">
 *   <ProtectedContent />
 * </RouteGuard>
 */

import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase';

export type AppRole = 'admin' | 'agent' | 'influencer' | 'follower';

interface RouteGuardProps {
  children: ReactNode;
  requiredRole: AppRole;
  fallbackUrl?: string;
  loadingComponent?: ReactNode;
}

const roleHierarchy: Record<AppRole, number> = {
  follower: 0,
  influencer: 1,
  agent: 2,
  admin: 3,
};

export function RouteGuard({
  children,
  requiredRole,
  fallbackUrl = '/unauthorized',
  loadingComponent,
}: RouteGuardProps) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuthorization();
  }, [requiredRole]);

  async function checkAuthorization() {
    try {
      setIsLoading(true);
      
      // Special handling for influencer role - check cookie-based auth
      if (requiredRole === 'influencer') {
        // Extract username from current path
        const pathParts = window.location.pathname.split('/');
        const usernameIndex = pathParts.indexOf('influencer') + 1;
        const username = pathParts[usernameIndex];
        
        if (username) {
          // Check if influencer is authenticated via cookie
          const response = await fetch(`/api/influencer/auth?username=${username}`);
          const data = await response.json();
          
          if (data.authenticated) {
            setIsAuthorized(true);
            setIsLoading(false);
            return;
          } else {
            // Not authenticated - redirect to influencer login
            setIsAuthorized(false);
            setIsLoading(false);
            router.push(`/influencer/${username}/login`);
            return;
          }
        }
      }
      
      // For other roles, use Supabase auth
      const supabase = createClientSupabaseClient();

      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        console.log('[RouteGuard] No authenticated user');
        setIsAuthorized(false);
        setIsLoading(false);
        router.push('/login');
        return;
      }

      // Get user role from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        console.error('[RouteGuard] Failed to fetch user role:', userError);
        setIsAuthorized(false);
        setIsLoading(false);
        router.push(fallbackUrl);
        return;
      }

      const userRole = userData.role as AppRole;

      // Check if user has required role or higher
      const hasAccess = roleHierarchy[userRole] >= roleHierarchy[requiredRole];

      if (!hasAccess) {
        console.log(`[RouteGuard] Access denied: ${userRole} < ${requiredRole}`);
        setIsAuthorized(false);
        setIsLoading(false);
        router.push(fallbackUrl);
        return;
      }

      console.log(`[RouteGuard] Access granted: ${userRole} >= ${requiredRole}`);
      setIsAuthorized(true);
      setIsLoading(false);
    } catch (error) {
      console.error('[RouteGuard] Authorization check failed:', error);
      setIsAuthorized(false);
      setIsLoading(false);
      router.push(fallbackUrl);
    }
  }

  // Loading state
  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-gray-600">טוען...</p>
        </div>
      </div>
    );
  }

  // Not authorized
  if (isAuthorized === false) {
    return null; // Router will redirect
  }

  // Authorized - render children
  return <>{children}</>;
}

/**
 * Hook לבדיקת הרשאה נוכחית
 */
export function useAuth() {
  const [user, setUser] = useState<{ id: string; email: string; role: AppRole } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const supabase = createClientSupabaseClient();

      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

      if (authError || !authUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('id', authUser.id)
        .single();

      if (userError || !userData) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser({
        id: userData.id,
        email: userData.email,
        role: userData.role as AppRole,
      });
      setLoading(false);
    } catch (error) {
      console.error('[useAuth] Error:', error);
      setUser(null);
      setLoading(false);
    }
  }

  return { user, loading, refetch: loadUser };
}

/**
 * Helper: בדיקה אם יש הרשאה מסוימת
 */
export function hasRole(userRole: AppRole, requiredRole: AppRole): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}
