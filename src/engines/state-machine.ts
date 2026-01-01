/**
 * ============================================
 * State Machine v2 P0
 * ============================================
 * 
 * Hierarchical state machine for conversation flows.
 * 
 * RULES:
 * 1. session.state is ALWAYS a single, concrete state
 * 2. States are hierarchical (Chat.Active, Support.CollectPhone)
 * 3. Events trigger transitions, they are NOT states
 * 4. Guards must pass before transition
 * 5. Concurrency is handled via locks and version checks
 */

import type { EngineContext } from './context';

// ============================================
// Conversation States (Hierarchical)
// ============================================

/**
 * State naming convention:
 * - Top level: PascalCase (Idle, Chat, Support, Sales)
 * - Sub-state: Parent.Child (Support.CollectBrand)
 * - Terminal: Parent.Complete or just Complete
 */
export type ConversationState =
  // Idle - waiting for input
  | 'Idle'
  
  // Chat flow
  | 'Chat.Active'
  | 'Chat.Clarifying'
  | 'Chat.WaitingForHuman'
  
  // Support flow
  | 'Support.CollectBrand'
  | 'Support.CollectName'
  | 'Support.CollectOrder'
  | 'Support.CollectProblem'
  | 'Support.CollectPhone'
  | 'Support.Confirming'
  | 'Support.Sending'
  | 'Support.Complete'
  | 'Support.Cancelled'
  
  // Sales flow
  | 'Sales.Browsing'
  | 'Sales.Recommending'
  | 'Sales.Comparing'
  | 'Sales.Checkout'
  | 'Sales.Complete'
  
  // Terminal states
  | 'Complete'
  | 'Error';

// ============================================
// State Metadata
// ============================================

export interface StateMetadata {
  state: ConversationState;
  parent?: string;                // e.g., 'Support' for 'Support.CollectBrand'
  isTerminal: boolean;
  allowsInput: boolean;           // Can receive user messages
  timeoutMs?: number;             // Auto-transition after timeout
  timeoutTarget?: ConversationState;
}

export const STATE_METADATA: Record<ConversationState, StateMetadata> = {
  'Idle': { 
    state: 'Idle', 
    isTerminal: false, 
    allowsInput: true 
  },
  
  // Chat states
  'Chat.Active': { 
    state: 'Chat.Active', 
    parent: 'Chat', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Chat.Clarifying': { 
    state: 'Chat.Clarifying', 
    parent: 'Chat', 
    isTerminal: false, 
    allowsInput: true,
    timeoutMs: 300000,            // 5 min timeout
    timeoutTarget: 'Idle'
  },
  'Chat.WaitingForHuman': { 
    state: 'Chat.WaitingForHuman', 
    parent: 'Chat', 
    isTerminal: false, 
    allowsInput: false 
  },
  
  // Support states
  'Support.CollectBrand': { 
    state: 'Support.CollectBrand', 
    parent: 'Support', 
    isTerminal: false, 
    allowsInput: true,
    timeoutMs: 600000,            // 10 min timeout
    timeoutTarget: 'Support.Cancelled'
  },
  'Support.CollectName': { 
    state: 'Support.CollectName', 
    parent: 'Support', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Support.CollectOrder': { 
    state: 'Support.CollectOrder', 
    parent: 'Support', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Support.CollectProblem': { 
    state: 'Support.CollectProblem', 
    parent: 'Support', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Support.CollectPhone': { 
    state: 'Support.CollectPhone', 
    parent: 'Support', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Support.Confirming': { 
    state: 'Support.Confirming', 
    parent: 'Support', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Support.Sending': { 
    state: 'Support.Sending', 
    parent: 'Support', 
    isTerminal: false, 
    allowsInput: false            // System processing
  },
  'Support.Complete': { 
    state: 'Support.Complete', 
    parent: 'Support', 
    isTerminal: true, 
    allowsInput: false 
  },
  'Support.Cancelled': { 
    state: 'Support.Cancelled', 
    parent: 'Support', 
    isTerminal: true, 
    allowsInput: false 
  },
  
  // Sales states
  'Sales.Browsing': { 
    state: 'Sales.Browsing', 
    parent: 'Sales', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Sales.Recommending': { 
    state: 'Sales.Recommending', 
    parent: 'Sales', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Sales.Comparing': { 
    state: 'Sales.Comparing', 
    parent: 'Sales', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Sales.Checkout': { 
    state: 'Sales.Checkout', 
    parent: 'Sales', 
    isTerminal: false, 
    allowsInput: true 
  },
  'Sales.Complete': { 
    state: 'Sales.Complete', 
    parent: 'Sales', 
    isTerminal: true, 
    allowsInput: false 
  },
  
  // Terminal
  'Complete': { 
    state: 'Complete', 
    isTerminal: true, 
    allowsInput: false 
  },
  'Error': { 
    state: 'Error', 
    isTerminal: true, 
    allowsInput: false 
  },
};

// ============================================
// Transition Triggers (Events - NOT states!)
// ============================================

export type TransitionTrigger =
  // User actions
  | 'message_received'
  | 'quick_action_selected'
  | 'brand_selected'
  | 'form_submitted'
  | 'cancelled'
  
  // System actions
  | 'intent_detected_support'
  | 'intent_detected_sales'
  | 'intent_detected_chat'
  | 'intent_ambiguous'
  | 'validation_passed'
  | 'validation_failed'
  | 'action_completed'
  | 'action_failed'
  | 'timeout'
  
  // Escalation
  | 'escalate_to_human'
  | 'human_responded';

// ============================================
// Guards
// ============================================

export type GuardType = 
  | 'version_check'      // Optimistic concurrency
  | 'permission'         // User has permission
  | 'condition'          // Custom condition
  | 'rate_limit'         // Not rate limited
  | 'budget';            // Has budget remaining

export interface Guard {
  type: GuardType;
  name: string;
  check: (context: EngineContext, payload?: unknown) => boolean | Promise<boolean>;
  errorMessage?: string;
}

// ============================================
// Transition Actions
// ============================================

export type TransitionActionType =
  | 'acquire_lock'
  | 'release_lock'
  | 'increment_version'
  | 'emit_event'
  | 'update_context'
  | 'clear_data'
  | 'log';

export interface TransitionAction {
  type: TransitionActionType;
  payload?: Record<string, unknown>;
}

// ============================================
// State Transition Definition
// ============================================

export interface StateTransition {
  from: ConversationState | ConversationState[];  // Can be array for shared transitions
  to: ConversationState;
  trigger: TransitionTrigger;
  guards: Guard[];
  actions: TransitionAction[];
  priority?: number;              // Lower = higher priority for same trigger
}

// ============================================
// Transition Definitions
// ============================================

/**
 * Standard guards used across transitions
 */
export const STANDARD_GUARDS: Record<string, Guard> = {
  versionCheck: {
    type: 'version_check',
    name: 'Session Version Check',
    check: (ctx) => true,         // Implemented in state machine
    errorMessage: 'Session was modified by another request',
  },
  hasLock: {
    type: 'condition',
    name: 'Has Session Lock',
    check: (ctx) => true,         // Implemented in state machine
    errorMessage: 'Could not acquire session lock',
  },
  notRateLimited: {
    type: 'rate_limit',
    name: 'Rate Limit Check',
    check: (ctx) => ctx.limits.rateLimitRemaining > 0,
    errorMessage: 'Rate limit exceeded',
  },
  hasBudget: {
    type: 'budget',
    name: 'Budget Check',
    check: (ctx) => ctx.limits.costUsed < ctx.limits.costCeiling,
    errorMessage: 'Budget exceeded',
  },
};

/**
 * Core transitions - extend as needed
 */
export const TRANSITIONS: StateTransition[] = [
  // Idle → Chat/Support/Sales (based on intent)
  {
    from: 'Idle',
    to: 'Chat.Active',
    trigger: 'intent_detected_chat',
    guards: [STANDARD_GUARDS.versionCheck, STANDARD_GUARDS.notRateLimited],
    actions: [
      { type: 'acquire_lock' },
      { type: 'increment_version' },
      { type: 'emit_event', payload: { type: 'state_changed' } },
    ],
  },
  {
    from: 'Idle',
    to: 'Support.CollectBrand',
    trigger: 'intent_detected_support',
    guards: [STANDARD_GUARDS.versionCheck, STANDARD_GUARDS.notRateLimited],
    actions: [
      { type: 'acquire_lock' },
      { type: 'increment_version' },
      { type: 'emit_event', payload: { type: 'support_flow_started' } },
    ],
  },
  {
    from: 'Idle',
    to: 'Sales.Browsing',
    trigger: 'intent_detected_sales',
    guards: [STANDARD_GUARDS.versionCheck, STANDARD_GUARDS.notRateLimited],
    actions: [
      { type: 'acquire_lock' },
      { type: 'increment_version' },
      { type: 'emit_event', payload: { type: 'sales_flow_started' } },
    ],
  },
  
  // Support flow transitions
  {
    from: 'Support.CollectBrand',
    to: 'Support.CollectName',
    trigger: 'brand_selected',
    guards: [STANDARD_GUARDS.versionCheck],
    actions: [{ type: 'increment_version' }],
  },
  {
    from: 'Support.CollectName',
    to: 'Support.CollectOrder',
    trigger: 'form_submitted',
    guards: [STANDARD_GUARDS.versionCheck],
    actions: [{ type: 'increment_version' }],
  },
  {
    from: 'Support.CollectOrder',
    to: 'Support.CollectProblem',
    trigger: 'form_submitted',
    guards: [STANDARD_GUARDS.versionCheck],
    actions: [{ type: 'increment_version' }],
  },
  {
    from: 'Support.CollectProblem',
    to: 'Support.CollectPhone',
    trigger: 'form_submitted',
    guards: [STANDARD_GUARDS.versionCheck],
    actions: [{ type: 'increment_version' }],
  },
  {
    from: 'Support.CollectPhone',
    to: 'Support.Sending',
    trigger: 'validation_passed',
    guards: [STANDARD_GUARDS.versionCheck],
    actions: [{ type: 'increment_version' }],
  },
  {
    from: 'Support.Sending',
    to: 'Support.Complete',
    trigger: 'action_completed',
    guards: [],
    actions: [
      { type: 'release_lock' },
      { type: 'emit_event', payload: { type: 'support_completed' } },
    ],
  },
  
  // Cancel from any support state
  {
    from: [
      'Support.CollectBrand',
      'Support.CollectName',
      'Support.CollectOrder',
      'Support.CollectProblem',
      'Support.CollectPhone',
    ],
    to: 'Support.Cancelled',
    trigger: 'cancelled',
    guards: [],
    actions: [
      { type: 'release_lock' },
      { type: 'clear_data' },
      { type: 'emit_event', payload: { type: 'support_cancelled' } },
    ],
  },
  
  // Back to idle from terminal states
  {
    from: ['Support.Complete', 'Support.Cancelled', 'Sales.Complete', 'Complete'],
    to: 'Idle',
    trigger: 'message_received',
    guards: [STANDARD_GUARDS.notRateLimited],
    actions: [{ type: 'clear_data' }],
  },
  
  // Human escalation from any active state
  {
    from: ['Chat.Active', 'Chat.Clarifying'],
    to: 'Chat.WaitingForHuman',
    trigger: 'escalate_to_human',
    guards: [],
    actions: [{ type: 'emit_event', payload: { type: 'escalation_triggered' } }],
  },
];

// ============================================
// State Machine Interface
// ============================================

export interface StateMachine {
  /**
   * Get current state for session
   */
  getCurrentState(sessionId: string): Promise<ConversationState>;
  
  /**
   * Attempt transition
   * Returns new state if successful, null if guards failed
   */
  transition(
    sessionId: string,
    trigger: TransitionTrigger,
    context: EngineContext,
    payload?: unknown
  ): Promise<ConversationState | null>;
  
  /**
   * Get allowed transitions from current state
   */
  getAllowedTransitions(state: ConversationState): TransitionTrigger[];
  
  /**
   * Check if transition is valid (without executing)
   */
  canTransition(
    state: ConversationState,
    trigger: TransitionTrigger,
    context: EngineContext
  ): Promise<boolean>;
  
  /**
   * Get parent flow for a state
   */
  getParentFlow(state: ConversationState): string | null;
}

// ============================================
// Concurrency Control
// ============================================

export interface ConcurrencyManager {
  /**
   * Acquire lock for session
   * Returns lock ID if successful, null if already locked
   */
  acquireLock(sessionId: string, requestId: string, ttlMs?: number): Promise<string | null>;
  
  /**
   * Release lock
   * Only succeeds if caller owns the lock
   */
  releaseLock(sessionId: string, lockId: string): Promise<boolean>;
  
  /**
   * Check and update version atomically
   * Returns new version if successful, null if version mismatch
   */
  checkAndIncrementVersion(sessionId: string, expectedVersion: number): Promise<number | null>;
  
  /**
   * Clean up expired locks
   */
  cleanupExpiredLocks(): Promise<number>;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get flow name from state
 */
export function getFlowFromState(state: ConversationState): string {
  const meta = STATE_METADATA[state];
  return meta?.parent || state.split('.')[0] || 'Unknown';
}

/**
 * Check if state is in a specific flow
 */
export function isInFlow(state: ConversationState, flow: string): boolean {
  return getFlowFromState(state) === flow;
}

/**
 * Check if state is terminal
 */
export function isTerminalState(state: ConversationState): boolean {
  return STATE_METADATA[state]?.isTerminal ?? false;
}

/**
 * Check if state accepts user input
 */
export function canReceiveInput(state: ConversationState): boolean {
  return STATE_METADATA[state]?.allowsInput ?? false;
}

