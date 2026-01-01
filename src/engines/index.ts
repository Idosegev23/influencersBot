/**
 * ============================================
 * Audience Interaction OS - Engine Pipeline v1
 * ============================================
 * 
 * Main entry point for message processing.
 * Orchestrates: Context → Understanding → Decision → Policy → Action
 */

// Re-export types
export * from './types';
export * from './context';
export * from './state-machine';
export * from './events';

// Engine components
export { buildContext, getAccountByInfluencerUsername, updateSessionState } from './context-builder';
export { acquireLock, releaseLock, withLock, checkAndIncrementVersion } from './concurrency-manager';
export { claimIdempotencyKey, completeIdempotencyKey, hashMessage, generateIdempotencyKey } from './idempotency';
export { emitEvent, emitEvents, generateTraceId, generateRequestId } from './events-emitter';

import { buildContext, updateSessionState } from './context-builder';
import { acquireLock, releaseLock } from './concurrency-manager';
import { claimIdempotencyKey, completeIdempotencyKey, hashMessage } from './idempotency';
import { emitEvent, generateTraceId, generateRequestId } from './events-emitter';
import type { 
  DecisionResult, 
  UnderstandingResult, 
  AccountMode,
  IntentType,
  ExtractedEntities,
  RiskFlags,
  UIDirectives,
  ModelStrategy,
  CostEstimate,
  ActionStep,
} from './types';
import type { EngineContext } from './context';

// ============================================
// Input/Output Types
// ============================================

export interface ProcessMessageInput {
  message: string;
  accountId: string;
  mode: AccountMode;
  sessionId?: string;
  previousResponseId?: string;
  expectedSessionVersion?: number;
  requestId?: string;
  traceId?: string;
  clientMessageId?: string;
}

export interface ProcessMessageOutput {
  response: string;
  decision: DecisionResult;
  sessionId: string;
  responseId?: string;
  traceId: string;
  requestId: string;
  context?: EngineContext;
}

// ============================================
// Main Pipeline
// ============================================

export async function processMessage(input: ProcessMessageInput): Promise<ProcessMessageOutput> {
  const startedAt = Date.now();
  const traceId = input.traceId || generateTraceId();
  const requestId = input.requestId || generateRequestId();
  
  // Generate idempotency key
  const messageHash = hashMessage(input.message);
  const idempotencyKey = `${input.accountId}:${input.sessionId || 'new'}:chat:${messageHash}`;

  // 1) Check idempotency
  const idempotencyClaim = await claimIdempotencyKey(idempotencyKey, requestId);
  if (!idempotencyClaim.allowed) {
    if (idempotencyClaim.cachedResult) {
      return idempotencyClaim.cachedResult as ProcessMessageOutput;
    }
    // Request is pending
    return {
      response: 'הבקשה בעיבוד, נסה שוב בעוד רגע.',
      decision: createStubDecision(idempotencyKey, traceId, requestId),
      sessionId: input.sessionId || '',
      traceId,
      requestId,
    };
  }

  let context: EngineContext | undefined;
  let lockAcquired = false;

  try {
    // 2) Build context (creates session if needed)
    context = await buildContext({
      accountId: input.accountId,
      mode: input.mode,
      sessionId: input.sessionId,
      previousResponseId: input.previousResponseId,
      traceId,
      requestId,
    });

    const sessionId = context.session.id;

    // 3) Acquire lock
    lockAcquired = await acquireLock(sessionId, requestId);
    if (!lockAcquired) {
      console.warn(`[Engine] Could not acquire lock for session ${sessionId}`);
      // Continue anyway for now, but log it
    }

    // 4) Emit message_received event
    await emitEvent({
      type: 'message_received',
      accountId: context.account.id,
      sessionId,
      mode: context.account.mode,
      payload: {
        messageLength: input.message.length,
        clientMessageId: input.clientMessageId,
      },
      metadata: {
        source: 'chat',
        engineVersion: 'v2',
        traceId,
        requestId,
      },
    });

    // 5) Understanding (STUB - will be replaced)
    const understanding = createStubUnderstanding(input.message);

    // 6) Decision (STUB - will be replaced)
    const decision = createStubDecision(idempotencyKey, traceId, requestId);

    // 7) Policy check (STUB - pass through for now)
    // Later: apply redactions, blocks, overrides

    // 8) Generate response (STUB)
    const responseText = generateStubResponse(input.message, context);

    // 9) Emit response_sent event
    await emitEvent({
      type: 'response_sent',
      accountId: context.account.id,
      sessionId,
      mode: context.account.mode,
      payload: {
        responseLength: responseText.length,
        handler: decision.handler,
        intent: understanding.intent,
      },
      metadata: {
        source: 'engine',
        engineVersion: 'v2',
        traceId,
        requestId,
        latencyMs: Date.now() - startedAt,
        idempotencyKey,
      },
    });

    // 10) Update session state
    await updateSessionState(sessionId, 'Chat.Active', true);

    // 11) Build output
    const output: ProcessMessageOutput = {
      response: responseText,
      decision,
      sessionId,
      traceId,
      requestId,
      context,
    };

    // 12) Complete idempotency
    await completeIdempotencyKey(idempotencyKey, output);

    return output;

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[Engine] processMessage error:', errorMessage);

    // Emit error event
    await emitEvent({
      type: 'error_occurred',
      accountId: input.accountId,
      sessionId: context?.session.id || input.sessionId || 'unknown',
      mode: input.mode,
      payload: {
        error: errorMessage,
        stage: 'processMessage',
      },
      metadata: {
        source: 'engine',
        engineVersion: 'v2',
        traceId,
        requestId,
        latencyMs: Date.now() - startedAt,
      },
    });

    const fallbackOutput: ProcessMessageOutput = {
      response: 'סליחה, קרתה תקלה. נסה שוב בעוד רגע.',
      decision: createStubDecision(idempotencyKey, traceId, requestId),
      sessionId: context?.session.id || input.sessionId || '',
      traceId,
      requestId,
    };

    await completeIdempotencyKey(idempotencyKey, fallbackOutput, 'failed');

    return fallbackOutput;

  } finally {
    // 13) Release lock
    if (lockAcquired && context?.session.id) {
      await releaseLock(context.session.id, requestId);
    }
  }
}

// ============================================
// Stub Functions (to be replaced with real implementations)
// ============================================

function createStubUnderstanding(message: string): UnderstandingResult {
  const lowerMessage = message.toLowerCase();
  
  // Simple keyword detection
  let intent: IntentType = 'general_chat';
  if (lowerMessage.includes('קופון') || lowerMessage.includes('הנחה')) {
    intent = 'coupon_request';
  } else if (lowerMessage.includes('בעיה') || lowerMessage.includes('תקלה') || lowerMessage.includes('שירות')) {
    intent = 'support_issue';
  } else if (lowerMessage.includes('מתכון') || lowerMessage.includes('אוכל')) {
    intent = 'content_request';
  } else if (lowerMessage.includes('שלום') || lowerMessage.includes('היי')) {
    intent = 'greeting';
  }

  const entities: ExtractedEntities = {
    brands: [],
    products: [],
    coupons: [],
    orderNumbers: [],
    phoneNumbers: [],
    dates: [],
    amounts: [],
    custom: {},
  };

  const risk: RiskFlags = {
    privacy: false,
    legal: false,
    medical: false,
    harassment: false,
    financial: false,
  };

  return {
    intent,
    confidence: 0.7,
    entities,
    topic: 'general',
    urgency: 'low',
    sentiment: 'neutral',
    isRepeat: false,
    ambiguity: [],
    suggestedClarifications: [],
    risk,
    requiresHuman: false,
    rawInput: message,
    processingTimeMs: 0,
  };
}

function createStubDecision(
  idempotencyKey: string,
  traceId: string,
  requestId: string
): DecisionResult {
  const uiDirectives: UIDirectives = {
    layout: 'chat',
    tone: 'casual',
    responseLength: 'standard',
  };

  const modelStrategy: ModelStrategy = {
    model: 'nano',
    maxTokens: 500,
    timeoutMs: 30000,
    retries: 2,
  };

  const costEstimate: CostEstimate = {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
    modelUsed: 'nano',
  };

  const actionPlan: ActionStep[] = [
    {
      type: 'send_response',
      payload: {},
      idempotencyScope: 'session',
    },
  ];

  return {
    decisionType: 'chat_response',
    handler: 'chat',
    priority: 5,
    actionPlan,
    responseStrategy: {
      type: 'direct',
      contextToInclude: ['account', 'session'],
    },
    uiDirectives,
    channel: 'chat',
    modelStrategy,
    securityLevel: 'public',
    costEstimate,
    reasoning: 'stub decision - engine v2 pipeline test',
    rulesApplied: [],
    idempotencyKey,
    traceId,
    requestId,
  };
}

function generateStubResponse(message: string, context: EngineContext): string {
  const lowerMessage = message.toLowerCase();
  
  // Simple response based on keywords
  if (lowerMessage.includes('שלום') || lowerMessage.includes('היי')) {
    return `היי! 👋 המערכת החדשה (v2 Engine) פועלת! מה אפשר לעזור?`;
  }
  
  if (lowerMessage.includes('קופון') || lowerMessage.includes('הנחה')) {
    return `אשמח לעזור עם קופונים! 🎟️ (Engine v2 stub - בקרוב תהיה כאן לוגיקה אמיתית)`;
  }
  
  if (lowerMessage.includes('בעיה') || lowerMessage.includes('תקלה')) {
    return `הבנתי שיש בעיה. 😊 (Engine v2 stub - Support flow יגיע בקרוב)`;
  }

  return `קיבלתי את ההודעה! 🚀 Engine v2 פועל. Session: ${context.session.id.slice(0, 8)}...`;
}
