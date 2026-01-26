/**
 * Influencer Authentication Helper
 * 
 * מספק auth helper למשפיענים עם cookie authentication
 * עובד בלי RLS loop (לא משתמש ב-getCurrentUser)
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';

/**
 * בודק אם יש cookie auth למשפיען
 */
export async function checkInfluencerAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_session_${username}`);
  return authCookie?.value === 'authenticated';
}

/**
 * מחלץ username מה-request
 */
export function extractUsername(req: NextRequest): string | null {
  const { searchParams } = new URL(req.url);
  return searchParams.get('username');
}

/**
 * Helper מרכזי לauth של influencer API routes
 * 
 * @returns { authorized, username, influencer, response }
 * - authorized: האם יש הרשאה
 * - username: שם המשתמש
 * - influencer: אובייקט המשפיען מה-DB
 * - response: תגובה מוכנה במקרה של שגיאה (להחזיר ישירות)
 * 
 * @example
 * ```ts
 * const auth = await requireInfluencerAuth(req);
 * if (!auth.authorized) {
 *   return auth.response!;
 * }
 * // עכשיו אפשר להשתמש ב-auth.username ו-auth.influencer
 * ```
 */
export async function requireInfluencerAuth(req: NextRequest) {
  const username = extractUsername(req);

  if (!username) {
    return {
      authorized: false as const,
      username: null,
      influencer: null,
      response: NextResponse.json(
        { error: 'Username required' },
        { status: 400 }
      ),
    };
  }

  // Check cookie auth
  const isAuth = await checkInfluencerAuth(username);
  
  if (!isAuth) {
    return {
      authorized: false as const,
      username,
      influencer: null,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  // Get influencer from DB
  const influencer = await getInfluencerByUsername(username);
  
  if (!influencer) {
    return {
      authorized: false as const,
      username,
      influencer: null,
      response: NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      ),
    };
  }

  return {
    authorized: true as const,
    username,
    influencer,
    accountId: influencer.id, // For legacy influencers, account_id = influencer_id
    response: null,
  };
}

/**
 * בודק אם משפיען הוא בעלים של resource
 */
export async function verifyInfluencerOwnership(
  influencerId: string,
  resourceTable: string,
  resourceId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from(resourceTable)
      .select('account_id')
      .eq('id', resourceId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.account_id === influencerId;
  } catch {
    return false;
  }
}
