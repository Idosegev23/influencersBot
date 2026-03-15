/**
 * POST /api/manage/auth
 * Validate management token and create session
 *
 * Body: { token: string }
 * Returns: { success, accountId, domain, displayName }
 */

import { NextResponse } from 'next/server';
import { validateToken, createManageSession, validateManageSession, clearManageSession } from '@/lib/manage/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, action } = body;

    // Logout
    if (action === 'logout') {
      await clearManageSession();
      return NextResponse.json({ success: true });
    }

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Validate token against accounts
    const result = await validateToken(token);
    if (!result) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Create session cookie
    await createManageSession(result.accountId, token);

    const config = result.config || {};
    return NextResponse.json({
      success: true,
      accountId: result.accountId,
      domain: config.widget?.domain || config.username || '',
      displayName: config.display_name || config.username || '',
    });
  } catch (error) {
    console.error('[ManageAuth] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/manage/auth
 * Check if current session is valid
 */
export async function GET() {
  try {
    const session = await validateManageSession();
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      accountId: session.accountId,
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
