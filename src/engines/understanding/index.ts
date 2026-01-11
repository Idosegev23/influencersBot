/**
 * ============================================
 * Understanding Engine v1
 * ============================================
 * 
 * Uses OpenAI gpt-5-nano to analyze messages and extract:
 * - Intent
 * - Entities
 * - Sentiment
 * - Risk flags
 * - Route hints
 */

import OpenAI from 'openai';
import { SYSTEM_PROMPT, DEVELOPER_PROMPT, USER_PROMPT, OUTPUT_SCHEMA } from './prompt';
import type { UnderstandingResult, UnderstandMessageInput, SimpleIntent, ExtractedEntities, RiskFlags, RouteHints } from './types';

// Re-export types
export * from './types';

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model configuration
const UNDERSTANDING_MODEL = 'gpt-5-nano'; // Fast and cheap for understanding
const FALLBACK_MODEL = 'gpt-5';           // Fallback if nano fails

/**
 * Main entry point for Understanding Engine
 */
export async function understandMessage(input: UnderstandMessageInput): Promise<UnderstandingResult> {
  const startTime = Date.now();
  
  try {
    // Try with nano model first
    const result = await callUnderstandingAPI(input, UNDERSTANDING_MODEL);
    return {
      ...result,
      rawInput: input.message,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.warn('[Understanding] Nano model failed, trying fallback:', error);
    
    try {
      // Fallback to standard model
      const result = await callUnderstandingAPI(input, FALLBACK_MODEL);
      return {
        ...result,
        rawInput: input.message,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (fallbackError) {
      console.error('[Understanding] Fallback also failed:', fallbackError);
      
      // Return safe default
      return createDefaultResult(input.message, Date.now() - startTime);
    }
  }
}

/**
 * Call OpenAI API for understanding
 */
async function callUnderstandingAPI(
  input: UnderstandMessageInput,
  model: string
): Promise<Omit<UnderstandingResult, 'rawInput' | 'processingTimeMs'>> {
  const developerContext = DEVELOPER_PROMPT({
    mode: input.mode,
    brands: input.brands,
  });

  const response = await openai.responses.create({
    model,
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'developer', content: developerContext },
      { role: 'user', content: USER_PROMPT(input.message) },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'understanding_result',
        schema: OUTPUT_SCHEMA,
        strict: true,
      },
    },
  });

  // Extract the text content
  const textOutput = response.output.find(item => item.type === 'message');
  if (!textOutput || textOutput.type !== 'message') {
    throw new Error('No text output from understanding API');
  }

  const content = textOutput.content.find(c => c.type === 'output_text');
  if (!content || content.type !== 'output_text') {
    throw new Error('No output_text content from understanding API');
  }

  const parsed = JSON.parse(content.text);
  return validateAndNormalize(parsed);
}

/**
 * Validate and normalize the API response
 */
function validateAndNormalize(
  raw: Record<string, unknown>
): Omit<UnderstandingResult, 'rawInput' | 'processingTimeMs'> {
  // Validate intent
  const validIntents: SimpleIntent[] = ['general', 'support', 'sales', 'coupon', 'handoff_human', 'abuse', 'unknown'];
  const intent = validIntents.includes(raw.intent as SimpleIntent) 
    ? (raw.intent as SimpleIntent) 
    : 'unknown';

  // Validate confidence
  const confidence = typeof raw.confidence === 'number' 
    ? Math.min(1, Math.max(0, raw.confidence)) 
    : 0.5;

  // Validate entities
  const rawEntities = raw.entities as Record<string, unknown> || {};
  const entities: ExtractedEntities = {
    brands: Array.isArray(rawEntities.brands) ? rawEntities.brands : [],
    coupons: Array.isArray(rawEntities.coupons) ? rawEntities.coupons : [],
    products: Array.isArray(rawEntities.products) ? rawEntities.products : [],
    orderNumbers: Array.isArray(rawEntities.orderNumbers) ? rawEntities.orderNumbers : [],
    phoneNumbers: Array.isArray(rawEntities.phoneNumbers) ? rawEntities.phoneNumbers : [],
    platforms: Array.isArray(rawEntities.platforms) ? rawEntities.platforms : [],
    custom: {},
  };

  // Validate risk
  const rawRisk = raw.risk as Record<string, unknown> || {};
  const risk: RiskFlags = {
    privacy: rawRisk.privacy === true || entities.phoneNumbers.length > 0,
    legal: rawRisk.legal === true,
    medical: rawRisk.medical === true,
    harassment: rawRisk.harassment === true,
    financial: rawRisk.financial === true,
  };

  // Validate route hints
  const rawHints = raw.routeHints as Record<string, unknown> || {};
  const routeHints: RouteHints = {
    suggestedHandler: ['chat', 'support_flow', 'sales_flow', 'human'].includes(rawHints.suggestedHandler as string)
      ? (rawHints.suggestedHandler as RouteHints['suggestedHandler'])
      : mapIntentToHandler(intent),
    suggestedUi: rawHints.suggestedUi as RouteHints['suggestedUi'],
  };

  // Validate urgency
  const validUrgency = ['low', 'medium', 'high', 'critical'];
  const urgency = validUrgency.includes(raw.urgency as string)
    ? (raw.urgency as 'low' | 'medium' | 'high' | 'critical')
    : 'low';

  // Validate sentiment
  const validSentiment = ['positive', 'neutral', 'negative'];
  const sentiment = validSentiment.includes(raw.sentiment as string)
    ? (raw.sentiment as 'positive' | 'neutral' | 'negative')
    : 'neutral';

  return {
    intent,
    confidence,
    topic: typeof raw.topic === 'string' ? raw.topic : 'general',
    entities,
    urgency,
    sentiment,
    isRepeat: raw.isRepeat === true,
    ambiguity: Array.isArray(raw.ambiguity) ? raw.ambiguity : [],
    suggestedClarifications: Array.isArray(raw.suggestedClarifications) ? raw.suggestedClarifications : [],
    risk,
    requiresHuman: raw.requiresHuman === true || intent === 'handoff_human' || risk.harassment,
    routeHints,
    piiDetectedPaths: Array.isArray(raw.piiDetectedPaths) 
      ? raw.piiDetectedPaths 
      : entities.phoneNumbers.length > 0 ? ['entities.phoneNumbers'] : [],
  };
}

/**
 * Map intent to suggested handler
 */
function mapIntentToHandler(intent: SimpleIntent): RouteHints['suggestedHandler'] {
  switch (intent) {
    case 'support':
      return 'support_flow';
    case 'sales':
      return 'sales_flow';
    case 'handoff_human':
    case 'abuse':
      return 'human';
    default:
      return 'chat';
  }
}

/**
 * Create safe default result when API fails
 */
function createDefaultResult(message: string, processingTimeMs: number): UnderstandingResult {
  // Simple keyword detection as fallback
  const lowerMessage = message.toLowerCase();
  
  let intent: SimpleIntent = 'general';
  let topic = 'general';
  let suggestedHandler: RouteHints['suggestedHandler'] = 'chat';
  
  if (lowerMessage.includes('קופון') || lowerMessage.includes('הנחה') || lowerMessage.includes('קוד')) {
    intent = 'coupon';
    topic = 'coupons';
  } else if (lowerMessage.includes('בעיה') || lowerMessage.includes('תקלה') || lowerMessage.includes('לא עובד') || lowerMessage.includes('הזמנה')) {
    intent = 'support';
    topic = 'support';
    suggestedHandler = 'support_flow';
  } else if (lowerMessage.includes('מחיר') || lowerMessage.includes('לקנות') || lowerMessage.includes('כמה עולה')) {
    intent = 'sales';
    topic = 'pricing';
    suggestedHandler = 'sales_flow';
  } else if (lowerMessage.includes('אדם') || lowerMessage.includes('נציג') || lowerMessage.includes('אמיתי')) {
    intent = 'handoff_human';
    topic = 'escalation';
    suggestedHandler = 'human';
  }

  // Detect phone numbers
  const phoneRegex = /0\d{9}|05\d{8}|\+972\d{9}/g;
  const phoneNumbers = message.match(phoneRegex) || [];
  
  // Detect order numbers
  const orderRegex = /#?\d{5,10}|הזמנה\s*\d+/g;
  const orderNumbers = message.match(orderRegex) || [];

  return {
    intent,
    confidence: 0.5, // Low confidence for fallback
    topic,
    entities: {
      brands: [],
      coupons: [],
      products: [],
      orderNumbers,
      phoneNumbers,
      platforms: [],
      custom: {},
    },
    urgency: 'low',
    sentiment: 'neutral',
    isRepeat: false,
    ambiguity: ['Fallback analysis used'],
    suggestedClarifications: [],
    risk: {
      privacy: phoneNumbers.length > 0,
      legal: false,
      medical: false,
      harassment: false,
      financial: false,
    },
    requiresHuman: false,
    routeHints: {
      suggestedHandler,
    },
    piiDetectedPaths: phoneNumbers.length > 0 ? ['entities.phoneNumbers'] : [],
    rawInput: message,
    processingTimeMs,
  };
}

/**
 * Quick intent check (for routing decisions)
 */
export async function quickIntentCheck(message: string): Promise<SimpleIntent> {
  try {
    const result = await understandMessage({
      message,
      accountId: 'quick-check',
      mode: 'creator',
    });
    return result.intent;
  } catch {
    return 'unknown';
  }
}



