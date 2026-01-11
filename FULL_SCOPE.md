# 📊 Scope מלא - Influencer OS

## מבוסס על Flowchart המפורט

---

## 1️⃣ צד משפיען - ניהול תפעולי

### 1.1.1 דשבורד התנהגות קהל

#### **1.1.1.1 שיחות**
- [ ] סה"כ שיחות
  - [ ] בתהליך
  - [ ] נסגרו

#### **1.1.1.2 קופונים - חלוקה לפי שת"פ**

**עוקב / לא עוקב:**

**כמה הועתק:**
- [ ] מספר העתקות
- [ ] **פולואפ אוטומטי** (התראה)
- [ ] מעקב שביעות רצון
  - [ ] **פולואפ אוטומטי** (התראה)

**כמה שומשו:**
- [ ] שווי בכסף
- [ ] כמות
- [ ] סל ממוצע
- [ ] כמות מוצרים להזמנה
- [ ] אחוז המרה
- [ ] רווח פר קופון
- [ ] המוצרים הנמכרים ביותר

**בעיות:**
- [ ] כמה פתוח
  - [ ] **פולואפ אוטומטי** (התראה)
- [ ] כמה סגור
  - [ ] **פולואפ אוטומטי** (התראה)

**לא עוקב:**
- [ ] איסוף פרטים (lead generation)
- [ ] המרה לעוקב
  - [ ] **פולואפ אוטומטי** (התראה)

#### **1.1.1.3 תפיסה ברשת**
- [ ] סושיאל ליסנינג
  - [ ] לפי פלטפורמות (Instagram, TikTok, Facebook, Twitter)
  - [ ] ניתוח סנטימנט
  - [ ] **התראות על אזכורים שליליים**

---

### 1.1.2 ניהול לוח זמנים

- [ ] **התממשקות לGoogle Calendar**
- [ ] הזנת אירועים חיצוניים
- [ ] **סיכום יומי אוטומטי** של כל הפעילות
- [ ] **תזכורות לאירועים**

---

### 1.1.3 דשבורד פעילות עסקית

#### **1.1.3.1 הצעות לשת"פים**

**הצעת מחיר:**
- [ ] פתוח
  - [ ] **פולואפ אוטומטי** (תזכורת למשפיען/מותג)
- [ ] סגור → חוזה
  - [ ] בריף
  - [ ] סיכום אמלק (Airtable)

#### **1.1.3.2 תקשורת מותגים**

**פיננסי:**
- [ ] פתוח
  - [ ] **התראות אוטומטיות** (תשלום לא שולם, איחור)
- [ ] סגור
  - [ ] **התראות** (אישור קבלה)

**משפטי:**
- [ ] פתוח
  - [ ] **התראות** (חוזה טרם נחתם, בעיות משפטיות)
- [ ] סגור
  - [ ] **התראות** (חוזה נחתם בהצלחה)

**בעיות סביב השת"פ:**
- [ ] פתוח
  - [ ] **התראות** (בעיה חדשה, זמן תגובה עבר)
- [ ] סגור
  - [ ] **התראות** (בעיה נפתרה)

#### **1.1.3.2.4 שת"פים**

**שת"פ פעיל - Dashboard:**

**ספריה אדמיניסטרטיבית:**

1. **הצעת מחיר**
   - [ ] משימות
     - [ ] לוח עבודה (Gantt/Kanban)
     - [ ] מחקר שוק ורפרנסים
     - [ ] בדיקת תקינות קופונים (אוטומטי)
     - [ ] יצירת תוכן:
       - מודעות מדיה
       - אימייל מרקטינג
       - סרטוני AI
       - UGC
       - CRO
   - [ ] **תזכורות אוטומטיות** למשימות

2. **חוזה**
   - [ ] Upload/View חוזה
   - [ ] **תזכורות** (תאריך תפוגה, תנאים, חידוש)

3. **סיכום פרויקט**
   - [ ] דרישת תשלום
     - [ ] **תזכורות אוטומטיות** (תשלום לא שולם)
   - [ ] חשבונית מס/קבלה
     - [ ] **תזכורות** (להנפיק חשבונית)

**שת"פ הסתיים - Dashboard:**
- [ ] כל הנ"ל + תוכן הפרויקט (ארכיון)
- [ ] הצעה להמשך פעילות (upsell)

---

## 2️⃣ צד עוקב - צ'אטבוט

### 2.1.1 בניית פרסונה

- [ ] **התממשקות עם Instagram** (scraping/API)
- [ ] **התממשקות עם IMAI** (influencer data)
- [ ] קבלת מידע מהסוכן
- [ ] שאלות ותשובות על שת"פים

### 2.1.2 איסוף דאטה

- [ ] איסוף דאטה נסתר (behavioral tracking)
- [ ] איסוף דאטה גלוי/רשמי (forms, surveys)

---

## 🔔 מערכת התראות - הליבה של המערכת!

### סוגי התראות:

#### **1. פולואפ אוטומטי (Follow-ups)**
- קופון הועתק → תזכורת לבדוק שביעות רצון (אחרי 3 ימים)
- שיחה לא נסגרה → תזכורת לסגור (אחרי 24 שעות)
- לא עוקב לקח קופון → תזכורת להמיר (אחרי שבוע)
- הצעת מחיר פתוחה → תזכורת (אחרי שבועיים)

#### **2. תזכורות לוח זמנים (Reminders)**
- חוזה קרוב לפקיעה → התראה (30/7/1 ימים לפני)
- תשלום לא שולם → התראה (3 ימים לאחר due date)
- משימה קרובה → התראה (יום לפני, בוקר אותו יום)
- אירוע בקלנדר → התראה (שעה לפני)

#### **3. התראות בעיות (Alerts)**
- קופון לא עובד → התראה מיידית
- בעיה חדשה נפתחה → התראה מיידית
- חוזה טרם נחתם (איחור) → התראה
- תשלום באיחור → התראה דחופה

#### **4. התראות אנליטיקס (Insights)**
- קופון מגיע לתקרת שימוש → התראה
- שת"פ עם ROI נמוך → המלצה לפעולה
- עלייה/ירידה חדה בביצועים → התראה

---

## 🗄️ Database Schema - הרחבות נדרשות

### **טבלאות חדשות:**

```sql
-- Social listening data
CREATE TABLE social_mentions (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  platform VARCHAR(50), -- instagram, tiktok, etc.
  mention_type VARCHAR(20), -- post, comment, story, dm
  content TEXT,
  sentiment VARCHAR(20), -- positive, neutral, negative
  engagement_count INT,
  mentioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coupon usage tracking (מותג מזין)
CREATE TABLE coupon_usage (
  id UUID PRIMARY KEY,
  coupon_code VARCHAR(100),
  brand_id UUID REFERENCES brands(id),
  account_id UUID REFERENCES accounts(id),
  
  -- מי השתמש
  user_identifier VARCHAR(255), -- phone/email (hashed)
  is_follower BOOLEAN DEFAULT false,
  
  -- פרטי השימוש
  order_value DECIMAL(10,2),
  order_items_count INT,
  discount_amount DECIMAL(10,2),
  products JSONB, -- רשימת מוצרים
  
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Follow-ups & Reminders
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  
  -- מה לעקוב
  entity_type VARCHAR(50), -- coupon_copy, conversation, lead, partnership
  entity_id UUID,
  
  -- סוג הפולואפ
  follow_up_type VARCHAR(50), -- satisfaction_check, close_conversation, convert_lead
  
  -- מתי
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- סטטוס
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, cancelled
  
  -- תוכן
  message_template TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts & Notifications (הרחבה)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'; -- low, normal, high, urgent
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category VARCHAR(50); -- follow_up, reminder, alert, insight
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT; -- קישור לפעולה
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ; -- התראה תפוגה
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ; -- מתי סגרו
```

---

## 🔄 Integrations נדרשות

### **חיצוניות (Critical):**
1. **Google Calendar** - sync אירועים
2. **Instagram API** - persona + content scraping
3. **IMAI API** - influencer data
4. **Social Listening** (Brand24/Mention) - sentiment analysis
5. **WhatsApp Business** (GreenAPI) - notifications
6. **Email** (SendGrid/Resend) - email alerts

### **פנימיות:**
1. **Cron Jobs** - automated follow-ups
2. **Event Queue** (Redis/BullMQ) - async notifications
3. **Notification Engine** - unified alerts system

---

## 📊 Analytics - הרחבות

### **Dashboard קהל:**
```typescript
interface AudienceDashboard {
  conversations: {
    total: number;
    inProgress: number;
    closed: number;
  };
  
  coupons: {
    byPartnership: PartnershipCouponStats[];
    followers: {
      copied: number;
      used: number;
      avgBasket: number;
      conversionRate: number;
      topProducts: Product[];
    };
    nonFollowers: {
      leadsCaptured: number;
      converted: number;
    };
    issues: {
      open: number;
      closed: number;
    };
  };
  
  socialPerception: {
    platforms: PlatformMention[];
    sentiment: SentimentScore;
  };
}
```

### **Dashboard שת"פ:**
```typescript
interface PartnershipDashboard {
  quote: QuoteDetails;
  contract: ContractDetails;
  tasks: Task[];
  workCalendar: CalendarEvent[];
  projectSummary: {
    paymentRequest: PaymentRequest;
    invoice: Invoice;
  };
  
  // רק לשת"פ הסתיים
  completedContent?: ContentArchive;
  nextActivityProposal?: Proposal;
}
```

---

## 🎯 Implementation Priority

### **P0 - קריטי (חודש ראשון):**
1. ✅ מערכת הרשאות (כבר בתוכנית)
2. 🔔 **מערכת התראות + פולואפים**
3. 📊 Dashboard קהל בסיסי (שיחות + קופונים)
4. 📅 Google Calendar integration
5. 💼 Dashboard שת"פ פעיל (view only)

### **P1 - חשוב (חודש שני):**
6. 📱 Social Listening integration
7. 📊 Analytics מתקדם (ROI, conversion tracking)
8. 💰 מעקב כספי מלא (תשלומים + חשבוניות)
9. 📄 Contract management
10. 🤖 Automation rules (אוטומטיות התראות)

### **P2 - עתידי (חודש שלישי+):**
11. 🔗 IMAI integration
12. 📧 Email marketing integration
13. 📈 Advanced analytics (ML predictions)
14. 🎨 Content creation tools
15. 🔄 Airtable sync (Amlak)

---

## 🚨 התראות - ארכיטקטורה

### **Notification Engine:**

```typescript
interface NotificationRule {
  id: string;
  trigger: {
    event: string; // coupon_copied, task_due, payment_overdue
    conditions: Record<string, any>;
  };
  
  timing: {
    delay?: number; // דקות/שעות/ימים אחרי trigger
    schedule?: string; // cron expression
  };
  
  action: {
    type: 'notification' | 'email' | 'whatsapp' | 'sms';
    template: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
  };
  
  repeat?: {
    interval: number;
    maxAttempts: number;
    until: 'completed' | 'cancelled' | 'date';
  };
}
```

### **דוגמאות לרולים:**

```typescript
const rules: NotificationRule[] = [
  {
    id: 'coupon_copied_followup',
    trigger: {
      event: 'coupon_copied',
      conditions: { is_follower: true }
    },
    timing: { delay: 3 * 24 * 60 }, // 3 days
    action: {
      type: 'notification',
      template: 'satisfaction_check',
      priority: 'normal'
    }
  },
  
  {
    id: 'payment_overdue',
    trigger: {
      event: 'invoice_due_date_passed',
      conditions: { status: 'sent' }
    },
    timing: { delay: 3 * 24 * 60 }, // 3 days after due
    action: {
      type: 'notification',
      template: 'payment_reminder',
      priority: 'urgent'
    },
    repeat: {
      interval: 7 * 24 * 60, // every week
      maxAttempts: 3,
      until: 'completed'
    }
  },
  
  {
    id: 'contract_expiring',
    trigger: {
      event: 'contract_expiry_approaching',
      conditions: {}
    },
    timing: { schedule: '0 9 * * *' }, // daily at 9am
    action: {
      type: 'notification',
      template: 'contract_renewal',
      priority: 'high'
    }
  }
];
```

---

## 📋 Checklist מעודכן

### Phase 1: Foundations (שבוע 1-2)
- [ ] מערכת הרשאות (Admin, Agent, Influencer, Follower)
- [ ] Database migrations להרחבות
- [ ] Notification Engine core

### Phase 2: Alerts & Follow-ups (שבוע 3-4)
- [ ] טבלאות: follow_ups, social_mentions, coupon_usage
- [ ] Notification rules engine
- [ ] Cron jobs לאוטומציה
- [ ] Email/WhatsApp integration

### Phase 3: Dashboards (שבוע 5-6)
- [ ] Dashboard קהל (conversations, coupons, perception)
- [ ] Dashboard שת"פ פעיל
- [ ] Calendar integration

### Phase 4: Analytics (שבוע 7-8)
- [ ] Social listening
- [ ] ROI tracking
- [ ] Conversion funnels

---

## 💡 Key Insights

1. **מערכת ההתראות היא הלב** - בלעדיה המשפיען לא יכול לעבוד
2. **VIEW ONLY נכון** - אבל צריך imports/integrations לנתונים חיצוניים
3. **Automation קריטית** - פולואפים חייבים להיות אוטומטיים
4. **Multi-tenant מורכב** - כל נתון חייב account_id
5. **Real-time לא תמיד** - רוב ההתראות יכולות להיות async

---

**זה הסקופ המלא!** 🎯

עכשיו השאלה: **באיזה סדר אתה רוצה לבנות?**

אני ממליץ:
1. מערכת התראות (P0) - בלעדיה כלום לא עובד
2. Dashboard קהל (P0) - הערך המיידי למשפיען
3. Dashboard שת"פ (P0) - ניהול יומיומי
4. Integrations (P1) - נתונים אמיתיים

