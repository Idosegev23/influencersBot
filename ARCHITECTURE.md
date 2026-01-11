# 🤖 InfluencerBot - תיעוד מערכת מלא

## 📋 תוכן עניינים
1. [סקירה כללית](#סקירה-כללית)
2. [ארכיטקטורה](#ארכיטקטורה)
3. [מודלים ו-Types](#מודלים-ו-types)
4. [זרימות עיקריות](#זרימות-עיקריות)
5. [API Endpoints](#api-endpoints)
6. [דף הצ'אט](#דף-הצאט)
7. [פאנל המשפיען](#פאנל-המשפיען)
8. [סריקת אינסטגרם](#סריקת-אינסטגרם)
9. [אינטגרציות](#אינטגרציות)
10. [מסד הנתונים](#מסד-הנתונים)
11. [משתני סביבה](#משתני-סביבה)

---

## סקירה כללית

**InfluencerBot** היא פלטפורמה ליצירת צ'אטבוטים מותאמים אישית למשפיענים.

### יכולות עיקריות:
- 🔍 סריקה אוטומטית של פרופיל אינסטגרם
- 🧠 יצירת פרסונה AI דינמית על בסיס התוכן
- 💬 צ'אטבוט חכם עם OpenAI Responses API
- 🎁 ניהול מותגים וקופונים
- 📞 מערכת תמיכה עם התראות WhatsApp
- 📊 אנליטיקס ומעקב שיחות
- 🎨 עיצוב מותאם אישית (themes)

### טכנולוגיות:
- **Frontend:** Next.js 16.1, React 19, Tailwind CSS 4, Framer Motion
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL)
- **AI:** OpenAI Responses API (gpt-5-nano, gpt-5)
- **Instagram Scraping:** Apify
- **WhatsApp:** GREEN-API

---

## ארכיטקטורה

### תרשים ארכיטקטורה כללי

```mermaid
flowchart TB
    subgraph Client["👤 Client"]
        ChatPage["Chat Page<br/>/chat/[username]"]
        DashboardPage["Influencer Dashboard<br/>/influencer/[username]"]
        AdminPage["Admin Panel<br/>/admin"]
    end

    subgraph NextJS["⚡ Next.js API Routes"]
        ChatAPI["/api/chat"]
        SupportAPI["/api/support-flow"]
        ScrapeAPI["/api/admin/scrape"]
        AuthAPI["/api/influencer/auth"]
        BrandsAPI["/api/influencer/products"]
    end

    subgraph External["🌐 External Services"]
        OpenAI["OpenAI<br/>Responses API"]
        Apify["Apify<br/>Instagram Scraper"]
        GreenAPI["GREEN-API<br/>WhatsApp"]
    end

    subgraph Database["🗄️ Supabase"]
        Influencers[(influencers)]
        Brands[(brands)]
        ContentItems[(content_items)]
        ChatSessions[(chat_sessions)]
        ChatMessages[(chat_messages)]
        SupportRequests[(support_requests)]
        AnalyticsEvents[(analytics_events)]
    end

    ChatPage --> ChatAPI
    ChatPage --> SupportAPI
    DashboardPage --> AuthAPI
    DashboardPage --> BrandsAPI
    AdminPage --> ScrapeAPI

    ChatAPI --> OpenAI
    SupportAPI --> OpenAI
    SupportAPI --> GreenAPI
    ScrapeAPI --> Apify
    ScrapeAPI --> OpenAI

    ChatAPI --> Influencers
    ChatAPI --> Brands
    ChatAPI --> ContentItems
    ChatAPI --> ChatSessions
    ChatAPI --> ChatMessages
    
    SupportAPI --> SupportRequests
    SupportAPI --> Brands
    
    ScrapeAPI --> Influencers
    ScrapeAPI --> ContentItems
```

### מבנה תיקיות

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── admin/               
│   │   │   ├── scrape/route.ts   # סריקת אינסטגרם
│   │   │   ├── influencers/      # CRUD משפיענים
│   │   │   └── products/         # CRUD מוצרים
│   │   ├── chat/route.ts         # API צ'אט ראשי
│   │   ├── support-flow/route.ts # תהליך תמיכה
│   │   └── influencer/
│   │       ├── auth/route.ts     # התחברות משפיען
│   │       └── rescan/route.ts   # סריקה מחדש
│   ├── chat/[username]/          # דף הצ'אטבוט
│   ├── influencer/[username]/    # דשבורד משפיען
│   │   ├── dashboard/
│   │   ├── brands/
│   │   ├── content/
│   │   ├── analytics/
│   │   ├── conversations/
│   │   ├── settings/
│   │   └── support/
│   └── admin/                    # פאנל אדמין
├── components/
│   ├── chat/
│   │   ├── BrandCards.tsx        # כרטיסיות מותגים
│   │   └── SupportFlowForm.tsx   # טופס תמיכה
│   └── wizard/                   # אשף הוספת משפיען
├── lib/
│   ├── openai.ts                 # אינטגרציית OpenAI
│   ├── supabase.ts               # פונקציות DB
│   ├── apify.ts                  # סריקת אינסטגרם
│   ├── whatsapp.ts               # שליחת WhatsApp
│   └── theme.ts                  # ניהול עיצוב
└── types/
    └── index.ts                  # TypeScript Types
```

---

## מודלים ו-Types

### תרשים ER - מסד הנתונים

```mermaid
erDiagram
    INFLUENCERS {
        uuid id PK
        string username UK
        string subdomain UK
        string display_name
        text bio
        string avatar_url
        int followers_count
        int following_count
        enum influencer_type
        jsonb persona
        jsonb theme
        string admin_password_hash
        boolean is_active
        timestamp last_synced_at
        text greeting_message
        jsonb suggested_questions
        boolean hide_branding
        boolean whatsapp_enabled
        string phone_number
    }

    BRANDS {
        uuid id PK
        uuid influencer_id FK
        string brand_name
        text description
        string coupon_code
        string link
        string category
        string whatsapp_phone
        boolean is_active
        timestamp created_at
    }

    CONTENT_ITEMS {
        uuid id PK
        uuid influencer_id FK
        enum type
        string title
        text description
        jsonb content
        string image_url
        timestamp created_at
    }

    CHAT_SESSIONS {
        uuid id PK
        uuid influencer_id FK
        string thread_id
        int message_count
        timestamp created_at
    }

    CHAT_MESSAGES {
        uuid id PK
        uuid session_id FK
        enum role
        text content
        timestamp created_at
    }

    SUPPORT_REQUESTS {
        uuid id PK
        uuid influencer_id FK
        string brand
        string customer_name
        string order_number
        text problem
        string phone
        enum status
        boolean whatsapp_sent
        timestamp created_at
    }

    ANALYTICS_EVENTS {
        uuid id PK
        uuid influencer_id FK
        enum event_type
        uuid session_id FK
        jsonb metadata
        timestamp created_at
    }

    INFLUENCERS ||--o{ BRANDS : has
    INFLUENCERS ||--o{ CONTENT_ITEMS : has
    INFLUENCERS ||--o{ CHAT_SESSIONS : has
    INFLUENCERS ||--o{ SUPPORT_REQUESTS : has
    INFLUENCERS ||--o{ ANALYTICS_EVENTS : has
    CHAT_SESSIONS ||--o{ CHAT_MESSAGES : contains
```

### Types עיקריים

```typescript
// סוג משפיען
type InfluencerType = 
  | 'food' | 'fashion' | 'tech' | 'lifestyle' 
  | 'fitness' | 'beauty' | 'parenting' | 'travel' | 'other';

// פרסונה (נוצרת אוטומטית מהתוכן)
interface InfluencerPersona {
  tone: string;              // "חם", "מקצועי", "משעשע"
  style: string;             // "קליל", "ידידותי", "מעורר השראה"
  interests: string[];       // תחומי עניין
  signature_phrases: string[]; // ביטויים אופייניים
  emoji_style: 'none' | 'minimal' | 'frequent';
  language: 'he' | 'en' | 'mixed';
}

// סוגי תוכן דינמיים
type ContentItemType = 
  | 'recipe' | 'review' | 'recommendation'  // Food
  | 'look' | 'outfit' | 'style_tip'        // Fashion
  | 'tutorial' | 'routine'                  // Beauty
  | 'tip' | 'moment' | 'story'             // Lifestyle
  | 'workout' | 'motivation'               // Fitness
  | 'collaboration' | 'event' | 'unboxing' | 'itinerary';

// מותג/שיתוף פעולה
interface Brand {
  id: string;
  influencer_id: string;
  brand_name: string;
  description: string | null;
  coupon_code: string | null;
  link: string | null;
  category: string | null;
  whatsapp_phone: string | null;
  is_active: boolean;
}
```

---

## זרימות עיקריות

### 1. זרימת צ'אט רגיל

```mermaid
sequenceDiagram
    participant User as 👤 משתמש
    participant Chat as 💬 Chat Page
    participant API as ⚡ /api/chat
    participant Support as 🎯 /api/support-flow
    participant OpenAI as 🧠 OpenAI
    participant DB as 🗄️ Supabase

    User->>Chat: שולח הודעה
    Chat->>Support: בדיקת Intent (האם תמיכה?)
    Support->>OpenAI: detectIntent()
    OpenAI-->>Support: {intent: "general", confidence: 0.2}
    Support-->>Chat: {action: "use_assistant"}
    
    Chat->>API: POST /api/chat
    API->>DB: getInfluencerByUsername()
    API->>DB: getBrandsByInfluencer()
    API->>DB: getContentByInfluencer()
    API->>API: buildInfluencerInstructions()
    API->>OpenAI: responses.create()
    OpenAI-->>API: תשובה + responseId
    API->>DB: saveChatMessage()
    API->>DB: trackEvent()
    API-->>Chat: {response, responseId, sessionId}
    Chat-->>User: מציג תשובה
```

### 2. זרימת תמיכה (Support Flow)

```mermaid
sequenceDiagram
    participant User as 👤 משתמש
    participant Chat as 💬 Chat Page
    participant API as 🎯 /api/support-flow
    participant OpenAI as 🧠 OpenAI
    participant WA as 📱 WhatsApp
    participant DB as 🗄️ Supabase

    User->>Chat: "הקופון לא עובד"
    Chat->>API: POST (step: detect)
    API->>OpenAI: detectIntent()
    OpenAI-->>API: {intent: "support", confidence: 0.9}
    API-->>Chat: {step: "brand", action: "show_brands", brands: [...]}
    Chat-->>User: מציג כרטיסיות מותגים

    User->>Chat: בוחר "Renuar"
    Chat->>API: POST (step: brand, message: "Renuar")
    API-->>Chat: {step: "name", action: "collect_input"}
    Chat-->>User: "מה השם שלך?"

    User->>Chat: "שרה"
    Chat->>API: POST (step: name)
    API-->>Chat: {step: "order"}
    
    User->>Chat: "12345"
    Chat->>API: POST (step: order)
    API-->>Chat: {step: "problem"}
    
    User->>Chat: "הקופון RENUAR20 לא עובד באתר"
    Chat->>API: POST (step: problem)
    API-->>Chat: {step: "phone"}
    
    User->>Chat: "0541234567"
    Chat->>API: POST (step: phone)
    
    API->>DB: saveSupportRequest()
    API->>WA: notifyBrandSupport()
    WA-->>API: {success: true}
    API->>WA: sendSupportConfirmation()
    WA-->>API: {success: true}
    
    API-->>Chat: {step: "complete", whatsappSent: true}
    Chat-->>User: "הפנייה נשלחה! 🎉"
```

### 3. זרימת סריקה (Admin Scrape)

```mermaid
sequenceDiagram
    participant Admin as 👨‍💼 Admin
    participant API as ⚡ /api/admin/scrape
    participant Apify as 📸 Apify
    participant OpenAI as 🧠 OpenAI
    participant DB as 🗄️ Supabase

    Admin->>API: POST {username: "danielamit"}
    
    API->>Apify: scrapeInstagramProfile()
    Note over Apify: מריץ Actor<br/>instagram-scraper
    Apify-->>API: {profile, posts: [...50]}
    
    loop כל 50 פוסטים
        API->>OpenAI: extractContentFromPost()
        OpenAI-->>API: {type, title, description, content}
    end
    
    API->>OpenAI: generatePersonaFromPosts()
    OpenAI-->>API: {tone, style, interests, ...}
    
    API->>OpenAI: generateGreetingAndQuestions()
    OpenAI-->>API: {greeting, questions: [...]}
    
    API->>DB: DELETE old content_items
    API->>DB: INSERT new content_items
    API->>DB: UPDATE influencer (persona, greeting)
    
    API-->>Admin: {success, stats: {products: 5, content: 48}}
```

---

## API Endpoints

### 🔐 Authentication

| Endpoint | Method | תיאור |
|----------|--------|-------|
| `/api/influencer/auth` | GET | בדיקת התחברות משפיען |
| `/api/influencer/auth` | POST | התחברות/התנתקות |
| `/api/admin` | POST | התחברות אדמין |

### 💬 Chat

| Endpoint | Method | תיאור |
|----------|--------|-------|
| `/api/chat` | POST | שליחת הודעה לצ'אטבוט |
| `/api/support-flow` | POST | טיפול בפניות תמיכה |
| `/api/support` | POST | שליחת פנייה ישירה |

### 📊 Admin

| Endpoint | Method | תיאור |
|----------|--------|-------|
| `/api/admin/scrape` | POST | סריקת אינסטגרם מלאה |
| `/api/admin/influencers` | GET/POST | רשימת/יצירת משפיענים |
| `/api/admin/products` | GET/POST/PUT/DELETE | CRUD מוצרים |
| `/api/admin/content` | GET | רשימת תוכן |

### 🔧 Influencer Management

| Endpoint | Method | תיאור |
|----------|--------|-------|
| `/api/influencer/rescan` | POST | סריקה מחדש |
| `/api/influencer/products` | GET/POST/PUT/DELETE | ניהול מותגים |
| `/api/influencer/content` | GET | תוכן המשפיען |
| `/api/influencer/regenerate-greeting` | POST | יצירת ברכה מחדש |

---

## דף הצ'אט

### מבנה הקומפוננטה

```mermaid
flowchart TB
    subgraph ChatPage["/chat/[username]"]
        Header[Header<br/>אווטאר + שם + טאבים]
        
        subgraph Tabs[תצוגות]
            ChatTab[Chat Tab]
            SearchTab[Search Tab]
        end
        
        subgraph ChatContent[תוכן צ'אט]
            EmptyState[מצב התחלתי<br/>ברכה + שאלות מוצעות + מותגים]
            Messages[הודעות]
            BrandCards[כרטיסיות מותגים<br/>במצב תמיכה]
            SupportForm[טופס תמיכה<br/>איסוף פרטים]
            TypingIndicator[מחוון הקלדה]
        end
        
        InputBar[שדה קלט + כפתור שליחה]
        SupportModal[מודל פנייה ישירה]
    end
    
    Header --> Tabs
    ChatTab --> ChatContent
    SearchTab --> BrandsList[רשימת מותגים + קופונים]
    ChatContent --> InputBar
```

### States

```typescript
// מצב תמיכה
interface SupportState {
  step: 'detect' | 'brand' | 'name' | 'order' | 'problem' | 'phone' | 'complete';
  data: {
    brand?: string;
    customerName?: string;
    orderNumber?: string;
    problemDetails?: string;
    customerPhone?: string;
  };
}

// הודעה
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: 'show_brands' | 'collect_input' | 'complete';
  brands?: BrandInfo[];
  inputType?: 'name' | 'order' | 'problem' | 'phone';
}
```

---

## פאנל המשפיען

### מפת ניווט

```mermaid
flowchart TB
    Login["/influencer/[username]<br/>התחברות"]
    Dashboard["/influencer/[username]/dashboard<br/>דשבורד"]
    
    subgraph Pages[עמודים]
        Brands["/brands<br/>מותגים וקופונים"]
        Content["/content<br/>תוכן"]
        Analytics["/analytics<br/>אנליטיקס"]
        Conversations["/conversations<br/>שיחות"]
        Support["/support<br/>פניות תמיכה"]
        Settings["/settings<br/>הגדרות"]
        Share["/share<br/>QR + UTM"]
    end
    
    Login -->|סיסמה נכונה| Dashboard
    Dashboard --> Brands
    Dashboard --> Content
    Dashboard --> Analytics
    Dashboard --> Conversations
    Dashboard --> Support
    Dashboard --> Settings
    Dashboard --> Share
```

### יכולות בכל עמוד

| עמוד | יכולות |
|------|--------|
| **Dashboard** | סטטיסטיקות, קישור לצ'אטבוט, סריקה מחדש |
| **Brands** | הוספה/עריכה/מחיקה של מותגים וקופונים |
| **Content** | צפייה בתוכן שנשלף מאינסטגרם |
| **Analytics** | גרפים, טופ מוצרים, פעילות יומית |
| **Conversations** | צפייה בשיחות, חיפוש |
| **Support** | ניהול פניות תמיכה |
| **Settings** | עריכת פרסונה, עיצוב, WhatsApp |
| **Share** | QR Code, לינקים עם UTM |

---

## סריקת אינסטגרם

### תהליך הסריקה

```mermaid
flowchart TB
    Start([התחלה]) --> Apify
    
    subgraph Apify[Apify Scraper]
        FetchProfile[שליפת פרופיל]
        FetchPosts[שליפת עד 50 פוסטים]
        FetchProfile --> FetchPosts
    end
    
    Apify --> Analysis
    
    subgraph Analysis[ניתוח AI]
        DetectType[זיהוי סוג משפיען<br/>food/fashion/tech...]
        ExtractContent[חילוץ תוכן מכל פוסט<br/>מתכונים/לוקים/טיפים...]
        GeneratePersona[יצירת פרסונה<br/>טון, סגנון, ביטויים]
        GenerateGreeting[יצירת ברכה ושאלות]
        
        DetectType --> ExtractContent
        ExtractContent --> GeneratePersona
        GeneratePersona --> GenerateGreeting
    end
    
    Analysis --> Save
    
    subgraph Save[שמירה ל-DB]
        SaveContent[שמירת content_items]
        UpdateInfluencer[עדכון persona, greeting]
        SaveContent --> UpdateInfluencer
    end
    
    Save --> End([סיום])
```

### סוגי תוכן לפי סוג משפיען

| סוג משפיען | סוגי תוכן |
|-----------|----------|
| **Food** | recipe, review, tip, recommendation |
| **Fashion** | look, outfit, collaboration, style_tip, event |
| **Beauty** | tutorial, review, tip, look, routine |
| **Lifestyle** | tip, moment, review, recommendation, story |
| **Fitness** | workout, tip, routine, motivation, recipe |
| **Parenting** | tip, story, recommendation, moment, review |
| **Tech** | review, tutorial, tip, unboxing |
| **Travel** | review, tip, recommendation, story, itinerary |

---

## אינטגרציות

### OpenAI - Responses API

```mermaid
flowchart LR
    subgraph Models[מודלים בשימוש]
        Nano["gpt-5-nano<br/>צ'אט + זיהוי Intent"]
        Full["gpt-5<br/>פרסונה + ברכות"]
    end
    
    subgraph Features[יכולות]
        Chat[צ'אט Multi-turn<br/>previous_response_id]
        JSON[JSON Schema<br/>תשובות מובנות]
        Store[Stateful<br/>store: true]
    end
    
    Nano --> Chat
    Nano --> JSON
    Full --> JSON
    Chat --> Store
```

### WhatsApp - GREEN-API

```mermaid
flowchart LR
    subgraph Triggers[טריגרים]
        SupportComplete[פנייה הושלמה]
    end
    
    subgraph Messages[הודעות]
        ToBrand[למותג<br/>פרטי הפנייה]
        ToCustomer[ללקוח<br/>אישור קבלה]
    end
    
    SupportComplete --> ToBrand
    SupportComplete --> ToCustomer
```

### Apify - Instagram Scraper

```mermaid
flowchart LR
    Input[username] --> Actor[apify/instagram-scraper]
    Actor --> Profile[נתוני פרופיל]
    Actor --> Posts[עד 50 פוסטים]
```

---

## מסד הנתונים

### טבלאות עיקריות

```sql
-- משפיענים
CREATE TABLE influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR UNIQUE NOT NULL,
  subdomain VARCHAR UNIQUE NOT NULL,
  display_name VARCHAR NOT NULL,
  bio TEXT,
  avatar_url VARCHAR,
  followers_count INTEGER DEFAULT 0,
  influencer_type VARCHAR DEFAULT 'other',
  persona JSONB,
  theme JSONB NOT NULL,
  admin_password_hash VARCHAR NOT NULL,
  is_active BOOLEAN DEFAULT true,
  greeting_message TEXT,
  suggested_questions JSONB DEFAULT '[]',
  whatsapp_enabled BOOLEAN DEFAULT false,
  phone_number VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- מותגים
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id),
  brand_name VARCHAR NOT NULL,
  description TEXT,
  coupon_code VARCHAR,
  link VARCHAR,
  category VARCHAR,
  whatsapp_phone VARCHAR,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- פריטי תוכן
CREATE TABLE content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id),
  type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  content JSONB DEFAULT '{}',
  image_url VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- פניות תמיכה
CREATE TABLE support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id),
  brand VARCHAR NOT NULL,
  customer_name VARCHAR NOT NULL,
  order_number VARCHAR,
  problem TEXT NOT NULL,
  phone VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'open',
  whatsapp_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
```

### RLS Policies

```sql
-- לדוגמה: גישה ציבורית לטבלאות צ'אט
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert" ON chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public select" ON chat_sessions FOR SELECT USING (true);
CREATE POLICY "Public update" ON chat_sessions FOR UPDATE USING (true);
```

---

## משתני סביבה

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# OpenAI
OPENAI_API_KEY=sk-...

# Apify
APIFY_TOKEN=apify_api_...

# GREEN-API (WhatsApp)
GREEN_API_INSTANCE_ID=1234567890
GREEN_API_TOKEN=...

# Admin
ADMIN_PASSWORD=your_admin_password
```

---

## סיכום

InfluencerBot היא מערכת מלאה לניהול צ'אטבוטים למשפיענים, הכוללת:

1. **סריקה אוטומטית** - Apify מביא את התוכן, AI מנתח ויוצר פרסונה
2. **צ'אט חכם** - OpenAI Responses API עם זיכרון שיחה
3. **תמיכה משולבת** - זיהוי אוטומטי + תהליך מובנה + WhatsApp
4. **דשבורד מלא** - ניהול מותגים, תוכן, אנליטיקס

### קישורים חשובים

- **Vercel:** הפרויקט מופעל ב-Vercel
- **Supabase:** ניהול DB ואותנטיקציה
- **OpenAI:** Responses API (gpt-5-nano / gpt-5)
- **Apify:** סריקת אינסטגרם
- **GREEN-API:** WhatsApp Integration

---

*תיעוד זה נוצר אוטומטית ומייצג את מצב המערכת נכון ל-2026.*



