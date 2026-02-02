/**
 * Auth Middleware - מערכת הרשאות מרכזית
 * 
 * מספק פונקציות לבדיקת הרשאות משתמשים בצד השרת
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { NextRequest } from 'next/server';

export type AppRole = 'admin' | 'agent' | 'influencer' | 'follower';

export interface AuthUser {
  id: string;
  email: string;
  role: AppRole;
  accountId?: string;
  fullName?: string;
}

export interface PermissionCheck {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete';
  resourceId?: string;
}

/**
 * שליפת משתמש נוכחי מ-Supabase Auth
 * עם caching ב-Redis למשך 1 דקה
 */
export async function getCurrentUser(request?: NextRequest): Promise<AuthUser | null> {
  try {
    const supabase = createServerSupabaseClient();
    
    // קבלת user מ-Auth
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      return null;
    }

    // בדיקה ב-cache
    const cacheKey = `auth:user:${authUser.id}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached as string);
    }

    // שליפת role ו-account מ-DB
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, role, full_name')
      .eq('id', authUser.id)
      .single();

    if (userError || !userData) {
      console.error('Failed to fetch user data:', userError);
      return null;
    }

    // שליפת account_id (למשפיענים/סוכנים)
    let accountId: string | undefined;
    
    if (userData.role === 'influencer' || userData.role === 'agent') {
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id')
        .eq('owner_user_id', userData.id)
        .single();
      
      accountId = accountData?.id;
    }

    const user: AuthUser = {
      id: userData.id,
      email: userData.email,
      role: userData.role as AppRole,
      accountId,
      fullName: userData.full_name || undefined,
    };

    // שמירה ב-cache ל-60 שניות
    await redis.setex(cacheKey, 60, JSON.stringify(user));

    return user;
  } catch (error) {
    console.error('getCurrentUser error:', error);
    return null;
  }
}

/**
 * בדיקת הרשאה ספציפית למשאב
 */
export async function checkPermission(
  user: AuthUser | null,
  check: PermissionCheck
): Promise<boolean> {
  if (!user) {
    return false;
  }

  const { resource, action, resourceId } = check;

  // Admin רואה ועושה הכל
  if (user.role === 'admin') {
    return true;
  }

  // Follower אין גישה לכלום (רק chat)
  if (user.role === 'follower') {
    return false;
  }

  // לוגיקה לפי resource
  switch (resource) {
    case 'partnerships':
      return checkPartnershipPermission(user, action, resourceId);
    
    case 'documents':
      return checkDocumentPermission(user, action, resourceId);
    
    case 'tasks':
      return checkTaskPermission(user, action, resourceId);
    
    case 'invoices':
      return checkInvoicePermission(user, action, resourceId);
    
    case 'analytics':
      return checkAnalyticsPermission(user, action);
    
    default:
      console.warn(`Unknown resource: ${resource}`);
      return false;
  }
}

/**
 * בדיקת הרשאה לשת"פים
 */
async function checkPartnershipPermission(
  user: AuthUser,
  action: string,
  resourceId?: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  // Influencer יכול לנהל רק את שלו
  if (user.role === 'influencer') {
    if (!resourceId) {
      return action === 'create' || action === 'read'; // יכול ליצור ולצפות
    }

    // בדיקת ownership
    const { data } = await supabase
      .from('partnerships')
      .select('account_id')
      .eq('id', resourceId)
      .single();

    return data?.account_id === user.accountId;
  }

  // Agent יכול לצפות רק במשפיענים שלו
  if (user.role === 'agent') {
    if (!resourceId) {
      return action === 'read'; // יכול לצפות בכל שלו
    }

    // בדיקה אם השת"פ שייך למשפיען שלו
    const { data: partnership } = await supabase
      .from('partnerships')
      .select('account_id')
      .eq('id', resourceId)
      .single();

    if (!partnership) return false;

    // בדיקה ב-agent_influencers
    const { data: assignment } = await supabase
      .from('agent_influencers')
      .select('id')
      .eq('agent_id', user.id)
      .eq('influencer_account_id', partnership.account_id)
      .single();

    return !!assignment;
  }

  return false;
}

/**
 * בדיקת הרשאה למסמכים
 */
async function checkDocumentPermission(
  user: AuthUser,
  action: string,
  resourceId?: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  // רק influencer+ יכולים להעלות
  if (action === 'create') {
    return user.role === 'influencer' || user.role === 'agent';
  }

  // Influencer רואה רק את שלו
  if (user.role === 'influencer') {
    if (!resourceId) return true;

    const { data } = await supabase
      .from('partnership_documents')
      .select('account_id')
      .eq('id', resourceId)
      .single();

    return data?.account_id === user.accountId;
  }

  // Agent רואה של המשפיענים שלו
  if (user.role === 'agent') {
    if (!resourceId) return true;

    const { data: doc } = await supabase
      .from('partnership_documents')
      .select('account_id')
      .eq('id', resourceId)
      .single();

    if (!doc) return false;

    const { data: assignment } = await supabase
      .from('agent_influencers')
      .select('id')
      .eq('agent_id', user.id)
      .eq('influencer_account_id', doc.account_id)
      .single();

    return !!assignment;
  }

  return false;
}

/**
 * בדיקת הרשאה למשימות
 */
async function checkTaskPermission(
  user: AuthUser,
  action: string,
  resourceId?: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  if (user.role === 'influencer') {
    if (!resourceId) return true;

    const { data } = await supabase
      .from('tasks')
      .select('account_id')
      .eq('id', resourceId)
      .single();

    return data?.account_id === user.accountId;
  }

  if (user.role === 'agent') {
    if (!resourceId) return true;

    const { data: task } = await supabase
      .from('tasks')
      .select('account_id')
      .eq('id', resourceId)
      .single();

    if (!task) return false;

    const { data: assignment } = await supabase
      .from('agent_influencers')
      .select('id')
      .eq('agent_id', user.id)
      .eq('influencer_account_id', task.account_id)
      .single();

    return !!assignment;
  }

  return false;
}

/**
 * בדיקת הרשאה לחשבוניות
 */
async function checkInvoicePermission(
  user: AuthUser,
  action: string,
  resourceId?: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  if (user.role === 'influencer') {
    if (!resourceId) return true;

    const { data } = await supabase
      .from('invoices')
      .select('account_id')
      .eq('id', resourceId)
      .single();

    return data?.account_id === user.accountId;
  }

  if (user.role === 'agent') {
    if (!resourceId) return true;

    const { data: invoice } = await supabase
      .from('invoices')
      .select('account_id')
      .eq('id', resourceId)
      .single();

    if (!invoice) return false;

    const { data: assignment } = await supabase
      .from('agent_influencers')
      .select('id')
      .eq('agent_id', user.id)
      .eq('influencer_account_id', invoice.account_id)
      .single();

    return !!assignment;
  }

  return false;
}

/**
 * בדיקת הרשאה ל-Analytics
 */
function checkAnalyticsPermission(user: AuthUser, action: string): boolean {
  // רק influencer+ יכולים לצפות באנליטיקס
  return user.role !== 'follower';
}

/**
 * דרישת role מינימלי
 * זורק שגיאה אם המשתמש לא עומד בדרישה
 */
export async function requireRole(
  minRole: AppRole,
  request?: NextRequest
): Promise<AuthUser> {
  const user = await getCurrentUser(request);

  if (!user) {
    throw new AuthError('Unauthorized - user not authenticated', 401);
  }

  const roleHierarchy: Record<AppRole, number> = {
    follower: 0,
    influencer: 1,
    agent: 2,
    admin: 3,
  };

  if (roleHierarchy[user.role] < roleHierarchy[minRole]) {
    throw new AuthError(
      `Forbidden - requires role: ${minRole}`,
      403
    );
  }

  return user;
}

/**
 * בדיקת אם המשתמש הוא owner של account
 */
export async function isAccountOwner(
  user: AuthUser,
  accountId: string
): Promise<boolean> {
  if (user.role === 'admin') return true;
  return user.accountId === accountId;
}

/**
 * בדיקת אם agent מנהל את ה-influencer
 */
export async function isAgentOfInfluencer(
  agentUserId: string,
  influencerAccountId: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from('agent_influencers')
    .select('id')
    .eq('agent_id', agentUserId)
    .eq('influencer_account_id', influencerAccountId)
    .single();

  return !!data;
}

/**
 * Invalidate user cache (לאחר שינויים בהרשאות)
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  const cacheKey = `auth:user:${userId}`;
  await redis.del(cacheKey);
}

/**
 * Custom error class for auth errors
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Helper: שליפת כל ה-accounts של agent
 */
export async function getAgentInfluencerAccounts(
  agentUserId: string
): Promise<string[]> {
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from('agent_influencers')
    .select('influencer_account_id')
    .eq('agent_id', agentUserId);

  return data?.map((d) => d.influencer_account_id) || [];
}

/**
 * Helper function for influencer authentication in API routes
 * Returns either the authenticated account data or a NextResponse error
 */
export async function requireInfluencerAuth(
  request: Request
): Promise<
  | { accountId: string; userId: string }
  | import('next/server').NextResponse
> {
  const { NextResponse } = await import('next/server');
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Get the influencer account for this user
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id')
    .eq('owner_user_id', user.id)
    .eq('type', 'creator')
    .single();

  if (accountError || !account) {
    return NextResponse.json(
      { error: 'Influencer account not found' },
      { status: 404 }
    );
  }

  return {
    accountId: account.id,
    userId: user.id,
  };
}
