/**
 * Admin authentication helper.
 * Shared by all /api/admin/* routes.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'bestieai_admin_session';

/**
 * Check admin cookie and return 401 response if not authenticated.
 * Usage:
 *   const denied = await requireAdminAuth();
 *   if (denied) return denied;
 */
export async function requireAdminAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  if (session?.value === 'authenticated') return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
