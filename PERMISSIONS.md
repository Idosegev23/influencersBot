# 🔐 מערכת הרשאות - Influencer OS

## סקירה
מערכת הרשאות רב-שכבתית עם 4 רמות גישה.

---

## 👥 4 רמות משתמשים

### 1. 🔴 Admin (מנהל מערכת)
**גישה:** הכל ללא הגבלה

**יכולות:**
- ✅ רואה את כל המשפיענים והמותגים
- ✅ רואה את כל השת"פים, משימות, חשבוניות
- ✅ גישה לכל ה-analytics
- ✅ ניהול משתמשים (הוספה, הסרה, שינוי תפקידים)
- ✅ גישה למסך ניהול (Admin Dashboard)
- ✅ צפייה ב-audit logs
- ✅ ניהול הרשאות
- ✅ גישה לכל ה-APIs ללא הגבלה

**דוגמאות שימוש:**
- בעל העסק
- CTO / מנהל טכני
- Support ברמה הכי גבוהה

---

### 2. 🟠 Agent (סוכן)
**גישה:** רק למשפיענים שהוא מנהל

**יכולות:**
- ✅ רואה רשימת המשפיענים שלו בלבד
- ✅ רואה dashboard של כל משפיען תחתיו
- ✅ רואה שת"פים, משימות, חשבוניות של המשפיענים שלו
- ✅ analytics מצטבר של המשפיענים שלו
- ✅ יכול לעבור בין משפיענים שלו
- ❌ לא רואה משפיענים של סוכנים אחרים
- ❌ לא רואה Admin Dashboard
- ❌ לא יכול לשנות הרשאות

**דוגמאות שימוש:**
- מנהל חשבונות
- Account manager
- Talent manager

**מבנה היררכי:**
```
Agent A
  ├── Influencer 1
  ├── Influencer 2
  └── Influencer 3

Agent B
  ├── Influencer 4
  └── Influencer 5
```

---

### 3. 🟢 Influencer / Brand (משפיען / מותג)
**גישה:** רק למידע שלו

**יכולות:**
- ✅ רואה רק את הדשבורד שלו
- ✅ רואה את השת"פים שלו בלבד
- ✅ רואה את המשימות שלו
- ✅ רואה את החשבוניות שלו
- ✅ analytics של הצ'אטבוט שלו
- ✅ מותגים וקופונים שלו
- ✅ שיחות של המשתמשים איתו
- ❌ לא רואה משפיענים/מותגים אחרים
- ❌ לא רואה נתונים של אחרים

**דוגמאות שימוש:**
- המשפיען עצמו
- המותג עצמו
- העוזר האישי של המשפיען

---

### 4. 🔵 Follower (עוקב / משתמש רגיל)
**גישה:** רק לצ'אטבוט ציבורי

**יכולות:**
- ✅ גישה לצ'אטבוט של המשפיען
- ✅ רואה מותגים וקופונים ציבוריים
- ✅ רואה תוכן שיווקי
- ✅ יכול לפתוח פניות תמיכה
- ❌ לא רואה dashboard
- ❌ לא רואה שת"פים
- ❌ לא רואה משימות
- ❌ לא רואה חשבוניות
- ❌ לא רואה analytics

**דוגמאות שימוש:**
- עוקב באינסטגרם
- מבקר באתר
- משתמש בצ'אטבוט

---

## 🗄️ Database Schema להרשאות

### טבלת `users` (חדשה):
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'agent', 'influencer', 'brand', 'follower')),
  
  -- For agents: which influencers they manage
  managed_account_ids UUID[], -- Array of account IDs
  
  -- For influencers/brands: their account
  account_id UUID REFERENCES accounts(id),
  
  -- Auth
  password_hash VARCHAR(255), -- או Supabase Auth
  last_login TIMESTAMPTZ,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_account_id ON users(account_id);
CREATE INDEX idx_users_email ON users(email);
```

### טבלת `role_permissions` (אופציונלי):
```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(20) NOT NULL,
  resource VARCHAR(50) NOT NULL, -- 'partnerships', 'tasks', 'analytics'
  action VARCHAR(20) NOT NULL, -- 'view', 'create', 'update', 'delete'
  allowed BOOLEAN DEFAULT true,
  
  UNIQUE(role, resource, action)
);
```

---

## 🔒 RLS Policies לפי תפקיד

### דוגמה: Partnerships

```sql
-- Admin: רואה הכל
CREATE POLICY "Admin can view all partnerships"
  ON partnerships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Agent: רואה רק משפיענים שלו
CREATE POLICY "Agent can view managed partnerships"
  ON partnerships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'agent'
      AND partnerships.account_id = ANY(users.managed_account_ids)
    )
  );

-- Influencer/Brand: רואה רק שלו
CREATE POLICY "Influencer can view own partnerships"
  ON partnerships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('influencer', 'brand')
      AND partnerships.account_id = users.account_id
    )
  );

-- Follower: לא רואה בכלל
-- (no policy = no access)
```

---

## 🛣️ Route Protection

### API Middleware:
```typescript
// src/middleware/auth.ts
export async function checkPermission(
  userId: string,
  resource: string,
  action: string,
  resourceAccountId?: string
): Promise<{ allowed: boolean; reason?: string }> {
  
  const user = await getUser(userId);
  
  // Admin: always allowed
  if (user.role === 'admin') {
    return { allowed: true };
  }
  
  // Agent: only if managing this account
  if (user.role === 'agent') {
    if (!resourceAccountId) return { allowed: false, reason: 'No account specified' };
    
    const isManaging = user.managed_account_ids?.includes(resourceAccountId);
    return { 
      allowed: isManaging,
      reason: isManaging ? undefined : 'Account not managed by this agent'
    };
  }
  
  // Influencer/Brand: only their own
  if (user.role === 'influencer' || user.role === 'brand') {
    if (user.account_id !== resourceAccountId) {
      return { allowed: false, reason: 'Can only access own data' };
    }
    return { allowed: true };
  }
  
  // Follower: no access to management resources
  if (user.role === 'follower') {
    return { allowed: false, reason: 'Followers cannot access management features' };
  }
  
  return { allowed: false, reason: 'Unknown role' };
}
```

### Frontend Route Guard:
```typescript
// src/components/RouteGuard.tsx
export function RouteGuard({ 
  children, 
  requiredRole,
  accountId 
}: { 
  children: React.ReactNode;
  requiredRole?: Role[];
  accountId?: string;
}) {
  const { user } = useAuth();
  
  // Check role
  if (requiredRole && !requiredRole.includes(user.role)) {
    return <AccessDenied />;
  }
  
  // Check account access (for agents/influencers)
  if (accountId && user.role === 'agent') {
    if (!user.managed_account_ids?.includes(accountId)) {
      return <AccessDenied />;
    }
  }
  
  if (accountId && (user.role === 'influencer' || user.role === 'brand')) {
    if (user.account_id !== accountId) {
      return <AccessDenied />;
    }
  }
  
  return <>{children}</>;
}
```

---

## 📱 UI לפי תפקיד

### Sidebar Navigation:

#### Admin:
```
├── 🏠 Overview (כל המשפיענים)
├── 👥 Users & Permissions
├── 📊 All Partnerships
├── ✅ All Tasks
├── 💰 All Invoices
├── 📈 Global Analytics
└── ⚙️ Settings
```

#### Agent:
```
├── 🏠 My Influencers
├── 📊 Partnerships (filtered)
├── ✅ Tasks (filtered)
├── 💰 Invoices (filtered)
├── 📈 Team Analytics
└── ⚙️ My Settings
```

#### Influencer/Brand:
```
├── 🏠 Dashboard
├── 📊 My Partnerships
├── ✅ My Tasks
├── 💰 My Invoices
├── 📅 Calendar
├── 📈 My Analytics
└── ⚙️ Settings
```

#### Follower:
```
├── 💬 Chat
└── (no dashboard access)
```

---

## 🎨 UI Components לפי הרשאה

### AccountSelector (לAdmin/Agent):
```tsx
// Admin רואה dropdown של כל החשבונות
// Agent רואה dropdown רק של המשפיענים שלו
// Influencer/Brand לא רואה selector (רק שלו)

{user.role === 'admin' || user.role === 'agent' ? (
  <AccountSelector 
    accounts={availableAccounts}
    onChange={setSelectedAccount}
  />
) : null}
```

### DataTable עם Permission Checks:
```tsx
<DataTable
  data={partnerships}
  canEdit={user.role === 'admin'} // רק Admin
  canDelete={user.role === 'admin'} // רק Admin
  canView={true} // כולם רואים (אם יש הרשאה להגיע לדף)
/>
```

---

## 🔄 Data Flow עם הרשאות

### 1. User logs in
```
Login → Verify credentials → Load user + role → Store in session
```

### 2. User navigates to page
```
Route → Check role → Load allowed accounts → Fetch data with filters
```

### 3. API call
```
Request → Extract user from session → Check permission → Query DB with RLS → Return filtered data
```

---

## 📋 Checklist ליישום

### Phase 1: Database
- [ ] Migration: טבלת `users`
- [ ] Migration: עדכון RLS policies לכל הטבלאות
- [ ] Migration: `role_permissions` (optional)
- [ ] Seed data: יצירת admin user ראשון

### Phase 2: Backend
- [ ] Auth middleware עם role checking
- [ ] Permission checking functions
- [ ] API updates לכל endpoint
- [ ] Session management

### Phase 3: Frontend
- [ ] Login/Register pages
- [ ] RouteGuard component
- [ ] Role-based navigation
- [ ] AccountSelector (admin/agent)
- [ ] AccessDenied page

### Phase 4: Testing
- [ ] Test כל תפקיד בנפרד
- [ ] Test agent עם 2+ משפיענים
- [ ] Test permission boundaries
- [ ] Test RLS policies

---

## 🚨 Security Considerations

### חובות:
1. ✅ **Never trust client-side** - תמיד לבדוק בserver
2. ✅ **RLS כשכבה ראשונה** - גם אם יש bug בקוד
3. ✅ **Audit log** - תיעוד כל גישה למידע רגיש
4. ✅ **Session timeout** - לא להשאיר סשן פתוח לנצח
5. ✅ **2FA למנהלים** - Admin/Agent צריכים 2FA

### אסורות:
1. ❌ לא לשמור role ב-localStorage (רק ב-session)
2. ❌ לא לסמוך על query params לבדיקת הרשאות
3. ❌ לא לחשוף account IDs של אחרים
4. ❌ לא לאפשר elevation of privilege בקוד

---

## 📚 Examples

### Example 1: Admin רואה הכל
```sql
-- Query
SELECT * FROM partnerships;

-- Result: כל השת"פים של כל המשפיענים
```

### Example 2: Agent רואה רק שלו
```sql
-- User: agent_id with managed_account_ids = [acc1, acc2]

SELECT * FROM partnerships 
WHERE account_id IN (
  SELECT unnest(managed_account_ids) 
  FROM users 
  WHERE id = 'agent_id'
);

-- Result: רק שת"פים של acc1 ו-acc2
```

### Example 3: Influencer רואה רק שלו
```sql
-- User: influencer_id with account_id = acc1

SELECT * FROM partnerships 
WHERE account_id = (
  SELECT account_id 
  FROM users 
  WHERE id = 'influencer_id'
);

-- Result: רק שת"פים של acc1
```

---

## 🎯 Summary

**4 רמות ברורות:**
1. 🔴 **Admin** - הכל
2. 🟠 **Agent** - המשפיענים שלו
3. 🟢 **Influencer/Brand** - רק שלו
4. 🔵 **Follower** - רק צ'אטבוט

**3 שכבות אבטחה:**
1. RLS (Database)
2. API Middleware
3. UI Route Guards

**VIEW ONLY:**
- לא טפסים ליצירה
- רק צפייה ואנליטיקס
- ממשק תמיכה למשפיען

**הכל מתועד, ברור, ומאובטח!** 🔐✅

