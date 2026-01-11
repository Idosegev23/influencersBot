// AI Parser Main Entry Point
// Handles multi-model fallback strategy

import { parseWithGemini } from './gemini';
import { CONFIDENCE_THRESHOLD } from './types';
import type { ParseOptions, ParseResult } from './types';

/**
 * Parse document with multi-model fallback
 * 
 * Strategy:
 * 1. Try Gemini 1.5 Pro (Google) - cheapest, fastest
 * 2. If fails or low confidence, try Claude 3.5 Sonnet (Anthropic)
 * 3. If fails or low confidence, try GPT-4o Vision (OpenAI)
 * 4. If all fail, flag for manual review
 */
export async function parseDocument(options: ParseOptions): Promise<ParseResult> {
  console.log(`[AI Parser] Starting document parsing: ${options.file.name}`);
  console.log(`[AI Parser] Type: ${options.documentType}, Language: ${options.language || 'auto'}`);

  const parsers = [
    { name: 'gemini', fn: parseWithGemini },
    // { name: 'claude', fn: parseWithClaude }, // TODO: Add when needed
    // { name: 'openai', fn: parseWithOpenAI }, // TODO: Add when needed
  ];

  for (let i = 0; i < parsers.length; i++) {
    const parser = parsers[i];

    try {
      console.log(`[AI Parser] 🔄 Attempt ${i + 1}/${parsers.length}: Trying ${parser.name}...`);

      const result = await parser.fn(options);

      if (result.success && result.confidence >= CONFIDENCE_THRESHOLD) {
        console.log(`[AI Parser] ✅ Success with ${parser.name}!`);
        console.log(`[AI Parser] Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`[AI Parser] Duration: ${result.duration_ms}ms`);

        return {
          ...result,
          model: parser.name as any,
          attemptNumber: i + 1,
        };
      }

      if (result.success && result.confidence < CONFIDENCE_THRESHOLD) {
        console.log(
          `[AI Parser] ⚠️ ${parser.name} succeeded but confidence too low: ${(result.confidence * 100).toFixed(1)}%`
        );
        // Continue to next model
      } else {
        console.log(`[AI Parser] ❌ ${parser.name} failed: ${result.error}`);
      }

    } catch (error: any) {
      console.error(`[AI Parser] ❌ ${parser.name} error:`, error);
      // Continue to next model
    }
  }

  // All AI models failed
  console.log('[AI Parser] ❌ All AI models failed or returned low confidence.');
  console.log('[AI Parser] 📝 Flagging for manual review...');

  return {
    success: false,
    data: null,
    confidence: 0,
    model: 'manual',
    attemptNumber: parsers.length + 1,
    error: 'All AI models failed. Manual review required.',
  };
}

/**
 * Parse multiple documents
 */
export async function parseMultipleDocuments(
  optionsArray: ParseOptions[]
): Promise<ParseResult[]> {
  console.log(`[AI Parser] Parsing ${optionsArray.length} documents...`);

  const results = await Promise.all(
    optionsArray.map(options => parseDocument(options))
  );

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`[AI Parser] ✅ Completed: ${successful} succeeded, ${failed} need manual review`);

  return results;
}

/**
 * Merge parsed documents into single partnership object
 * 
 * This combines data from quote, contract, brief into one unified structure
 */
export function mergeDocuments(results: ParseResult[]): any {
  console.log(`[AI Parser] Merging ${results.length} parsed documents...`);

  const merged: any = {
    // Core partnership info
    brandName: null,
    campaignName: null,
    totalAmount: null,
    currency: 'ILS',
    
    // Dates
    startDate: null,
    endDate: null,
    signedDate: null,
    expiryDate: null,
    
    // Details
    deliverables: [],
    paymentMilestones: [],
    tasks: [],
    
    // Metadata
    parsedFrom: [] as string[],
    confidence: 0,
  };

  let totalConfidence = 0;
  let successCount = 0;

  for (const result of results) {
    if (!result.success || !result.data) continue;

    successCount++;
    totalConfidence += result.confidence;

    const data = result.data;

    // Quote data
    if (data.brandName) merged.brandName = data.brandName;
    if (data.campaignName) merged.campaignName = data.campaignName;
    if (data.totalAmount) merged.totalAmount = data.totalAmount;
    if (data.currency) merged.currency = data.currency;
    
    if (data.timeline?.startDate) merged.startDate = data.timeline.startDate;
    if (data.timeline?.endDate) merged.endDate = data.timeline.endDate;
    
    if (data.deliverables?.length) {
      merged.deliverables.push(...data.deliverables);
    }
    
    if (data.paymentTerms?.milestones?.length) {
      merged.paymentMilestones.push(...data.paymentTerms.milestones);
    }

    // Contract data
    if (data.signedDate) merged.signedDate = data.signedDate;
    if (data.expiryDate) merged.expiryDate = data.expiryDate;
    if (data.parties?.brand) merged.brandName = data.parties.brand;
    
    if (data.exclusivity) merged.exclusivity = data.exclusivity;
    if (data.terminationClauses) merged.terminationClauses = data.terminationClauses;

    // Brief data
    if (data.campaignGoal) merged.campaignGoal = data.campaignGoal;
    if (data.targetAudience) merged.targetAudience = data.targetAudience;
    if (data.keyMessages) merged.keyMessages = data.keyMessages;
    
    if (data.tasks?.length) {
      merged.tasks.push(...data.tasks);
    }

    // Track what we parsed from
    merged.parsedFrom.push(result.model);
  }

  // Calculate average confidence
  merged.confidence = successCount > 0 ? totalConfidence / successCount : 0;

  // Deduplicate deliverables and tasks
  merged.deliverables = deduplicateArray(merged.deliverables, 'description');
  merged.tasks = deduplicateArray(merged.tasks, 'title');

  console.log(`[AI Parser] ✅ Merge complete! Overall confidence: ${(merged.confidence * 100).toFixed(1)}%`);

  return merged;
}

/**
 * Deduplicate array by key
 */
function deduplicateArray(arr: any[], key: string): any[] {
  const seen = new Set();
  return arr.filter(item => {
    const val = item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

// Re-export types and utils
export * from './types';
export * from './utils';
export { parseWithGemini };

