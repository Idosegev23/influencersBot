/**
 * Management Auth System
 * Magic Link token-based authentication for website owners
 */

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

const COOKIE_NAME = 'manage_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// ============================================
// Token Generation
// ============================================

export function generateManagementToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================
// Session Validation
// ============================================

export interface ManageSession {
  accountId: string;
  token: string;
}

/**
 * Validate management session from cookie.
 * Returns accountId if valid, null if not.
 */
export async function validateManageSession(): Promise<ManageSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);

    if (!sessionCookie?.value) return null;

    const session: ManageSession = JSON.parse(sessionCookie.value);
    if (!session.accountId || !session.token) return null;

    // Verify token still matches the account
    const supabase = await createClient();
    const { data: account } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('id', session.accountId)
      .single();

    if (!account) return null;

    const storedToken = account.config?.widget?.managementToken;
    if (!storedToken || storedToken !== session.token) return null;

    return session;
  } catch {
    return null;
  }
}

/**
 * Validate a raw token (for initial magic link access).
 * Returns accountId if valid.
 */
export async function validateToken(token: string): Promise<{ accountId: string; config: any } | null> {
  try {
    const supabase = await createClient();

    // Search for account with this management token
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('status', 'active');

    if (!accounts) return null;

    // Find the account whose widget.managementToken matches
    const account = accounts.find(
      (a: any) => a.config?.widget?.managementToken === token
    );

    if (!account) return null;

    return { accountId: account.id, config: account.config };
  } catch {
    return null;
  }
}

/**
 * Create a management session cookie.
 */
export async function createManageSession(accountId: string, token: string): Promise<void> {
  const cookieStore = await cookies();
  const session: ManageSession = { accountId, token };

  cookieStore.set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Clear management session.
 */
export async function clearManageSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
