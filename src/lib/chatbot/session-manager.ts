/**
 * Session Manager - ניהול sessions אנונימיים לצ'אט
 * שמירת session ב-localStorage + DB
 */

import { randomUUID } from 'crypto';

// ============================================
// Generate Anonymous Session ID
// ============================================

export function generateAnonymousSession(): string {
  const timestamp = Date.now();
  const random = typeof window !== 'undefined' 
    ? Math.random().toString(36).substring(2, 15)
    : randomUUID().split('-')[0];
  
  return `anon_${timestamp}_${random}`;
}

// ============================================
// Initialize or Get Session
// ============================================

export async function initSession(username: string): Promise<string> {
  // Check if running in browser
  if (typeof window === 'undefined') {
    return generateAnonymousSession();
  }

  const storageKey = `chat_session_${username}`;
  
  // Try to get existing session from localStorage
  let sessionId = localStorage.getItem(storageKey);

  if (sessionId) {
    // Validate session still exists in DB
    try {
      const res = await fetch(`/api/chat/session/validate?sessionId=${sessionId}`);
      if (res.ok) {
        return sessionId;
      }
    } catch (error) {
      console.error('Session validation failed:', error);
    }
  }

  // Create new session
  sessionId = generateAnonymousSession();
  localStorage.setItem(storageKey, sessionId);

  // Create in database
  try {
    await fetch('/api/chat/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        username,
      }),
    });
  } catch (error) {
    console.error('Failed to create session in DB:', error);
  }

  return sessionId;
}

// ============================================
// Optional: Upgrade to Identified User
// ============================================

export async function upgradeSession(
  sessionId: string,
  email: string
): Promise<void> {
  try {
    await fetch('/api/chat/session/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        email,
      }),
    });
  } catch (error) {
    console.error('Failed to upgrade session:', error);
    throw error;
  }
}

// ============================================
// Clear Session (for logout/reset)
// ============================================

export function clearSession(username: string): void {
  if (typeof window === 'undefined') return;
  
  const storageKey = `chat_session_${username}`;
  localStorage.removeItem(storageKey);
}

// ============================================
// Check if follower (helper for upgrade)
// ============================================

export async function checkIfFollower(email: string, username: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/followers/check?email=${encodeURIComponent(email)}&username=${username}`);
    if (res.ok) {
      const data = await res.json();
      return data.isFollower || false;
    }
  } catch (error) {
    console.error('Failed to check follower status:', error);
  }
  
  return false;
}
