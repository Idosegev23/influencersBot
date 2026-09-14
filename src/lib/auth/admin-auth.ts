/**
 * Admin authentication helper.
 * Shared by all /api/admin/* routes.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'crypto';
import { verifySessionToken, ADMIN_SUBJECT } from '@/lib/auth/session-token';

const COOKIE_NAME = 'bestieai_admin_session';

/**
 * True only when ADMIN_PASSWORD is configured and `candidate` equals it.
 *
 * Deliberately has NO default. Routes used `process.env.ADMIN_PASSWORD || '123456'`,
 * so an environment that forgot the variable shipped a guessable admin login.
 * Unset (or empty) now means password login is off.
 */
export function isAdminPassword(candidate: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof candidate !== 'string' || candidate.length === 0) return false;
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Check admin cookie and return 401 response if not authenticated.
 * Usage:
 *   const denied = await requireAdminAuth();
 *   if (denied) return denied;
 */
export async function requireAdminAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  if (verifySessionToken(session?.value, ADMIN_SUBJECT)) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
