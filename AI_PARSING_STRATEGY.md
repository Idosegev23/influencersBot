# 🤖 AI Parsing Strategy

## החלטות אדריכליות

1. ✅ **Primary AI**: Google Gemini Vision (Gemini 1.5 Pro)
2. ✅ **Storage**: Supabase Storage
3. ✅ **Fallback**: חובה שיעבוד - נסיון מרובה
4. ✅ **File Types**: הכל - PDF, Word, Excel, Images, PowerPoint
5. ✅ **Languages**: Multi-lingual (עברית, אנגלית, ערבית, רוסית)

---

## 🔄 Multi-Model Fallback Strategy

### Waterfall Approach:
```
1st Try: Gemini 1.5 Pro Vision (Google)
   ↓ (if fails or low confidence)
2nd Try: Claude 3.5 Sonnet (Anthropic)
   ↓ (if fails or low confidence)
3rd Try: GPT-4o Vision (OpenAI)
   ↓ (if fails or low confidence)
4th Try: Manual Mode (Human review)
```

### Implementation:

```typescript
// src/lib/ai-parser/index.ts

import { parseWithGemini } from './gemini';
import { parseWithClaude } from './claude';
import { parseWithOpenAI } from './openai';

interface ParseOptions {
  file: File;
  documentType: DocumentType;
  language?: 'auto' | 'he' | 'en' | 'ar' | 'ru';
}

interface ParseResult {
  success: boolean;
  data: any;
  confidence: number;
  model: 'gemini' | 'claude' | 'openai' | 'manual';
  attemptNumber: number;
  error?: string;
}

const CONFIDENCE_THRESHOLD = 0.75; // 75% minimum

export async function parseDocument(options: ParseOptions): Promise<ParseResult> {
  const parsers = [
    { name: 'gemini', fn: parseWithGemini },
    { name: 'claude', fn: parseWithClaude },
    { name: 'openai', fn: parseWithOpenAI },
  ];
  
  for (let i = 0; i < parsers.length; i++) {
    const parser = parsers[i];
    
    try {
      console.log(`[AI Parser] Attempt ${i + 1}: Trying ${parser.name}...`);
      
      const result = await parser.fn(options);
      
      if (result.success && result.confidence >= CONFIDENCE_THRESHOLD) {
        console.log(`[AI Parser] ✅ Success with ${parser.name} (confidence: ${result.confidence})`);
        return {
          ...result,
          model: parser.name as any,
          attemptNumber: i + 1,
        };
      }
      
      console.log(`[AI Parser] ⚠️ ${parser.name} failed or low confidence (${result.confidence})`);
      
    } catch (error) {
      console.error(`[AI Parser] ❌ ${parser.name} error:`, error);
      // Continue to next model
    }
  }
  
  // All AI models failed - flag for manual review
  console.log('[AI Parser] ❌ All AI models failed. Flagging for manual review.');
  
  return {
    success: false,
    data: null,
    confidence: 0,
    model: 'manual',
    attemptNumber: parsers.length + 1,
    error: 'All AI models failed. Manual review required.',
  };
}
```

---

## 🎨 Gemini Vision Implementation

### Setup:

```bash
npm install @google/generative-ai
```

### Code:

```typescript
// src/lib/ai-parser/gemini.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function parseWithGemini(options: ParseOptions): Promise<ParseResult> {
  const { file, documentType, language = 'auto' } = options;
  
  // Convert file to base64
  const base64 = await fileToBase64(file);
  const mimeType = file.type || 'application/pdf';
  
  // Get prompt for document type
  const prompt = getPromptForDocumentType(documentType, language);
  
  // Initialize model
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-pro',
    generationConfig: {
      temperature: 0.1, // Low temperature for accuracy
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    }
  });
  
  try {
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64,
          mimeType: mimeType,
        },
      },
      prompt,
    ]);
    
    const response = result.response;
    const text = response.text();
    
    // Parse JSON response
    const parsed = JSON.parse(text);
    
    // Calculate confidence based on completeness
    const confidence = calculateConfidence(parsed, documentType);
    
    return {
      success: true,
      data: parsed,
      confidence,
      model: 'gemini',
      attemptNumber: 1,
    };
    
  } catch (error) {
    console.error('[Gemini] Parsing error:', error);
    return {
      success: false,
      data: null,
      confidence: 0,
      model: 'gemini',
      attemptNumber: 1,
      error: String(error),
    };
  }
}
```

---

## 📄 File Type Support

### Supported Types:

```typescript
const SUPPORTED_FILE_TYPES = {
  // Documents
  'application/pdf': { ext: '.pdf', parser: 'vision' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', parser: 'vision' },
  'application/msword': { ext: '.doc', parser: 'vision' },
  
  // Spreadsheets
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: '.xlsx', parser: 'vision' },
  'application/vnd.ms-excel': { ext: '.xls', parser: 'vision' },
  
  // Presentations
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: '.pptx', parser: 'vision' },
  'application/vnd.ms-powerpoint': { ext: '.ppt', parser: 'vision' },
  
  // Images
  'image/jpeg': { ext: '.jpg', parser: 'vision' },
  'image/png': { ext: '.png', parser: 'vision' },
  'image/webp': { ext: '.webp', parser: 'vision' },
  'image/heic': { ext: '.heic', parser: 'vision' },
  
  // Other
  'text/plain': { ext: '.txt', parser: 'text' },
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
```

### Validation:

```typescript
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check size
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `קובץ גדול מדי. מקסימום ${MAX_FILE_SIZE / 1024 / 1024}MB` 
    };
  }
  
  // Check type
  if (!SUPPORTED_FILE_TYPES[file.type]) {
    return { 
      valid: false, 
      error: `סוג קובץ לא נתמך: ${file.type}` 
    };
  }
  
  return { valid: true };
}
```

---

## 🌍 Multi-Language Support

### Language Detection:

```typescript
// Auto-detect language from document
async function detectLanguage(text: string): Promise<string> {
  const patterns = {
    he: /[\u0590-\u05FF]/,  // Hebrew
    ar: /[\u0600-\u06FF]/,  // Arabic
    ru: /[\u0400-\u04FF]/,  // Russian
    en: /^[A-Za-z\s]+$/,    // English
  };
  
  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(text.substring(0, 200))) {
      return lang;
    }
  }
  
  return 'en'; // default
}
```

### Multi-lingual Prompts:

```typescript
const PROMPTS_BY_LANGUAGE = {
  he: {
    quote: 'אתה עוזר AI שמנתח הצעות מחיר. חלץ את כל המידע המובנה...',
    contract: 'אתה עוזר AI שמנתח חוזים. חלץ את כל הפרטים החשובים...',
    brief: 'אתה עוזר AI שמנתח בריפים. חלץ את דרישות הפרויקט...',
  },
  
  en: {
    quote: 'You are an AI assistant that analyzes quotes. Extract all structured information...',
    contract: 'You are an AI assistant that analyzes contracts. Extract all important details...',
    brief: 'You are an AI assistant that analyzes briefs. Extract project requirements...',
  },
  
  // Add ar, ru, etc.
};

function getPrompt(documentType: DocumentType, language: string): string {
  const langPrompts = PROMPTS_BY_LANGUAGE[language] || PROMPTS_BY_LANGUAGE['en'];
  return langPrompts[documentType] || langPrompts['quote'];
}
```

---

## 📊 Confidence Scoring

```typescript
function calculateConfidence(parsed: any, documentType: DocumentType): number {
  const requiredFields = REQUIRED_FIELDS[documentType];
  
  let score = 0;
  let totalWeight = 0;
  
  for (const [field, weight] of Object.entries(requiredFields)) {
    totalWeight += weight;
    
    if (parsed[field] !== null && parsed[field] !== undefined) {
      // Field exists
      score += weight * 0.5;
      
      // Field is valid (not empty string, not zero, etc.)
      if (isValidValue(parsed[field])) {
        score += weight * 0.5;
      }
    }
  }
  
  return Math.min(score / totalWeight, 1.0);
}

const REQUIRED_FIELDS = {
  quote: {
    brandName: 1.0,
    totalAmount: 1.0,
    deliverables: 0.8,
    timeline: 0.6,
    contactPerson: 0.4,
  },
  
  contract: {
    parties: 1.0,
    signedDate: 0.9,
    expiryDate: 0.9,
    paymentTerms: 0.8,
    deliverables: 0.7,
  },
  
  brief: {
    campaignGoal: 1.0,
    targetAudience: 0.8,
    keyMessages: 0.7,
    tasks: 0.6,
  },
};
```

---

## 🔄 Error Handling & Retry

```typescript
// Retry with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      console.log(`[Retry] Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Usage
const result = await retryWithBackoff(
  () => parseWithGemini(options),
  3,
  2000
);
```

---

## 📝 Logging & Monitoring

```typescript
// Log every parsing attempt
await supabase.from('ai_parsing_logs').insert({
  document_id: documentId,
  attempt_number: attemptNumber,
  model_used: 'gemini-1.5-pro',
  success: result.success,
  confidence: result.confidence,
  extracted_data: result.data,
  error_message: result.error,
  started_at: startTime,
  completed_at: new Date(),
  duration_ms: Date.now() - startTime,
});
```

---

## 🎯 Success Criteria

✅ **Gemini Vision מצליח ב-85%+ מהמקרים**
✅ **Fallback ל-Claude/OpenAI עובד חלק**
✅ **תמיכה בכל סוגי הקבצים**
✅ **Multi-language detection אוטומטי**
✅ **Confidence score מעל 75% ברוב המסמכים**
✅ **Manual fallback תמיד זמין**

---

## 💰 Cost Optimization

### Gemini Pricing (החסכוני ביותר):
- **Gemini 1.5 Pro**: $0.00125 per 1K chars (input)
- **Claude 3.5 Sonnet**: $3 per 1M tokens (~$0.003 per page)
- **GPT-4o Vision**: $5 per 1M tokens (~$0.005 per page)

### Strategy:
1. תמיד התחל עם Gemini (זול!)
2. רק אם נכשל, עבור ל-Claude
3. רק במקרים קיצוניים, השתמש ב-GPT-4o
4. תמיד cache תוצאות מוצלחות

### Estimated Costs:
- **מסמך ממוצע** (5 עמודים): ~$0.006 עם Gemini
- **עם fallback** (worst case): ~$0.015
- **100 מסמכים/חודש**: ~$0.60-$1.50

**זול מאוד!** 💰✅

