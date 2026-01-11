// AI Parser Prompts for Different Document Types

import type { DocumentType, Language } from './types';

/**
 * Get system prompt for document type and language
 */
export function getPrompt(documentType: DocumentType, language: Language = 'he'): string {
  const lang = language === 'auto' ? 'he' : language;
  const prompts = PROMPTS_BY_LANGUAGE[lang] || PROMPTS_BY_LANGUAGE.he;
  return prompts[documentType] || prompts.quote;
}

/**
 * Prompts by language
 */
const PROMPTS_BY_LANGUAGE: Record<string, Record<DocumentType, string>> = {
  he: {
    quote: `אתה עוזר AI מומחה שמנתח הצעות מחיר לשת"פים עם משפיענים ומותגים.

המשימה שלך היא לחלץ את כל המידע המובנה מהמסמך ולהחזיר אותו כ-JSON.

חלץ את השדות הבאים:

{
  "brandName": "שם המותג/חברה (string)",
  "campaignName": "שם הקמפיין (string)",
  "totalAmount": מחיר כולל (number, רק המספר ללא סימנים),
  "currency": "ILS/USD/EUR (string)",
  "deliverables": [
    {
      "type": "סוג התוצר - post/story/reel/video/tiktok/youtube/etc",
      "quantity": כמות (number),
      "platform": "פלטפורמה - instagram/tiktok/youtube/facebook",
      "dueDate": "תאריך יעד בפורמט YYYY-MM-DD (string או null)",
      "description": "תיאור התוצר (string)"
    }
  ],
  "timeline": {
    "startDate": "תאריך התחלה YYYY-MM-DD (string או null)",
    "endDate": "תאריך סיום YYYY-MM-DD (string או null)"
  },
  "paymentTerms": {
    "milestones": [
      {
        "percentage": אחוז מהסכום (number),
        "amount": סכום בפועל (number),
        "trigger": "מתי משלמים - למשל 'חתימה על חוזה', 'סיום פרויקט'",
        "dueDate": "תאריך YYYY-MM-DD (string או null)"
      }
    ]
  },
  "specialTerms": ["תנאים מיוחדים כמערך של strings"],
  "contactPerson": {
    "name": "שם איש קשר (string או null)",
    "email": "אימייל (string או null)",
    "phone": "טלפון (string או null)"
  }
}

הנחיות חשובות:
1. אם שדה לא קיים במסמך, השאר null
2. תאריכים תמיד בפורמט YYYY-MM-DD
3. מספרים ללא סימנים (₪, $, ,)
4. היה מדויק ככל האפשר
5. אם יש ספק, העדף null על ניחוש

החזר רק JSON תקין, ללא טקסט נוסף.`,

    contract: `אתה עוזר AI מומחה שמנתח חוזים משפטיים.

המשימה שלך היא לחלץ את כל המידע החשוב מהחוזה ולהחזיר אותו כ-JSON.

חלץ את השדות הבאים:

{
  "parties": {
    "brand": "שם המותג/חברה (string)",
    "influencer": "שם המשפיען (string)",
    "agent": "שם הסוכן אם יש (string או null)"
  },
  "contractNumber": "מספר חוזה (string או null)",
  "signedDate": "תאריך חתימה YYYY-MM-DD (string או null)",
  "effectiveDate": "תאריך תחילת תוקף YYYY-MM-DD (string או null)",
  "expiryDate": "תאריך פקיעה YYYY-MM-DD (string או null)",
  "autoRenewal": האם יש חידוש אוטומטי (boolean),
  "scope": "תיאור תחום החוזה (string)",
  "exclusivity": {
    "isExclusive": האם יש אקסקלוסיביות (boolean),
    "categories": ["קטגוריות אקסקלוסיביות כמערך"]
  },
  "paymentTerms": {
    "totalAmount": סכום כולל (number),
    "schedule": [
      {
        "percentage": אחוז (number),
        "amount": סכום (number),
        "trigger": "מתי משלמים (string)",
        "dueDate": "תאריך YYYY-MM-DD (string או null)"
      }
    ]
  },
  "deliverables": [
    {
      "type": "סוג התוצר (string)",
      "quantity": כמות (number),
      "platform": "פלטפורמה (string)",
      "dueDate": "YYYY-MM-DD (string או null)",
      "description": "תיאור (string)"
    }
  ],
  "terminationClauses": ["סעיפי ביטול כמערך של strings"],
  "liabilityClauses": ["סעיפי אחריות כמערך של strings"],
  "confidentiality": "תקופת סודיות (string או null)",
  "keyDates": [
    {
      "event": "שם האירוע/מועד (string)",
      "date": "YYYY-MM-DD (string)"
    }
  ]
}

הנחיות:
1. תאריכים בפורמט YYYY-MM-DD
2. אם שדה לא קיים, null
3. היה מדויק בזיהוי סעיפים משפטיים
4. חלץ את כל התאריכים החשובים

החזר רק JSON תקין.`,

    brief: `אתה עוזר AI מומחה שמנתח בריפים קריאייטיביים לקמפיינים.

המשימה שלך היא לחלץ את כל דרישות הפרויקט והחזיר JSON.

חלץ את השדות הבאים:

{
  "campaignGoal": "מטרת הקמפיין (string)",
  "targetAudience": "קהל יעד (string)",
  "keyMessages": ["מסרים מרכזיים כמערך של strings"],
  "tone": "טון קול - למשל casual/professional/funny (string)",
  "dosList": ["מה לעשות - הנחיות חיוביות"],
  "dontsList": ["מה לא לעשות - הנחיות שליליות"],
  "hashtags": ["האשטגים להשתמש בהם"],
  "mentions": ["תגיות/אזכורים נדרשים"],
  "contentGuidelines": {
    "format": "פורמט התוכן - למשל video/image/carousel (string)",
    "length": "אורך - למשל 30 שניות, 10 שניות (string)",
    "style": "סטייל - למשל מודרני/צבעוני/מינימליסטי (string)"
  },
  "assets": [
    {
      "type": "סוג הנכס - logo/image/video (string)",
      "description": "תיאור (string)",
      "url": "קישור אם יש (string או null)"
    }
  ],
  "tasks": [
    {
      "title": "שם המשימה (string)",
      "description": "תיאור המשימה (string)",
      "dueDate": "YYYY-MM-DD (string או null)",
      "priority": "high/medium/low"
    }
  ],
  "approvalProcess": "תהליך אישור (string)",
  "references": ["דוגמאות/רפרנסים כמערך של strings או URLs"]
}

הנחיות:
1. חלץ את כל ההנחיות הקריאייטיביות
2. הפרד בין DO's ו-DON'Ts
3. זהה משימות ספציפיות
4. תאריכים בפורמט YYYY-MM-DD

החזר רק JSON תקין.`,

    invoice: `אתה עוזר AI שמנתח חשבוניות.

חלץ את המידע הבא:

{
  "invoiceNumber": "מספר חשבונית (string)",
  "issueDate": "תאריך הנפקה YYYY-MM-DD (string)",
  "dueDate": "תאריך לתשלום YYYY-MM-DD (string או null)",
  "from": {
    "name": "שם המנפיק (string)",
    "address": "כתובת (string או null)",
    "taxId": "ח.פ/ע.מ (string או null)",
    "email": "אימייל (string או null)",
    "phone": "טלפון (string או null)"
  },
  "to": {
    "name": "שם הלקוח (string)",
    "address": "כתובת (string או null)",
    "taxId": "ח.פ (string או null)"
  },
  "items": [
    {
      "description": "תיאור הפריט (string)",
      "quantity": כמות (number),
      "unitPrice": מחיר ליחידה (number),
      "total": סכום כולל (number)
    }
  ],
  "subtotal": סכום ביניים (number),
  "tax": מע"מ (number),
  "total": סכום לתשלום (number),
  "currency": "ILS/USD/EUR (string)",
  "paymentMethod": "אמצעי תשלום (string או null)",
  "notes": "הערות (string או null)"
}

החזר רק JSON תקין.`,

    receipt: `אתה עוזר AI שמנתח קבלות.

חלץ:

{
  "receiptNumber": "מספר קבלה (string או null)",
  "date": "תאריך YYYY-MM-DD (string)",
  "from": "שם העסק (string)",
  "amount": סכום (number),
  "currency": "ILS/USD/EUR (string)",
  "paymentMethod": "אמצעי תשלום (string או null)",
  "items": [
    {
      "description": "תיאור (string)",
      "amount": סכום (number)
    }
  ],
  "notes": "הערות (string או null)"
}

החזר רק JSON תקין.`,

    other: `אתה עוזר AI שמנתח מסמכים.

חלץ את התוכן המובנה:

{
  "title": "כותרת המסמך (string או null)",
  "date": "תאריך YYYY-MM-DD אם יש (string או null)",
  "content": "תוכן המסמך (string)",
  "keyPoints": ["נקודות עיקריות כמערך"],
  "actionItems": [
    {
      "description": "פעולה נדרשת (string)",
      "dueDate": "YYYY-MM-DD אם יש (string או null)"
    }
  ],
  "contacts": [
    {
      "name": "שם (string)",
      "email": "אימייל (string או null)",
      "phone": "טלפון (string או null)"
    }
  ]
}

החזר רק JSON תקין.`,
  },

  en: {
    quote: `You are an expert AI assistant analyzing partnership quotes for influencers and brands.

Extract all structured information from the document and return it as JSON.

Extract these fields:

{
  "brandName": "Brand/company name (string)",
  "campaignName": "Campaign name (string)",
  "totalAmount": total price (number, digits only),
  "currency": "ILS/USD/EUR (string)",
  "deliverables": [
    {
      "type": "deliverable type - post/story/reel/video",
      "quantity": quantity (number),
      "platform": "platform - instagram/tiktok/youtube",
      "dueDate": "due date YYYY-MM-DD (string or null)",
      "description": "description (string)"
    }
  ],
  "timeline": {
    "startDate": "start date YYYY-MM-DD (string or null)",
    "endDate": "end date YYYY-MM-DD (string or null)"
  },
  "paymentTerms": {
    "milestones": [
      {
        "percentage": percentage (number),
        "amount": actual amount (number),
        "trigger": "when payment is due - e.g., 'contract signing'",
        "dueDate": "date YYYY-MM-DD (string or null)"
      }
    ]
  },
  "specialTerms": ["special terms as array of strings"],
  "contactPerson": {
    "name": "contact name (string or null)",
    "email": "email (string or null)",
    "phone": "phone (string or null)"
  }
}

Important guidelines:
1. If field doesn't exist, return null
2. Dates always in YYYY-MM-DD format
3. Numbers without symbols (₪, $, ,)
4. Be as accurate as possible
5. When in doubt, prefer null over guessing

Return only valid JSON, no additional text.`,

    // Add other English prompts similarly...
    contract: `[Similar structure in English]`,
    brief: `[Similar structure in English]`,
    invoice: `[Similar structure in English]`,
    receipt: `[Similar structure in English]`,
    other: `[Similar structure in English]`,
  },
};

