/**
 * API: Get Account Status & Resume Recommendation
 * בודק מצב חשבון ומחזיר המלצה מה לעשות הלאה
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAccountStatus } from '@/lib/scraping/resumeHelper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/accounts/status?username=xxx
 * Check account status and get resume recommendation
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Missing username' },
        { status: 400 }
      );
    }

    const status = await checkAccountStatus(username);

    if (!status) {
      // Account doesn't exist
      return NextResponse.json({
        success: true,
        exists: false,
        username,
      });
    }

    // Account exists
    return NextResponse.json({
      success: true,
      exists: true,
      ...status,
    });

  } catch (error: any) {
    console.error('[Account Status API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
