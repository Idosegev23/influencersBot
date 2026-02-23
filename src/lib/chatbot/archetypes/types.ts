/**
 * Archetype Types
 * הגדרות טיפוסים לארכיטיפים
 */

// ============================================
// Core Types
// ============================================

export type ArchetypeType =
  | 'skincare'      // סקין-קר מומחית
  | 'fashion'       // פאשניסטה
  | 'cooking'       // בשלנית
  | 'fitness'       // מאמנת כושר
  | 'parenting'     // אמא
  | 'coupons'       // ציידת קופונים
  | 'tech'          // טכנולוגית (Creator)
  | 'travel'        // מטיילת
  | 'mindset'       // מיינדסט (העצמה)
  | 'interior'      // מעצבת פנים
  | 'general';      // כללי (fallback)

export interface ArchetypeTrigger {
  keywords: string[];          // מילות מפתח לזיהוי
  patterns?: RegExp[];         // דפוסי regex לזיהוי
  contextHints?: string[];     // רמזים מהקשר
}

export interface ArchetypeLogic {
  // Query building for Knowledge Base
  buildKnowledgeQuery: (userMessage: string) => string;
  
  // Response templates
  responseTemplates: ResponseTemplate[];
  
  // Default behavior
  defaultResponse: string;
}

export interface ResponseTemplate {
  situation: string;              // "מחפש מוצר", "שואל על שגרה"
  template: string;               // "בדיוק כמו ש{name} תמיד עושה, {response}"
  requiredFields?: string[];      // שדות שחייבים להיות במידע
}

export interface GuardrailRule {
  id: string;
  description: string;
  
  // Detection
  triggers: {
    keywords?: string[];          // מילות אזהרה
    patterns?: RegExp[];          // דפוסי regex
    conditions?: string[];        // תנאים (למשל "question about dosage")
  };
  
  // Action
  action: 'block' | 'warn' | 'redirect';
  
  // Response when triggered
  blockedResponse?: string;       // מה להגיד במקום
  warningMessage?: string;        // אזהרה להוסיף לתשובה
  redirectTo?: string;           // לאן להפנות (רופא, מומחה)
  
  // Severity
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ArchetypeDefinition {
  type: ArchetypeType;
  name: string;
  description: string;
  
  // Detection
  triggers: ArchetypeTrigger;
  
  // Logic
  logic: ArchetypeLogic;
  
  // Safety
  guardrails: GuardrailRule[];
  
  // Examples
  examples: {
    userQuestion: string;
    expectedBehavior: string;
  }[];
}

// ============================================
// Archetype Response Input/Output
// ============================================

export interface ArchetypeInput {
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  knowledgeBase: any; // Retrieved knowledge
  userName?: string;
  accountContext: {
    accountId: string;
    username: string;
    influencerName: string;
  };
  onToken?: (token: string) => void; // Real-time streaming callback
  modelTier?: 'nano' | 'standard' | 'full'; // From decision engine modelStrategy
  personalityConfig?: any; // Pre-loaded personality config (avoids DB call in archetype)
}

export interface ArchetypeOutput {
  response: string;
  triggeredGuardrails: {
    ruleId: string;
    severity: string;
    action: string;
    message?: string;
  }[];
  knowledgeUsed: string[];
  confidence: number; // 0-1, how confident this archetype is in the response
}

// ============================================
// Intent Router Types
// ============================================

export interface IntentClassification {
  primaryArchetype: ArchetypeType;
  secondaryArchetypes: ArchetypeType[];
  confidence: number;
  reasoning: string;
}

export interface RouterInput {
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  accountContext: {
    accountId: string;
    username: string;
    primaryNiche?: string; // מה התחום העיקרי של המשפיענית
  };
}
