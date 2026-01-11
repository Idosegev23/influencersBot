/**
 * ============================================
 * Events Emitter v1
 * ============================================
 * 
 * Emits events to the events table for Event Sourcing.
 */

import { createClient } from '@supabase/supabase-js';
import type { EventType, EventCategory, EVENT_CATEGORIES, AccountMode } from './events';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// Event Categories Map
// ============================================

const CATEGORY_MAP: Record<string, EventCategory> = {
  // Interaction
  'message_received': 'interaction',
  'quick_action_clicked': 'interaction',
  'form_submitted': 'interaction',
  'file_uploaded': 'interaction',
  
  // Understanding
  'intent_detected': 'understanding',
  'entities_extracted': 'understanding',
  'ambiguity_detected': 'understanding',
  'risk_flagged': 'understanding',
  'topic_classified': 'understanding',
  
  // Decision
  'decision_made': 'decision',
  'rule_applied': 'decision',
  'rule_skipped': 'decision',
  'policy_checked': 'decision',
  'policy_blocked': 'decision',
  'policy_warning': 'decision',
  
  // State
  'state_changed': 'state',
  'flow_started': 'state',
  'flow_completed': 'state',
  'flow_cancelled': 'state',
  'flow_timeout': 'state',
  
  // Action
  'response_sent': 'action',
  'notification_sent': 'action',
  'notification_failed': 'action',
  'support_ticket_created': 'action',
  'sale_initiated': 'action',
  'webhook_triggered': 'action',
  
  // Escalation
  'escalation_triggered': 'escalation',
  'escalation_accepted': 'escalation',
  'escalation_resolved': 'escalation',
  
  // Cost
  'tokens_consumed': 'cost',
  'cost_threshold_warning': 'cost',
  'cost_threshold_exceeded': 'cost',
  'rate_limit_hit': 'cost',
  
  // Outcome
  'coupon_copied': 'outcome',
  'link_clicked': 'outcome',
  'product_viewed': 'outcome',
  'support_resolved': 'outcome',
  'user_satisfied': 'outcome',
  'user_unsatisfied': 'outcome',
  'conversation_abandoned': 'outcome',
  'conversation_completed': 'outcome',
  
  // System
  'session_started': 'system',
  'session_resumed': 'system',
  'session_expired': 'system',
  'error_occurred': 'system',
  'lock_acquired': 'system',
  'lock_released': 'system',
  'lock_timeout': 'system',
};

// ============================================
// Types
// ============================================

export interface EmitEventInput {
  type: EventType | string;
  accountId: string;
  sessionId: string;
  mode: AccountMode;
  payload: Record<string, unknown>;
  metadata: {
    source: string;
    engineVersion: string;
    traceId: string;
    requestId: string;
    cost?: number;
    tokensUsed?: number;
    latencyMs?: number;
    idempotencyKey?: string;
    [key: string]: unknown;
  };
}

// ============================================
// Emit Event
// ============================================

export async function emitEvent(input: EmitEventInput): Promise<string | null> {
  const { type, accountId, sessionId, mode, payload, metadata } = input;
  
  const category = CATEGORY_MAP[type] || 'system';
  
  // Redact PII from payload
  const safePayload = redactPII(payload);
  
  try {
    const { data, error } = await supabase
      .from('events')
      .insert({
        type,
        category,
        account_id: accountId,
        session_id: sessionId,
        mode,
        payload: safePayload,
        metadata,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[EventsEmitter] Insert error:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[EventsEmitter] Insert exception:', err);
    return null;
  }
}

// ============================================
// Emit Batch
// ============================================

export async function emitEvents(events: EmitEventInput[]): Promise<string[]> {
  const records = events.map(input => ({
    type: input.type,
    category: CATEGORY_MAP[input.type] || 'system',
    account_id: input.accountId,
    session_id: input.sessionId,
    mode: input.mode,
    payload: redactPII(input.payload),
    metadata: input.metadata,
  }));

  try {
    const { data, error } = await supabase
      .from('events')
      .insert(records)
      .select('id');

    if (error) {
      console.error('[EventsEmitter] Batch insert error:', error);
      return [];
    }

    return (data || []).map(r => r.id);
  } catch (err) {
    console.error('[EventsEmitter] Batch insert exception:', err);
    return [];
  }
}

// ============================================
// PII Redaction
// ============================================

const PII_FIELDS = ['phone', 'email', 'orderNumber', 'address', 'fullName', 'customerPhone'];

function redactPII(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(payload)) {
    if (PII_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      if (typeof value === 'string') {
        result[key] = maskString(value);
      } else {
        result[key] = '[REDACTED]';
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactPII(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

function maskString(value: string): string {
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

// ============================================
// Trace ID Generation
// ============================================

export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}



