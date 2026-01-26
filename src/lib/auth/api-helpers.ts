/**
 * API Auth Helpers - פונקציות עזר לבדיקת הרשאות ב-API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, checkPermission, getAgentInfluencerAccounts } from './middleware';
import type { AuthUser } from './middleware';

export interface AuthCheckResult {
  authorized: boolean;
  user: AuthUser | null;
  response?: NextResponse;
  error?: string; // For backwards compatibility
  success?: boolean; // For backwards compatibility
  status?: number; // For backwards compatibility
}

/**
 * בדיקת authentication + authorization בסיסית
 * שימוש: const auth = await requireAuth(req, 'analytics', 'read');
 * או: const auth = await requireAuth(req); // בדיקת authentication בלבד
 */
export async function requireAuth(
  req: NextRequest,
  resource?: string,
  action?: 'create' | 'read' | 'update' | 'delete'
): Promise<AuthCheckResult> {
  // Get user
  const user = await getCurrentUser(req);
  
  if (!user) {
    return {
      authorized: false,
      user: null,
      success: false,
      error: 'Unauthorized - please login',
      status: 401,
      response: NextResponse.json(
        { error: 'Unauthorized - please login' },
        { status: 401 }
      ),
    };
  }

  // If resource and action provided, check permission
  if (resource && action) {
    const canAccess = await checkPermission(user, { resource, action });

    if (!canAccess) {
      return {
        authorized: false,
        user,
        success: false,
        error: 'Forbidden - insufficient permissions',
        status: 403,
        response: NextResponse.json(
          { error: 'Forbidden - insufficient permissions' },
          { status: 403 }
        ),
      };
    }
  }

  return {
    authorized: true,
    user,
    success: true,
  };
}

/**
 * בדיקה שהמשתמש יכול לגשת ל-account מסוים
 */
export async function requireAccountAccess(
  user: AuthUser,
  accountId: string
): Promise<NextResponse | null> {
  // Admin can access everything
  if (user.role === 'admin') {
    return null;
  }

  // Influencer can only access own account
  if (user.role === 'influencer') {
    if (user.accountId !== accountId) {
      return NextResponse.json(
        { error: 'Forbidden - not your account' },
        { status: 403 }
      );
    }
    return null;
  }

  // Agent can access assigned influencer accounts
  if (user.role === 'agent') {
    const agentAccounts = await getAgentInfluencerAccounts(user.id);
    if (!agentAccounts.includes(accountId)) {
      return NextResponse.json(
        { error: 'Forbidden - not your influencer' },
        { status: 403 }
      );
    }
    return null;
  }

  // Follower has no access
  return NextResponse.json(
    { error: 'Forbidden - followers cannot access this resource' },
    { status: 403 }
  );
}
