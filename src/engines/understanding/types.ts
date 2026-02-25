/**
 * ============================================
 * Understanding Engine Types
 * ============================================
 */

// Simple intent types for v1
export type SimpleIntent = 
  | 'general'      // General chat, greeting, small talk
  | 'support'      // Problem, complaint, issue with order
  | 'sales'        // Want to buy, pricing questions
  | 'coupon'       // Asking for coupon/discount
  | 'handoff_human'// Explicitly wants human
  | 'abuse'        // Harassment, spam, abuse
  | 'unknown';     // Can't determine

export interface ExtractedEntities {
  brands: string[];
  coupons: string[];
  products: string[];
  orderNumbers: string[];
  phoneNumbers: string[];
  platforms: string[];  // Instagram, WhatsApp, etc.
  custom: Record<string, string>;
}

export interface RiskFlags {
  privacy: boolean;      // PII detected
  legal: boolean;        // Legal claims
  medical: boolean;      // Medical advice
  harassment: boolean;   // Abusive content
  financial: boolean;    // Financial advice
}

export interface RouteHints {
  suggestedHandler: 'chat' | 'support_flow' | 'sales_flow' | 'human';
  suggestedUi?: {
    showForm?: 'phone' | 'order' | 'problem';
    showCardList?: 'brands' | 'products';
    showQuickActions?: string[];
  };
}

export interface UnderstandingResult {
  // Core classification
  intent: SimpleIntent;
  confidence: number;           // 0-1
  
  // Topic/domain
  topic: string;                // returns, shipping, recipe, etc.
  
  // Extracted entities
  entities: ExtractedEntities;
  
  // Context signals
  urgency: 'low' | 'medium' | 'high' | 'critical';
  sentiment: 'positive' | 'neutral' | 'negative';
  
  // Repeat detection
  isRepeat: boolean;
  
  // Ambiguity
  ambiguity: string[];
  suggestedClarifications: string[];
  
  // Safety
  risk: RiskFlags;
  requiresHuman: boolean;
  
  // Route hints for Decision Engine
  routeHints: RouteHints;
  
  // Search keywords: content-only terms stripped of conversational wrappers
  // Used by knowledge-retrieval for FTS queries instead of raw message
  searchKeywords: string[];

  // PII tracking for redaction
  piiDetectedPaths: string[];

  // Debug
  rawInput: string;
  processingTimeMs: number;
}

export interface UnderstandMessageInput {
  message: string;
  accountId: string;
  mode: 'creator' | 'brand';
  brands?: string[];
  previousIntent?: string;
  sessionId?: string;
}



