/**
 * ============================================
 * Understanding Engine Prompts
 * ============================================
 */

export const SYSTEM_PROMPT = `אתה מנוע הבנת שפה למערכת צ'אט של משפיענים.
תפקידך לנתח הודעות ולהחזיר JSON מובנה בלבד.

## חוקים:
1. תמיד החזר JSON תקין בלבד - ללא טקסט נוסף
2. השפה של השיחה היא עברית
3. זהה intent, entities, urgency, sentiment
4. סמן סיכונים (privacy, harassment) אם קיימים
5. הצע handler מתאים
6. חלץ מילות חיפוש (searchKeywords) - רק מילות התוכן מהשאלה, בלי פועלי פנייה, מילות קישור, או מילות שיחה
   דוגמאות:
   - "תעשי סדר NPU מול TPU" → ["NPU", "TPU"]
   - "יש לך מתכון לפסטה?" → ["מתכון", "פסטה"]
   - "מה את חושבת על קרם הפנים של The Ordinary?" → ["קרם פנים", "The Ordinary"]
   - "ספרי לי על האימון שעשית" → ["אימון"]
   - "היי מה קורה" → []

## Intent Types:
- general: שיחה כללית, ברכות, small talk
- support: בעיה, תלונה, בעיה בהזמנה
- sales: רוצה לקנות, שאלות על מחיר
- coupon: מבקש קופון או הנחה
- handoff_human: מבקש במפורש אדם אמיתי
- abuse: הטרדה, ספאם, תוכן פוגעני
- unknown: לא ניתן לקבוע

## Output Schema:
{
  "intent": "general|support|sales|coupon|handoff_human|abuse|unknown",
  "confidence": 0.0-1.0,
  "topic": "string - נושא ספציפי",
  "entities": {
    "brands": ["string"],
    "coupons": ["string"],
    "products": ["string"],
    "orderNumbers": ["string"],
    "phoneNumbers": ["string"],
    "platforms": ["string"]
  },
  "urgency": "low|medium|high|critical",
  "sentiment": "positive|neutral|negative",
  "isRepeat": false,
  "ambiguity": ["string - אם יש עמימות"],
  "suggestedClarifications": ["string - שאלות הבהרה אפשריות"],
  "risk": {
    "privacy": false,
    "legal": false,
    "medical": false,
    "harassment": false,
    "financial": false
  },
  "requiresHuman": false,
  "routeHints": {
    "suggestedHandler": "chat|support_flow|sales_flow|human",
    "suggestedUi": {
      "showForm": "phone|order|problem|null",
      "showCardList": "brands|products|null",
      "showQuickActions": ["string"]
    }
  },
  "searchKeywords": ["string - מילות תוכן בלבד לחיפוש, בלי פעלים ומילות שיחה"],
  "piiDetectedPaths": ["string - נתיבים שבהם זוהה מידע אישי"]
}`;

export const DEVELOPER_PROMPT = (context: {
  mode: 'creator' | 'brand';
  brands?: string[];
}) => `## Context:
- Mode: ${context.mode}
- Available Brands: ${context.brands?.join(', ') || 'None specified'}

## Guidelines:
- If user mentions a brand from the list, extract it to entities.brands
- If user asks about coupon/discount, intent should be "coupon"
- If user describes a problem with order/product, intent should be "support"
- Phone numbers should be detected and flagged as privacy risk
- Order numbers typically look like: #12345, הזמנה 12345, etc.`;

export const USER_PROMPT = (message: string) => `נתח את ההודעה הבאה והחזר JSON בלבד:

"${message}"`;

// JSON Schema for structured output (with additionalProperties: false for OpenAI strict mode)
export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: ['general', 'support', 'sales', 'coupon', 'handoff_human', 'abuse', 'unknown'],
    },
    confidence: {
      type: 'number',
    },
    topic: {
      type: 'string',
    },
    entities: {
      type: 'object',
      additionalProperties: false,
      properties: {
        brands: { type: 'array', items: { type: 'string' } },
        coupons: { type: 'array', items: { type: 'string' } },
        products: { type: 'array', items: { type: 'string' } },
        orderNumbers: { type: 'array', items: { type: 'string' } },
        phoneNumbers: { type: 'array', items: { type: 'string' } },
        platforms: { type: 'array', items: { type: 'string' } },
      },
      required: ['brands', 'coupons', 'products', 'orderNumbers', 'phoneNumbers', 'platforms'],
    },
    urgency: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'critical'],
    },
    sentiment: {
      type: 'string',
      enum: ['positive', 'neutral', 'negative'],
    },
    isRepeat: {
      type: 'boolean',
    },
    ambiguity: {
      type: 'array',
      items: { type: 'string' },
    },
    suggestedClarifications: {
      type: 'array',
      items: { type: 'string' },
    },
    risk: {
      type: 'object',
      additionalProperties: false,
      properties: {
        privacy: { type: 'boolean' },
        legal: { type: 'boolean' },
        medical: { type: 'boolean' },
        harassment: { type: 'boolean' },
        financial: { type: 'boolean' },
      },
      required: ['privacy', 'legal', 'medical', 'harassment', 'financial'],
    },
    requiresHuman: {
      type: 'boolean',
    },
    routeHints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        suggestedHandler: {
          type: 'string',
          enum: ['chat', 'support_flow', 'sales_flow', 'human'],
        },
        suggestedUi: {
          type: 'object',
          additionalProperties: false,
          properties: {
            showForm: { type: 'string' },
            showCardList: { type: 'string' },
            showQuickActions: { type: 'array', items: { type: 'string' } },
          },
          required: ['showForm', 'showCardList', 'showQuickActions'],
        },
      },
      required: ['suggestedHandler', 'suggestedUi'],
    },
    searchKeywords: {
      type: 'array',
      items: { type: 'string' },
    },
    piiDetectedPaths: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'intent',
    'confidence',
    'topic',
    'entities',
    'urgency',
    'sentiment',
    'isRepeat',
    'ambiguity',
    'suggestedClarifications',
    'risk',
    'requiresHuman',
    'routeHints',
    'searchKeywords',
    'piiDetectedPaths',
  ],
};

