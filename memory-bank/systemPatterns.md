# System Patterns - ארכיטקטורה וקבלות החלטות

**עודכן:** 2026-01-11

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                  │
│  ┌────────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │  Upload UI │  │ Dashboards │  │  Review Flow     │  │
│  └────────────┘  └───────────┘  └──────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────┐
│              API Layer (Next.js API Routes)             │
│  ┌──────────┐  ┌───────────┐  ┌───────────────────┐  │
│  │  Upload  │  │   Parse   │  │  Create Entities   │  │
│  └──────────┘  └───────────┘  └───────────────────┘  │
└────────┬───────────────┬───────────────┬──────────────┘
         │               │               │
         │               │               │
    ┌────▼─────┐    ┌───▼────────┐  ┌──▼────────────┐
    │ Supabase │    │ AI Parser  │  │  Notification │
    │ Storage  │    │  (Gemini)  │  │    Engine     │
    └──────────┘    └────────────┘  └───────────────┘
         │               │
         │               │
    ┌────▼───────────────▼──────────────────────────────┐
    │          Supabase PostgreSQL + RLS                │
    │  ┌──────┐ ┌─────────────┐ ┌──────────────────┐  │
    │  │Users │ │Partnerships │ │Documents + Logs   │  │
    │  └──────┘ └─────────────┘ └──────────────────┘  │
    └───────────────────────────────────────────────────┘
```

---

## 🔐 Security Architecture - Multi-Tenancy

### Pattern: Account-Based Isolation

**כל entity בDB קשור ל-`account_id`:**

```sql
-- כל טבלה עם account_id
CREATE TABLE partnerships (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
  ...
);

-- RLS Policy דוגמה
CREATE POLICY "Users see only their data"
ON partnerships FOR SELECT
USING (
  account_id IN (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid()
  )
);
```

**למה?**
- ✅ Zero data leakage בין חשבונות
- ✅ DB enforces isolation (לא רק קוד)
- ✅ Agent רואה רק משפיענים שלו
- ✅ Audit trail אוטומטי

---

### Pattern: 4-Level RBAC

```typescript
type AppRole = 'admin' | 'agent' | 'influencer' | 'follower';

// Matrix של הרשאות
const permissions = {
  admin: {
    users: ['read', 'write', 'delete'],
    partnerships: ['read', 'write', 'delete'],
    documents: ['read', 'write', 'delete'],
    analytics: ['read_all'],
  },
  agent: {
    users: ['read_assigned'],
    partnerships: ['read_assigned', 'write_assigned'],
    documents: ['read_assigned'],
    analytics: ['read_assigned'],
  },
  influencer: {
    users: ['read_self'],
    partnerships: ['read_own', 'write_own'],
    documents: ['read_own', 'write_own'],
    analytics: ['read_own'],
  },
  follower: {
    chats: ['read_own', 'write_own'],
  },
};
```

**Decision**: למה 4 רמות?
- Admin: ניהול כללי
- Agent: סוכנים שמנהלים מספר משפיענים
- Influencer: המשתמש העיקרי
- Follower: עוקבים בצ'אטבוט

---

## 🤖 AI Parser Architecture

### Pattern: Multi-Model Fallback

```typescript
async function parseDocument(file: File) {
  // Try Gemini first (fast + cheap)
  const geminiResult = await parseWithGemini(file);
  if (geminiResult.confidence > 0.75) {
    return geminiResult;
  }
  
  // Fallback to Claude (expensive but good)
  const claudeResult = await parseWithClaude(file);
  if (claudeResult.confidence > 0.75) {
    return claudeResult;
  }
  
  // Last resort: GPT-4o (most expensive)
  return await parseWithGPT4o(file);
}
```

**Decision**: למה fallback?
- ✅ **אמינות**: אם Gemini נופל → Claude
- ✅ **עלות**: Gemini הכי זול (₪0.006/doc)
- ✅ **איכות**: אם ביטחון נמוך → נסה מודל יותר טוב
- ✅ **גיבוי**: אף פעם לא נכשל לגמרי

---

### Pattern: Confidence-Based Review Flow

```typescript
if (confidence >= 0.90) {
  // High confidence → Auto-approve
  await createEntitiesAutomatically(parsed);
} else if (confidence >= 0.75) {
  // Medium confidence → Quick review
  await showQuickReview(parsed);
} else {
  // Low confidence → Manual review
  await showFullManualReview(parsed);
}
```

**Decision**: למה confidence thresholds?
- ✅ משתמש רק בודק דברים לא בטוחים
- ✅ 90%+ → אוטומטי (חוסך זמן)
- ✅ 75-90% → בדיקה מהירה (בטיחות)
- ✅ <75% → בדיקה מלאה (מנע טעויות)

---

### Pattern: Structured Prompts

```typescript
const prompt = `
אתה מנתח מסמכי שת"פ.

DOCUMENT TYPE: ${documentType}
LANGUAGE: Hebrew (detect automatically)

EXTRACT:
1. מותג (brand_name)
2. שם קמפיין (campaign_name)
3. תאריך התחלה (start_date) - ISO format
4. תאריך סיום (end_date) - ISO format
5. סכום תשלום (payment_amount) - מספר
...

OUTPUT FORMAT: JSON
{
  "brand_name": "...",
  "campaign_name": "...",
  ...
}
`;
```

**Decision**: למה structured prompts?
- ✅ תוצאות עקביות
- ✅ קל לvalidate
- ✅ תמיכה במספר שפות
- ✅ JSON parsing אוטומטי

---

## 📊 Data Flow Patterns

### Pattern: Document Upload → Parse → Create

```typescript
// 1. Upload
POST /api/influencer/documents/upload
→ Supabase Storage
→ Create record in partnership_documents
→ Return document_id

// 2. Parse (async)
POST /api/influencer/documents/parse
→ Download from Storage
→ AI Parser (Gemini)
→ Update document with parsed_data
→ Log in ai_parsing_logs
→ Return parsed result

// 3. Review (user confirms)
Frontend shows parsed data
User reviews & confirms

// 4. Create
POST /api/influencer/partnerships/create-from-parsed
→ Create Partnership
→ Create Tasks
→ Create Invoices
→ Create Calendar Events
→ Link all together
→ Set up Notifications
```

**Decision**: למה 3 שלבים נפרדים?
- ✅ **Separation of concerns**: כל שלב עושה דבר אחד
- ✅ **User control**: משתמש מאשר לפני יצירה
- ✅ **Retry-able**: אם שלב נכשל → נסה שוב
- ✅ **Testable**: בדיקה נפרדת לכל שלב

---

### Pattern: Event-Driven Notifications

```typescript
// Event happens
await createPartnership(data);

// Trigger notification
await notificationEngine.schedule({
  type: 'deadline_reminder',
  triggerAt: addDays(data.deadline, -3),
  userId: data.influencer_id,
  data: { partnershipId: data.id },
});
```

**Decision**: למה event-driven?
- ✅ Decoupled: notifications לא משבשים flow עיקרי
- ✅ Scalable: ניתן להוסיף events חדשים
- ✅ Reliable: אם notification נכשל → נסה שוב
- ✅ Flexible: ניתן לשנות לוגיקה בלי לשנות קוד ראשי

---

## 🗄️ Database Patterns

### Pattern: Timestamps בכל טבלה

```sql
CREATE TABLE example (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ...
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger לעדכון updated_at
CREATE TRIGGER update_example_updated_at
BEFORE UPDATE ON example
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**למה?**
- ✅ Audit trail
- ✅ Debugging
- ✅ Analytics (created_at)

---

### Pattern: Soft Delete

```sql
ALTER TABLE partnerships ADD COLUMN deleted_at TIMESTAMPTZ;

-- בקריאות רגילות
SELECT * FROM partnerships WHERE deleted_at IS NULL;

-- Admin רואה גם deleted
SELECT * FROM partnerships; -- כולל deleted_at IS NOT NULL
```

**Decision**: למה soft delete?
- ✅ אפשר לשחזר
- ✅ Audit trail מלא
- ✅ Analytics היסטוריים

---

### Pattern: JSONB for Flexible Data

```sql
CREATE TABLE partnership_documents (
  ...
  parsed_data JSONB,  -- תוצאת AI
  parsing_log JSONB   -- debug info
);

-- Query example
SELECT * FROM partnership_documents
WHERE parsed_data->>'brand_name' = 'Nike';
```

**Decision**: למה JSONB?
- ✅ גמישות: כל מסמך שונה
- ✅ Performance: indexes על JSONB
- ✅ אבולוציה: להוסיף fields בלי migration

---

## 🔄 Error Handling Patterns

### Pattern: Retry with Exponential Backoff

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000); // 1s, 2s, 4s
    }
  }
  throw new Error('Max retries reached');
}
```

**למה?**
- ✅ AI APIs לפעמים נופלים
- ✅ Rate limiting
- ✅ Network issues

---

### Pattern: Graceful Degradation

```typescript
// אם AI נכשל → fallback ל-manual
try {
  const parsed = await parseWithAI(file);
  return parsed;
} catch (error) {
  logger.error('AI parsing failed', error);
  return {
    status: 'manual_review_required',
    file_url: fileUrl,
    error: error.message,
  };
}
```

**למה?**
- ✅ משתמש לא תקוע
- ✅ תמיד יש path forward
- ✅ UX לא נשבר

---

## 📈 Performance Patterns

### Pattern: Caching (Redis)

```typescript
// Rate limiting
const key = `rate_limit:${userId}:${endpoint}`;
const count = await redis.incr(key);
await redis.expire(key, 60); // 60 seconds

if (count > 100) {
  throw new Error('Rate limit exceeded');
}
```

**למה?**
- ✅ מגן מפני abuse
- ✅ מפחית עומס על DB
- ✅ מאפשר caching

---

### Pattern: Pagination

```typescript
// Cursor-based pagination
const partnerships = await supabase
  .from('partnerships')
  .select('*')
  .lt('created_at', cursor)
  .order('created_at', { ascending: false })
  .limit(20);
```

**Decision**: למה cursor-based?
- ✅ Performance טוב גם עם הרבה דאטה
- ✅ Consistent results
- ✅ Works עם real-time updates

---

## 🧪 Testing Patterns

### Pattern: Test Pyramid

```
         /\
        /E2E\       10% - E2E Tests (Playwright)
       /______\
      /        \
     /Integration\ 30% - Integration Tests
    /____________\
   /              \
  /  Unit Tests    \ 60% - Unit Tests (Vitest)
 /__________________\
```

**Decision**: למה pyramid?
- ✅ Unit tests: מהירים + זולים
- ✅ Integration: בודקים flows
- ✅ E2E: בודקים חוויית משתמש

---

## 🔍 Monitoring Patterns

### Pattern: Structured Logging

```typescript
logger.info('Document parsed', {
  documentId,
  model: 'gemini',
  confidence: 0.85,
  duration: 2500,
  cost: 0.006,
});
```

**למה?**
- ✅ ניתן לquery
- ✅ מדדים אוטומטיים
- ✅ Debugging קל

---

**הpatterns האלה מנחים כל החלטת ארכיטקטורה במערכת!**

