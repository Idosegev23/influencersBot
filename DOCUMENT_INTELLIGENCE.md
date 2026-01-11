# 🤖 Document Intelligence System

## סקירה
המשפיען מעלה מסמכים (PDF, Word, תמונות), והמערכת **סורקת, מבינה, ויוצרת אוטומטית** את כל הנתונים.

---

## 🔄 תהליך יצירת שת"פ חדש

### שלב 1: העלאת מסמכים
```typescript
interface DocumentUpload {
  partnershipName: string; // שם זמני
  files: File[]; // PDF, DOCX, JPG, PNG
  documentTypes: {
    [fileId: string]: 'quote' | 'contract' | 'brief' | 'invoice' | 'other';
  };
}
```

**UI:**
```
┌─────────────────────────────────────┐
│  ➕ שת"פ חדש                         │
├─────────────────────────────────────┤
│  שם השת"פ: [Nike Campaign 2026]    │
│                                      │
│  📄 העלאת מסמכים:                   │
│  ┌──────────────────────────────┐  │
│  │ 🔵 גרור קבצים או לחץ להעלאה │  │
│  └──────────────────────────────┘  │
│                                      │
│  מסמכים שהועלו:                     │
│  ✅ הצעת_מחיר_Nike.pdf [הצעת מחיר] │
│  ✅ חוזה_Nike_2026.pdf [חוזה]      │
│  ✅ בריף_קמפיין.docx [בריף]       │
│                                      │
│  [ביטול]  [📤 העלה וסרוק]          │
└─────────────────────────────────────┘
```

---

### שלב 2: AI Parsing & Extraction

#### **2.1 OCR + Vision**
```typescript
// src/lib/document-parser.ts

import { OpenAI } from 'openai';

export async function parseDocument(
  file: File,
  documentType: DocumentType
): Promise<ParsedDocument> {
  
  const openai = new OpenAI();
  
  // Convert file to base64
  const base64 = await fileToBase64(file);
  
  // Use GPT-4 Vision or Claude to analyze
  const response = await openai.chat.completions.create({
    model: 'gpt-4o', // or gpt-4-vision-preview
    messages: [
      {
        role: 'system',
        content: getSystemPrompt(documentType)
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'נא לחלץ את כל המידע המובנה מהמסמך הזה' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }
    ],
    response_format: { type: 'json_object' }
  });
  
  return JSON.parse(response.choices[0].message.content);
}
```

#### **2.2 Extraction Prompts**

**להצעת מחיר:**
```typescript
const QUOTE_PROMPT = `
אתה עוזר AI שמנתח הצעות מחיר לשת"פים עם משפיענים.
חלץ מהמסמך:

{
  "brandName": "שם המותג",
  "campaignName": "שם הקמפיין",
  "totalAmount": מחיר כולל (מספר),
  "currency": "ILS/USD/EUR",
  "deliverables": [
    {
      "type": "post/story/reel/video",
      "quantity": מספר,
      "platform": "instagram/tiktok/youtube",
      "dueDate": "YYYY-MM-DD"
    }
  ],
  "timeline": {
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD"
  },
  "paymentTerms": {
    "milestones": [
      {
        "percentage": מספר,
        "trigger": "מתי משלמים",
        "dueDate": "YYYY-MM-DD"
      }
    ]
  },
  "specialTerms": ["תנאים מיוחדים"],
  "contactPerson": {
    "name": "שם",
    "email": "מייל",
    "phone": "טלפון"
  }
}

אם שדה לא קיים, השאר null.
`;
```

**לחוזה:**
```typescript
const CONTRACT_PROMPT = `
אתה עוזר AI שמנתח חוזים.
חלץ מהחוזה:

{
  "parties": {
    "brand": "שם המותג",
    "influencer": "שם המשפיען",
    "agent": "שם הסוכן (אם יש)"
  },
  "contractNumber": "מספר חוזה",
  "signedDate": "YYYY-MM-DD",
  "effectiveDate": "YYYY-MM-DD",
  "expiryDate": "YYYY-MM-DD",
  "autoRenewal": true/false,
  "scope": "תיאור תחום החוזה",
  "exclusivity": {
    "isExclusive": true/false,
    "categories": ["קטגוריות אקסקלוסיביות"]
  },
  "paymentTerms": {
    "totalAmount": מספר,
    "schedule": [...]
  },
  "deliverables": [...],
  "terminationClauses": ["תנאי ביטול"],
  "liabilityClauses": ["סעיפי אחריות"],
  "confidentiality": "תקופת סודיות",
  "keyDates": [
    {
      "event": "אירוע",
      "date": "YYYY-MM-DD"
    }
  ]
}
`;
```

**לבריף:**
```typescript
const BRIEF_PROMPT = `
אתה עוזר AI שמנתח בריפים קריאייטיביים.
חלץ מהבריף:

{
  "campaignGoal": "מטרת הקמפיין",
  "targetAudience": "קהל יעד",
  "keyMessages": ["מסרים מרכזיים"],
  "tone": "tone of voice",
  "dosList": ["מה לעשות"],
  "dontsList": ["מה לא לעשות"],
  "hashtags": ["האשטגים"],
  "mentions": ["תגיות"],
  "contentGuidelines": {
    "format": "פורמט התוכן",
    "length": "אורך",
    "style": "סטייל"
  },
  "assets": [
    {
      "type": "לוגו/תמונה/וידאו",
      "description": "תיאור",
      "url": "קישור (אם יש)"
    }
  ],
  "tasks": [
    {
      "title": "משימה",
      "description": "תיאור",
      "dueDate": "YYYY-MM-DD",
      "priority": "high/medium/low"
    }
  ],
  "approvalProcess": "תהליך אישור",
  "references": ["דוגמאות השראה"]
}
`;
```

---

### שלב 3: Review & Confirmation

**UI מוצע:**
```
┌─────────────────────────────────────────────────────────────┐
│  🎉 סריקה הושלמה! אנא אשר את הפרטים                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📋 פרטי שת"פ                                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │ שם מותג:     [Nike]                    ✏️ ערוך    │    │
│  │ שם קמפיין:   [Air Max Summer 2026]    ✏️ ערוך    │    │
│  │ סכום:        [₪50,000]                 ✏️ ערוך    │    │
│  │ תאריך התחלה: [2026-06-01]              ✏️ ערוך    │    │
│  │ תאריך סיום:  [2026-08-31]              ✏️ ערוך    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  📦 Deliverables (AI זיהה 5 משימות)                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ✅ 3 פוסטים באינסטגרם     | דדליין: 15/06/26      │    │
│  │ ✅ 5 סטוריז               | דדליין: 20/06/26      │    │
│  │ ✅ 1 רילס                 | דדליין: 25/06/26      │    │
│  │ ✅ צילום מוצר             | דדליין: 10/06/26      │    │
│  │ ✅ אישור תוכן עם המותג    | דדליין: 08/06/26      │    │
│  │                                          [➕ הוסף]  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  💰 תשלומים (AI זיהה 3 תשלומים)                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 50% - חתימה על חוזה      | ₪25,000 | 01/06/26    │    │
│  │ 30% - אישור תוכן          | ₪15,000 | 20/06/26    │    │
│  │ 20% - סיום פרויקט         | ₪10,000 | 05/09/26    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ⚠️ AI מצא 2 נושאים שדורשים תשומת לב:                      │
│  • תאריך פקיעת חוזה: 31/12/2026 (תזכורת תוגדר)            │
│  • סעיף אקסקלוסיביות: ספורט וביגוד (6 חודשים)             │
│                                                              │
│  [ביטול]  [✏️ ערוך הכל]  [✅ אשר ושמור]                   │
└─────────────────────────────────────────────────────────────┘
```

---

### שלב 4: Auto-Generation

אחרי אישור, המערכת **יוצרת אוטומטית**:

#### **4.1 Partnership Record**
```sql
INSERT INTO partnerships (
  account_id,
  brand_name,
  campaign_name,
  status,
  start_date,
  end_date,
  total_value,
  ...
) VALUES (...);
```

#### **4.2 Tasks**
```sql
-- מכל deliverable ב-parsed data
INSERT INTO tasks (
  account_id,
  partnership_id,
  title,
  description,
  due_date,
  priority,
  status,
  task_type
) VALUES 
  ('צילום מוצר Nike Air Max', 'צילום באולפן', '2026-06-10', 'high', 'pending', 'content_creation'),
  ('3 פוסטים באינסטגרם', 'פרסום עם #NikeAirMax', '2026-06-15', 'high', 'pending', 'social_post'),
  ...;
```

#### **4.3 Calendar Events**
```sql
INSERT INTO calendar_events (
  account_id,
  partnership_id,
  title,
  event_type,
  start_time,
  end_time,
  description
) VALUES
  ('דדליין: אישור תוכן עם Nike', 'deadline', '2026-06-08 17:00', '2026-06-08 18:00', 'לשלוח תוכן לאישור'),
  ('צילום Nike', 'meeting', '2026-06-10 10:00', '2026-06-10 14:00', 'אולפן סטודיו 54'),
  ...;
```

#### **4.4 Invoices**
```sql
INSERT INTO invoices (
  account_id,
  partnership_id,
  invoice_number,
  amount,
  due_date,
  status,
  description
) VALUES
  ('חתימה', 25000, '2026-06-01', 'pending', 'תשלום ראשון 50%'),
  ('אישור תוכן', 15000, '2026-06-20', 'pending', 'תשלום שני 30%'),
  ...;
```

#### **4.5 Notifications & Follow-ups**
```sql
INSERT INTO follow_ups (
  account_id,
  entity_type,
  entity_id,
  follow_up_type,
  scheduled_at,
  message_template
) VALUES
  ('partnership', [partnership_id], 'payment_reminder', '2026-05-29', 'תזכורת: תשלום ראשון בעוד 3 ימים'),
  ('task', [task_id], 'deadline_reminder', '2026-06-09', 'תזכורת: אישור תוכן מחר'),
  ('contract', [contract_id], 'expiry_warning', '2026-12-01', 'חוזה Nike פוקע בעוד 30 יום'),
  ...;
```

---

## 🗄️ Database Schema Updates

### טבלת מסמכים:
```sql
CREATE TABLE partnership_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID REFERENCES partnerships(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  
  -- File info
  filename VARCHAR(255) NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  storage_path TEXT, -- Supabase Storage path
  
  -- Document type
  document_type VARCHAR(50) NOT NULL CHECK (
    document_type IN ('quote', 'contract', 'brief', 'invoice', 'receipt', 'other')
  ),
  
  -- AI parsing
  parsing_status VARCHAR(20) DEFAULT 'pending' CHECK (
    parsing_status IN ('pending', 'processing', 'completed', 'failed', 'manual')
  ),
  parsed_data JSONB, -- AI extraction results
  parsing_confidence DECIMAL(3,2), -- 0.00-1.00
  
  -- Metadata
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  parsed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_partnership_docs_partnership ON partnership_documents(partnership_id);
CREATE INDEX idx_partnership_docs_type ON partnership_documents(document_type);
CREATE INDEX idx_partnership_docs_status ON partnership_documents(parsing_status);
```

### טבלת AI parsing logs:
```sql
CREATE TABLE ai_parsing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES partnership_documents(id) ON DELETE CASCADE,
  
  -- Parsing attempt
  attempt_number INT DEFAULT 1,
  model_used VARCHAR(50), -- gpt-4o, claude-3-opus, etc.
  
  -- Results
  success BOOLEAN,
  extracted_data JSONB,
  confidence_scores JSONB, -- per field
  
  -- Errors
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT
);
```

---

## 🎨 UI Flow מלא

### 1. כפתור "➕ שת"פ חדש"
```typescript
// src/app/influencer/[username]/partnerships/page.tsx

<Button onClick={() => router.push(`/influencer/${username}/partnerships/new`)}>
  ➕ שת"פ חדש
</Button>
```

### 2. עמוד העלאה
```typescript
// src/app/influencer/[username]/partnerships/new/page.tsx

export default function NewPartnershipPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [documentTypes, setDocumentTypes] = useState<Record<string, DocumentType>>({});
  const [partnershipName, setPartnershipName] = useState('');
  
  const handleUpload = async () => {
    // 1. Upload files to Supabase Storage
    const uploadedFiles = await uploadFiles(files);
    
    // 2. Trigger AI parsing
    const parsedData = await parseDocuments(uploadedFiles, documentTypes);
    
    // 3. Redirect to review page
    router.push(`/influencer/${username}/partnerships/review?data=${encodeURIComponent(JSON.stringify(parsedData))}`);
  };
  
  return (
    <div>
      <h1>שת"פ חדש</h1>
      <input value={partnershipName} onChange={(e) => setPartnershipName(e.target.value)} />
      <FileUploader onFilesChange={setFiles} />
      <Button onClick={handleUpload}>📤 העלה וסרוק</Button>
    </div>
  );
}
```

### 3. עמוד Review
```typescript
// src/app/influencer/[username]/partnerships/review/page.tsx

export default function ReviewPartnershipPage() {
  const { data } = useSearchParams();
  const parsed = JSON.parse(decodeURIComponent(data));
  
  const [editedData, setEditedData] = useState(parsed);
  
  const handleConfirm = async () => {
    // Create partnership + tasks + invoices + follow-ups
    const result = await createPartnershipFromParsedData(editedData);
    
    toast.success('שת"פ נוצר בהצלחה! 🎉');
    router.push(`/influencer/${username}/partnerships/${result.id}`);
  };
  
  return (
    <div>
      <h1>אישור פרטי שת"פ</h1>
      
      {/* Editable fields */}
      <PartnershipDetailsEditor data={editedData} onChange={setEditedData} />
      
      {/* AI warnings */}
      <AIInsights parsed={parsed} />
      
      <Button onClick={handleConfirm}>✅ אשר ושמור</Button>
    </div>
  );
}
```

---

## 🔄 API Endpoints

### POST `/api/influencer/partnerships/parse`
```typescript
// Parse uploaded documents with AI

export async function POST(request: Request) {
  const { files, documentTypes } = await request.json();
  
  const results = await Promise.all(
    files.map(async (file) => {
      const parsed = await parseDocument(file, documentTypes[file.id]);
      return { fileId: file.id, parsed, confidence: calculateConfidence(parsed) };
    })
  );
  
  // Merge all parsed data into one partnership object
  const merged = mergeDocuments(results);
  
  return NextResponse.json({ success: true, data: merged });
}
```

### POST `/api/influencer/partnerships/create-from-parsed`
```typescript
// Create partnership + all related entities from parsed data

export async function POST(request: Request) {
  const { accountId, parsedData } = await request.json();
  
  const supabase = createClient();
  
  // 1. Create partnership
  const { data: partnership } = await supabase
    .from('partnerships')
    .insert({
      account_id: accountId,
      brand_name: parsedData.brandName,
      campaign_name: parsedData.campaignName,
      ...
    })
    .select()
    .single();
  
  // 2. Create tasks
  const tasks = parsedData.deliverables.map(d => ({
    account_id: accountId,
    partnership_id: partnership.id,
    title: d.description,
    due_date: d.dueDate,
    ...
  }));
  await supabase.from('tasks').insert(tasks);
  
  // 3. Create invoices
  const invoices = parsedData.paymentTerms.milestones.map(m => ({
    account_id: accountId,
    partnership_id: partnership.id,
    amount: m.amount,
    due_date: m.dueDate,
    ...
  }));
  await supabase.from('invoices').insert(invoices);
  
  // 4. Create follow-ups
  const followUps = generateFollowUps(partnership, tasks, invoices);
  await supabase.from('follow_ups').insert(followUps);
  
  return NextResponse.json({ success: true, partnership });
}
```

---

## 🧪 Testing Strategy

### Unit Tests:
```typescript
// Test AI parsing
describe('Document Parser', () => {
  it('should extract brand name from quote', async () => {
    const mockPDF = loadTestFile('quote_nike.pdf');
    const result = await parseDocument(mockPDF, 'quote');
    expect(result.brandName).toBe('Nike');
  });
  
  it('should identify all deliverables', async () => {
    const mockPDF = loadTestFile('quote_complex.pdf');
    const result = await parseDocument(mockPDF, 'quote');
    expect(result.deliverables).toHaveLength(5);
  });
});
```

### Integration Tests:
```typescript
// Test full flow
describe('Partnership Creation Flow', () => {
  it('should create partnership with all entities', async () => {
    const files = [mockQuotePDF, mockContractPDF];
    const result = await createPartnershipFromFiles(files);
    
    expect(result.partnership).toBeDefined();
    expect(result.tasks).toHaveLength(3);
    expect(result.invoices).toHaveLength(2);
    expect(result.followUps).toHaveLength(5);
  });
});
```

---

## 💡 Best Practices

### 1. **Confidence Thresholds**
```typescript
const CONFIDENCE_THRESHOLD = 0.80; // 80%

if (parsed.confidence < CONFIDENCE_THRESHOLD) {
  // Flag for manual review
  await flagForReview(documentId, 'Low confidence in AI parsing');
}
```

### 2. **Fallback to Manual**
```typescript
// Always allow manual override
<Button onClick={() => setManualMode(true)}>
  ✏️ מילוי ידני (ללא AI)
</Button>
```

### 3. **Incremental Parsing**
```typescript
// Don't fail entire flow if one document fails
const results = await Promise.allSettled(
  files.map(f => parseDocument(f))
);

const succeeded = results.filter(r => r.status === 'fulfilled');
const failed = results.filter(r => r.status === 'rejected');

if (failed.length > 0) {
  toast.warning(`${failed.length} מסמכים דורשים מילוי ידני`);
}
```

---

## 🎯 Success Criteria

✅ **מוכן כאשר:**
1. משפיען יכול להעלות 3+ מסמכים בבת אחת
2. AI מחלץ 80%+ מהשדות נכון
3. משפיען יכול לערוך ולאשר לפני שמירה
4. המערכת יוצרת אוטומטית: partnership + tasks + invoices + alerts
5. יש fallback למילוי ידני

**זה משנה את כל התמונה!** 🚀

עכשיו התוכנית:
1. מערכת הרשאות (P0)
2. **Document Intelligence (P0!)** ← חדש!
3. Notification Engine (P0)
4. Dashboards (P1)

**מה אתה אומר?** זה נכון?

