# 🗺️ תוכנית יישום - מערכת הרשאות + VIEW ONLY

## 📋 סדר עדיפויות

### 🔴 P0 - קריטי (חובה לפני launch)
1. **מערכת הרשאות בסיסית**
   - 4 תפקידים: Admin, Agent, Influencer, Follower
   - RLS policies
   - Auth middleware
   
2. **Dashboard לפי תפקיד**
   - Admin: רואה הכל
   - Agent: רואה המשפיענים שלו
   - Influencer: רואה רק שלו
   
3. **עמודי פרטים VIEW ONLY**
   - Partnership details
   - Task details

### 🟠 P1 - חשוב (שבוע-שבועיים)
4. **AccountSelector למנהלים**
5. **חיפוש וסינון מתקדם**
6. **Timeline views**

### 🟢 P2 - נחמד לקבל (חודש)
7. **Calendar integration**
8. **PDF/File viewers**
9. **Export capabilities**

---

## 🎯 Priority Order (מעודכן!)

### P0 - Must Have (שבועות 1-3):
1. ✅ **מערכת הרשאות** - Admin, Agent, Influencer, Follower
2. 🤖 **Document Intelligence** - AI parsing של מסמכים
3. 🔔 **Notification Engine** - פולואפים ותזכורות אוטומטיים
4. 📊 **Dashboard קהל בסיסי** - שיחות + קופונים

### P1 - Important (שבועות 4-6):
5. 💼 **Dashboard שת"פים** - view + auto-created data
6. 📅 **Google Calendar Integration**
7. 📱 **Social Listening** (stub או real)
8. 💰 **מעקב כספי מלא**

### P2 - Nice to Have (חודשיים+):
9. 🔗 **Instagram/IMAI Integration**
10. 📧 **Email Marketing**
11. 📈 **Advanced Analytics**

---

## 📝 Phase 1: Database & Auth (יום 1-2)

### Step 1.1: Create Users Table
```bash
# Create migration file
supabase migration new create_users_and_permissions
```

```sql
-- supabase/migrations/009_users_and_permissions.sql

-- 1. Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Auth (Supabase Auth or custom)
  auth_user_id UUID UNIQUE, -- Link to auth.users if using Supabase Auth
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  
  -- Role
  role VARCHAR(20) NOT NULL DEFAULT 'follower' 
    CHECK (role IN ('admin', 'agent', 'influencer', 'brand', 'follower')),
  
  -- For agents: which accounts they manage
  managed_account_ids UUID[] DEFAULT ARRAY[]::UUID[],
  
  -- For influencers/brands: their account
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active' 
    CHECK (status IN ('active', 'suspended', 'deleted')),
  
  -- Metadata
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_account_id ON users(account_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_user_id ON users(auth_user_id);

-- Trigger for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
-- Admins can see all users
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.auth_user_id = auth.uid() 
      AND u.role = 'admin'
    )
  );

-- Users can see themselves
CREATE POLICY "Users can view themselves"
  ON users FOR SELECT
  USING (auth_user_id = auth.uid());

-- Agents can see influencers they manage
CREATE POLICY "Agents can view managed influencers"
  ON users FOR SELECT
  USING (
    role IN ('influencer', 'brand')
    AND account_id = ANY(
      SELECT unnest(managed_account_ids)
      FROM users
      WHERE auth_user_id = auth.uid()
      AND role = 'agent'
    )
  );
```

### Step 1.2: Update RLS Policies for Existing Tables

```sql
-- For partnerships table
DROP POLICY IF EXISTS "Users can view their own partnerships" ON partnerships;

-- Admin: see all
CREATE POLICY "Admin can view all partnerships"
  ON partnerships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_user_id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Agent: see managed influencers
CREATE POLICY "Agent can view managed partnerships"
  ON partnerships FOR SELECT
  USING (
    account_id = ANY(
      SELECT unnest(managed_account_ids)
      FROM users
      WHERE auth_user_id = auth.uid()
      AND role = 'agent'
    )
  );

-- Influencer/Brand: see own
CREATE POLICY "Influencer can view own partnerships"
  ON partnerships FOR SELECT
  USING (
    account_id = (
      SELECT account_id 
      FROM users 
      WHERE auth_user_id = auth.uid()
      AND role IN ('influencer', 'brand')
    )
  );

-- Repeat for tasks, contracts, invoices, etc.
```

### Step 1.3: Seed Admin User

```sql
-- Create first admin user
INSERT INTO users (
  email, 
  full_name, 
  role, 
  status
) VALUES (
  'admin@influencerbot.com',
  'System Admin',
  'admin',
  'active'
);
```

---

## 🔧 Phase 2: Backend API (יום 2-3)

### Step 2.1: Auth Helper Functions

```typescript
// src/lib/auth.ts

export type Role = 'admin' | 'agent' | 'influencer' | 'brand' | 'follower';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role: Role;
  account_id?: string;
  managed_account_ids?: string[];
  status: 'active' | 'suspended' | 'deleted';
}

export async function getCurrentUser(): Promise<User | null> {
  // Get from session/cookie
  const supabase = createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  if (!authUser) return null;
  
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .single();
  
  return user;
}

export async function checkPermission(args: {
  user: User;
  resource: string;
  action: 'view' | 'create' | 'update' | 'delete';
  resourceAccountId?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  
  const { user, resource, action, resourceAccountId } = args;
  
  // Admin: always allowed
  if (user.role === 'admin') {
    return { allowed: true };
  }
  
  // VIEW ONLY system - no create/update/delete (except for admins)
  if (action !== 'view') {
    return { 
      allowed: false, 
      reason: 'System is view-only. Only admins can modify data.' 
    };
  }
  
  // Agent: only managed accounts
  if (user.role === 'agent') {
    if (!resourceAccountId) {
      return { allowed: false, reason: 'Account ID required' };
    }
    
    const isManaging = user.managed_account_ids?.includes(resourceAccountId);
    return {
      allowed: isManaging,
      reason: isManaging ? undefined : 'Not managing this account'
    };
  }
  
  // Influencer/Brand: only own account
  if (user.role === 'influencer' || user.role === 'brand') {
    if (!resourceAccountId) {
      return { allowed: false, reason: 'Account ID required' };
    }
    
    const isOwn = user.account_id === resourceAccountId;
    return {
      allowed: isOwn,
      reason: isOwn ? undefined : 'Can only view own data'
    };
  }
  
  // Follower: no access to management
  return { 
    allowed: false, 
    reason: 'No access to management features' 
  };
}

export function getAccessibleAccountIds(user: User): string[] {
  if (user.role === 'admin') {
    return ['*']; // Special marker for "all"
  }
  
  if (user.role === 'agent') {
    return user.managed_account_ids || [];
  }
  
  if (user.role === 'influencer' || user.role === 'brand') {
    return user.account_id ? [user.account_id] : [];
  }
  
  return []; // Follower
}
```

### Step 2.2: Update API Routes

```typescript
// src/app/api/influencer/partnerships/route.ts

export async function GET(request: Request) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const accountIds = getAccessibleAccountIds(user);
  
  if (accountIds.length === 0 && user.role !== 'admin') {
    return NextResponse.json({ error: 'No accessible accounts' }, { status: 403 });
  }
  
  const supabase = createClient();
  let query = supabase.from('partnerships').select('*');
  
  // RLS will handle filtering, but we can optimize:
  if (user.role !== 'admin') {
    query = query.in('account_id', accountIds);
  }
  
  const { data, error } = await query;
  
  // ... rest of the handler
}
```

---

## 🎨 Phase 3: Frontend (יום 3-5)

### Step 3.1: Auth Context

```typescript
// src/contexts/AuthContext.tsx

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkPermission: (resource: string, action: string, accountId?: string) => boolean;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadUser();
  }, []);
  
  const loadUser = async () => {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
    setLoading(false);
  };
  
  const checkPermission = (resource: string, action: string, accountId?: string) => {
    if (!user) return false;
    // Implement permission logic
    return true; // Simplified
  };
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkPermission }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### Step 3.2: Route Guard

```typescript
// src/components/RouteGuard.tsx

export function RouteGuard({ 
  children,
  allowedRoles,
  requireAccountId 
}: { 
  children: React.ReactNode;
  allowedRoles?: Role[];
  requireAccountId?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!user) {
    router.push('/login');
    return null;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <AccessDenied />;
  }
  
  return <>{children}</>;
}
```

### Step 3.3: AccountSelector

```typescript
// src/components/AccountSelector.tsx

export function AccountSelector() {
  const { user } = useAuth();
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  useEffect(() => {
    loadAccounts();
  }, []);
  
  const loadAccounts = async () => {
    if (user?.role === 'admin') {
      // Load all accounts
      const { data } = await fetch('/api/accounts').then(r => r.json());
      setAccounts(data);
    } else if (user?.role === 'agent') {
      // Load managed accounts
      const { data } = await fetch('/api/accounts/managed').then(r => r.json());
      setAccounts(data);
    }
    // Influencer/Brand - no selector needed
  };
  
  // Don't show for influencers (they only have one account)
  if (user?.role === 'influencer' || user?.role === 'brand') {
    return null;
  }
  
  return (
    <select
      value={selectedAccount || ''}
      onChange={(e) => setSelectedAccount(e.target.value)}
      className="..."
    >
      <option value="">כל החשבונות</option>
      {accounts.map(acc => (
        <option key={acc.id} value={acc.id}>
          {acc.name}
        </option>
      ))}
    </select>
  );
}
```

---

## 📊 Phase 4: Dashboard Updates (יום 5-6)

### Step 4.1: Role-Based Navigation

```typescript
// src/components/Sidebar.tsx

const navigationByRole: Record<Role, NavItem[]> = {
  admin: [
    { icon: Home, label: 'סקירה כללית', href: '/admin/dashboard' },
    { icon: Users, label: 'משתמשים', href: '/admin/users' },
    { icon: Briefcase, label: 'כל השת"פים', href: '/admin/partnerships' },
    { icon: CheckSquare, label: 'כל המשימות', href: '/admin/tasks' },
    { icon: FileText, label: 'כל החשבוניות', href: '/admin/invoices' },
    { icon: BarChart3, label: 'אנליטיקס גלובלי', href: '/admin/analytics' },
  ],
  
  agent: [
    { icon: Home, label: 'המשפיענים שלי', href: '/agent/dashboard' },
    { icon: Briefcase, label: 'שת"פים', href: '/agent/partnerships' },
    { icon: CheckSquare, label: 'משימות', href: '/agent/tasks' },
    { icon: BarChart3, label: 'אנליטיקס', href: '/agent/analytics' },
  ],
  
  influencer: [
    { icon: Home, label: 'דשבורד', href: `/influencer/${user.username}/dashboard` },
    { icon: Briefcase, label: 'שת"פים', href: `/influencer/${user.username}/partnerships` },
    { icon: CheckSquare, label: 'משימות', href: `/influencer/${user.username}/tasks` },
    { icon: Calendar, label: 'לוח שנה', href: `/influencer/${user.username}/calendar` },
    { icon: BarChart3, label: 'אנליטיקס', href: `/influencer/${user.username}/analytics` },
  ],
  
  brand: [
    // Similar to influencer
  ],
  
  follower: [
    // No management dashboard
  ],
};
```

---

## ✅ Testing Checklist

### Test Scenarios:

#### Admin Tests:
- [ ] Can view all partnerships across all accounts
- [ ] Can view all tasks across all accounts
- [ ] Can see Users management page
- [ ] Can switch between accounts in selector
- [ ] Can access admin-only routes

#### Agent Tests:
- [ ] Can only see managed influencers
- [ ] Cannot see other agents' influencers
- [ ] AccountSelector shows only managed accounts
- [ ] Cannot access admin routes
- [ ] Switching accounts works correctly

#### Influencer Tests:
- [ ] Can only see own partnerships/tasks
- [ ] Cannot see other influencers' data
- [ ] No AccountSelector shown
- [ ] Cannot access admin/agent routes
- [ ] All analytics show only own data

#### Follower Tests:
- [ ] Can access chatbot
- [ ] Cannot access any dashboard
- [ ] Redirected when trying to access management pages

#### Security Tests:
- [ ] RLS prevents cross-account queries
- [ ] API returns 403 for unauthorized access
- [ ] URL manipulation doesn't bypass permissions
- [ ] Session timeout works correctly

---

## 📅 Timeline

**Week 1:**
- Day 1-2: Database + RLS
- Day 3-4: Backend API + Auth
- Day 5-6: Frontend basics
- Day 7: Testing + fixes

**Week 2:**
- Day 1-2: Details pages
- Day 3-4: AccountSelector + filters
- Day 5-7: Polish + testing

**Week 3:**
- Launch! 🚀

---

## 🎯 Success Criteria

✅ **Completed when:**
1. כל 4 התפקידים עובדים כמתוכנן
2. RLS מונע גישה לא מורשית
3. UI משתנה לפי תפקיד
4. אין דרך לעקוף הרשאות
5. כל הטסטים עוברים
6. תיעוד מלא

**המערכת תהיה ברורה, מאובטחת, ו-VIEW ONLY!** ✨

