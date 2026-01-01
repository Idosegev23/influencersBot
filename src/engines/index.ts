/**
 * ============================================
 * Audience Interaction OS - Engine Exports
 * ============================================
 * 
 * Central export for all engine types and interfaces.
 * 
 * Usage:
 *   import { DecisionResult, EngineContext, processMessage } from '@/engines';
 */

// Types
export * from './types';

// Context
export * from './context';

// State Machine
export * from './state-machine';

// Events
export * from './events';

// ============================================
// Main Entry Point (to be implemented)
// ============================================

import type { ProcessMessageInput, ProcessMessageOutput } from './types';

/**
 * Process an incoming message through all engines
 * 
 * Flow:
 * 1. Load context
 * 2. Acquire session lock
 * 3. Understanding Engine → UnderstandingResult
 * 4. Decision Engine → DecisionResult
 * 5. Policy Engine → PolicyCheckResult
 * 6. Action Engine → ActionResult
 * 7. Release lock
 * 8. Return response
 */
export async function processMessage(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _input: ProcessMessageInput
): Promise<ProcessMessageOutput> {
  // TODO: Implement engine pipeline
  throw new Error('Engine pipeline not implemented yet');
}

