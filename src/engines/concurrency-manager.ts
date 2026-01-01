/**
 * ============================================
 * Concurrency Manager v1
 * ============================================
 * 
 * Handles session locking and version control.
 * Uses DB functions created in migration.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// Session Lock
// ============================================

export async function acquireLock(
  sessionId: string,
  requestId: string,
  ttlSeconds: number = 30
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('acquire_session_lock', {
      p_session_id: sessionId,
      p_request_id: requestId,
      p_ttl_seconds: ttlSeconds,
    });

    if (error) {
      console.error('[ConcurrencyManager] Lock acquire error:', error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error('[ConcurrencyManager] Lock acquire exception:', err);
    return false;
  }
}

export async function releaseLock(
  sessionId: string,
  requestId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('release_session_lock', {
      p_session_id: sessionId,
      p_request_id: requestId,
    });

    if (error) {
      console.error('[ConcurrencyManager] Lock release error:', error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error('[ConcurrencyManager] Lock release exception:', err);
    return false;
  }
}

// ============================================
// Version Control
// ============================================

export async function checkAndIncrementVersion(
  sessionId: string,
  expectedVersion: number
): Promise<number | null> {
  try {
    // Atomic update with version check
    const { data, error } = await supabase
      .from('chat_sessions')
      .update({ 
        version: expectedVersion + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('version', expectedVersion)
      .select('version')
      .single();

    if (error || !data) {
      console.warn('[ConcurrencyManager] Version mismatch or error:', error);
      return null;
    }

    return data.version;
  } catch (err) {
    console.error('[ConcurrencyManager] Version check exception:', err);
    return null;
  }
}

// ============================================
// Cleanup
// ============================================

export async function cleanupExpiredLocks(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('cleanup_expired_locks');

    if (error) {
      console.error('[ConcurrencyManager] Cleanup error:', error);
      return 0;
    }

    return data || 0;
  } catch (err) {
    console.error('[ConcurrencyManager] Cleanup exception:', err);
    return 0;
  }
}

// ============================================
// Lock Guard (Higher-level wrapper)
// ============================================

export async function withLock<T>(
  sessionId: string,
  requestId: string,
  fn: () => Promise<T>,
  options: { ttlSeconds?: number; retries?: number } = {}
): Promise<T> {
  const { ttlSeconds = 30, retries = 3 } = options;

  let acquired = false;
  let attempt = 0;

  while (!acquired && attempt < retries) {
    acquired = await acquireLock(sessionId, requestId, ttlSeconds);
    if (!acquired) {
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }

  if (!acquired) {
    throw new Error(`Failed to acquire lock for session ${sessionId} after ${retries} attempts`);
  }

  try {
    return await fn();
  } finally {
    await releaseLock(sessionId, requestId);
  }
}

