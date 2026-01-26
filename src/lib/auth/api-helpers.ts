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
}

/**
 * בדיקת authentication + authorization בסיסית
 * שימוש: const auth = await requireAuth(req, 'analytics', 'read');
 */
export async function requireAuth(
  req: NextRequest,
  resource: string,
  action: 'create' | 'read' | 'update' | 'delete'
): Promise<AuthCheckResult> {
  // Get user
  const user = await getCurrentUser(req);
  
  if (!user) {
    return {
      authorized: false,
      user: null,
      response: NextResponse.json(
        { error: 'Unauthorized - please login' },
        { status: 401 }
      ),
    };
  }

  // Check permission
  const canAccess = await checkPermission(user, { resource, action });

  if (!canAccess) {
    return {
      authorized: false,
      user,
      response: NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    user,
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
