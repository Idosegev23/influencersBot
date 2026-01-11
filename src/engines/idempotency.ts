/**
 * ============================================
 * Idempotency Manager v1
 * ============================================
 * 
 * Prevents duplicate action execution.
 * Uses DB functions created in migration.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// Types
// ============================================

export interface IdempotencyClaimResult {
  allowed: boolean;
  cachedResult?: unknown;
  status?: 'pending' | 'done' | 'failed';
}

// ============================================
// Claim Key
// ============================================

export async function claimIdempotencyKey(
  key: string,
  requestId: string = `req_${Date.now()}`,
  ttlSeconds: number = 300
): Promise<IdempotencyClaimResult> {
  try {
    const { data, error } = await supabase.rpc('claim_idempotency_key', {
      p_key: key,
      p_request_id: requestId,
      p_ttl_seconds: ttlSeconds,
    });

    if (error) {
      console.error('[Idempotency] Claim error:', error);
      // On error, allow the request to proceed (fail open)
      return { allowed: true };
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (result?.claimed) {
      return { allowed: true };
    }

    // Key exists
    if (result?.existing_status === 'done' && result?.existing_result) {
      return {
        allowed: false,
        cachedResult: result.existing_result,
        status: 'done',
      };
    }

    if (result?.existing_status === 'pending') {
      return {
        allowed: false,
        status: 'pending',
      };
    }

    if (result?.existing_status === 'failed') {
      // Allow retry on failed
      return { allowed: true };
    }

    return { allowed: true };
  } catch (err) {
    console.error('[Idempotency] Claim exception:', err);
    // Fail open
    return { allowed: true };
  }
}

// ============================================
// Complete Key
// ============================================

export async function completeIdempotencyKey(
  key: string,
  result: unknown,
  status: 'done' | 'failed' = 'done'
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('complete_idempotency_key', {
      p_key: key,
      p_status: status,
      p_result: result,
    });

    if (error) {
      console.error('[Idempotency] Complete error:', error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error('[Idempotency] Complete exception:', err);
    return false;
  }
}

// ============================================
// Generate Key
// ============================================

export function generateIdempotencyKey(
  accountId: string,
  sessionId: string,
  decisionType: string,
  state: string,
  messageHash: string
): string {
  return `${accountId}:${sessionId}:${decisionType}:${state}:${messageHash}`;
}

export function hashMessage(message: string): string {
  let h = 0;
  for (let i = 0; i < message.length; i++) {
    h = (h * 31 + message.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}



