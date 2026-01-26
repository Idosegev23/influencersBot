# 🔐 מערכת ההתחברות - תיעוד מלא

## סקירה כללית

המערכת תומכת בשלושה סוגי משתמשים עם זרימות התחברות שונות:

1. **עוקב (Follower)** - גישה ציבורית ללא הזדהות
2. **משפיען (Influencer)** - התחברות מבוססת Cookie
3. **Admin/Agent** - התחברות מבוססת Supabase Auth

---

## 🎯 זרימות כניסה למערכת

### 1️⃣ עוקב (Follower) - צד הצ'אט

**דרך כניסה:** ציבורי, ללא הזדהות

```
URL: /chat/[username]
דוגמה: /chat/yael
```

**מה קורה:**
- העוקב פותח את הלינק
- המערכת טוענת את פרופיל המשפיען + ערכת נושא
- הצ'אטבוט פועל מיד - אין צורך בהתחברות
- העוקב יכול לשוחח, לקבל קופונים, לפתוח תמיכה

**טריק נסתר:**
- 3 לחיצות מהירות על אווטאר המשפיען = מעבר לדף Login! 🎯
- זה מאפשר למשפיען להיכנס לדשבורד במהירות

---

### 2️⃣ משפיען (Influencer) - צד הניהול

**דרכי כניסה:**

#### אופציה 1: דף Login ייעודי למשפיען
```
URL: /influencer/[username]/login
דוגמה: /influencer/yael/login
```

**תכונות:**
- עיצוב מותאם אישית לפי ערכת הנושא של המשפיען
- אווטאר ושם המשפיען
- שדה סיסמה בלבד (username כבר ידוע מה-URL)
- כפתור "חזרה לצ'אט"

#### אופציה 2: דף Login כללי
```
URL: /login
Query param: ?redirect=/influencer/yael
```

**תכונות:**
- עיצוב כללי של המערכת
- שדות username + password
- תמיכה ב-redirect אחרי התחברות

#### אופציה 3: גישה ישירה לדשבורד
```
URL: /influencer/[username]
```

**מה קורה:**
1. המערכת בודקת אם המשפיען מחובר (Cookie)
2. אם מחובר → מפנה ל-`/influencer/[username]/dashboard`
3. אם לא מחובר → מפנה ל-`/influencer/[username]/login`

---

## 🔒 איך ההתחברות עובדת - Influencer Auth

### מבנה הAPI

**Endpoint:** `/api/influencer/auth`

#### POST - התחברות
```typescript
Request:
{
  username: string;  // או subdomain
  password: string;
}

Response (Success):
{
  success: true;
  influencer: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string;
  }
}

Response (Error):
- 404: Influencer not found
- 401: Invalid password
- 400: Missing credentials
```

**מה קורה מאחורי הקלעים:**
1. המערכת מחפשת את המשפיען לפי username (או subdomain)
2. מאמתת את הסיסמה מול `admin_password_hash`
3. יוצרת Cookie: `influencer_session_[username]` = `'authenticated'`
4. ה-Cookie תקף ל-7 ימים

#### GET - בדיקת סטטוס
```typescript
Request:
?username=[username]

Response:
{
  authenticated: boolean;
  influencer?: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string;
  }
}
```

#### POST - התנתקות
```typescript
Request:
{
  username: string;
  action: 'logout';
}

Response:
{
  success: true
}
```

**מה קורה:**
- מוחק את ה-Cookie
- משפיען מופנה בחזרה לדף Login

---

## 🛡️ RouteGuard - הגנה על נתיבים

**קובץ:** `src/components/auth/RouteGuard.tsx`

### שימוש

```tsx
<RouteGuard requiredRole="influencer" fallbackUrl="/login">
  <ProtectedContent />
</RouteGuard>
```

### איך זה עובד

#### למשפיענים (role: "influencer"):
1. מזהה את ה-username מה-URL
2. שולח בקשה ל-`/api/influencer/auth?username=...`
3. אם מאומת → מציג תוכן
4. אם לא → מפנה ל-`/influencer/[username]/login`

#### למשתמשים אחרים (admin/agent):
1. בודק Supabase Auth
2. שולף role מטבלת `users`
3. בודק היררכיה: `admin > agent > influencer > follower`
4. אם מורשה → מציג תוכן
5. אם לא → מפנה ל-`fallbackUrl`

---

## 📱 דשבורד המשפיען

**URL:** `/influencer/[username]/dashboard`

**תכונות:**
- סקירת KPIs: שיחות, קופונים, שת"פים, משימות
- שת"פים פעילים
- משימות קרובות
- שיחות אחרונות
- ניווט לכל החלקים במערכת
- **כפתור יציאה** בפינה השמאלית העליונה

**הגנה:**
- מוגן על ידי RouteGuard
- בודק authentication בתחילת טעינת הדף
- אם לא מחובר → מפנה לLogin

---

## 🎨 דפי Login - עיצוב וחוויה

### דף Login למשפיען (`/influencer/[username]/login`)

**אלמנטים:**
- ✅ אווטאר המשפיען
- ✅ שם + username
- ✅ שדה סיסמה עם הצגה/הסתרה
- ✅ הודעות שגיאה אנימציה
- ✅ כפתור "חזרה לצ'אט"
- ✅ עיצוב מותאם לערכת הנושא של המשפיען
- ✅ טעינה אוטומטית אם כבר מחובר

**ניהול טעויות:**
- סיסמה שגויה → הודעה ברורה
- משפיען לא נמצא → 404 עם כפתור חזרה
- שגיאת רשת → הודעת שגיאה כללית

### דף Login כללי (`/login`)

**אלמנטים:**
- ✅ שדה username
- ✅ שדה סיסמה עם הצגה/הסתרה
- ✅ הודעות שגיאה אנימציה
- ✅ עיצוב כללי של המערכת
- ✅ תמיכה ב-redirect query param
- ✅ טיפ: איך להשתמש בדף הייעודי

---

## 🔄 זרימת התחברות מלאה

### תרשים זרימה - משפיען

```
1. משפיען מקבל לינק → /influencer/yael

2. בודק authentication:
   ├─ מחובר? → /influencer/yael/dashboard
   └─ לא? → /influencer/yael/login

3. בדף Login:
   ├─ מזין סיסמה
   ├─ POST /api/influencer/auth
   ├─ Cookie נוצר
   └─ redirect → /dashboard

4. בדשבורד:
   ├─ RouteGuard בודק Cookie
   ├─ אם תקף → מציג תוכן
   └─ אם לא → חזרה ל-Login

5. יציאה:
   ├─ לחיצה על "יציאה"
   ├─ POST /api/influencer/auth (action: logout)
   ├─ Cookie נמחק
   └─ חזרה ל-Login
```

---

## 🧪 בדיקות

### תרחישים לבדיקה:

#### ✅ התחברות מוצלחת
1. פתח `/influencer/yael/login`
2. הזן סיסמה נכונה
3. וודא הפניה ל-dashboard
4. וודא שכל הדפים נגישים
5. רענן דף - וודא שנשאר מחובר

#### ✅ התחברות נכשלת
1. הזן סיסמה שגויה
2. וודא הודעת שגיאה
3. הזן username לא קיים
4. וודא הודעת 404

#### ✅ הגנת נתיבים
1. נסה לגשת ל-`/influencer/yael/dashboard` ללא התחברות
2. וודא הפניה אוטומטית ל-Login

#### ✅ התנתקות
1. התחבר למערכת
2. לחץ "יציאה"
3. וודא הפניה ל-Login
4. נסה לחזור ל-dashboard - וודא שלא נגיש

#### ✅ Triple-tap מהצ'אט
1. פתח `/chat/yael`
2. לחץ 3 פעמים מהר על האווטאר
3. וודא מעבר ל-`/influencer/yael`
4. וודא הפניה לLogin או Dashboard לפי סטטוס

---

## 🔧 קבצים שנוצרו/עודכנו

### קבצים חדשים:
1. ✅ `/src/app/influencer/[username]/login/page.tsx` - דף Login למשפיען
2. ✅ `/src/app/login/page.tsx` - דף Login כללי
3. ✅ `AUTH_FLOW_DOCUMENTATION.md` - תיעוד זה

### קבצים שעודכנו:
1. ✅ `/src/components/auth/RouteGuard.tsx` - תמיכה ב-Cookie auth למשפיענים
2. ✅ `/src/app/influencer/[username]/page.tsx` - מפנה אוטומטית לדשבורד או Login

### קבצים קיימים (לא שונו):
- ✅ `/src/app/api/influencer/auth/route.ts` - API endpoint
- ✅ `/src/app/influencer/[username]/dashboard/page.tsx` - דשבורד עם כפתור יציאה
- ✅ `/src/app/chat/[username]/page.tsx` - צ'אט עם triple-tap

---

## 🚀 איך להתחיל

### למשפיען חדש:

1. **הירשם במערכת** (Admin יוצר חשבון)
2. **קבל username + password**
3. **היכנס:**
   - גש ל-`/influencer/[username]/login`
   - או `/ login` עם username
   - או 3 לחיצות על אווטאר מהצ'אט
4. **נהל את המערכת שלך!**

### לעוקב:

1. **קבל לינק** מהמשפיען: `/chat/[username]`
2. **התחל לשוחח** - זה הכל! אין התחברות.

---

## 💡 טיפים למפתחים

### הוספת משפיען חדש

```typescript
// דרך ממשק Admin (מומלץ)
// או ישירות ב-Supabase:

INSERT INTO influencers (
  username,
  display_name,
  admin_password_hash,  -- hash של הסיסמה
  is_active,
  theme
) VALUES (
  'yael',
  'יעל כהן',
  '$2a$10$...',  -- bcrypt hash
  true,
  '{"primaryColor": "#8b5cf6", ...}'
);
```

### שינוי סיסמה

```typescript
import bcrypt from 'bcryptjs';

const newPassword = 'new_secure_password';
const hash = await bcrypt.hash(newPassword, 10);

// עדכן ב-Supabase:
UPDATE influencers
SET admin_password_hash = 'new_hash'
WHERE username = 'yael';
```

### בדיקת Cookie ב-DevTools

```javascript
// בקונסול:
document.cookie
  .split(';')
  .find(c => c.includes('influencer_session'));
```

---

## ⚠️ אבטחה

### הגנות קיימות:
- ✅ הצפנת סיסמאות עם bcrypt
- ✅ HttpOnly cookies (לא נגיש ל-JavaScript)
- ✅ Secure cookies ב-production
- ✅ SameSite: lax
- ✅ תוקף מוגבל (7 ימים)
- ✅ Rate limiting על API routes

### המלצות:
- 🔒 השתמש ב-HTTPS בייצור
- 🔒 החזק סיסמאות חזקות
- 🔒 הוסף 2FA בעתיד
- 🔒 לוג מעקב לניסיונות התחברות כושלים
- 🔒 שקול הוספת CAPTCHA לאחר 3 נסיונות

---

## 📞 תמיכה ובאגים

יש בעיה? תפתח issue או צור קשר עם התמיכה.

**שאלות נפוצות:**

**ש: "שכחתי סיסמה"**
ת: צור קשר עם Admin למערכת, הוא יכול לאפס.

**ש: "Cookie לא נשמר"**
ת: בדוק שאתה לא ב-Incognito ושהדפדפן מאפשר cookies.

**ש: "מופנה ל-Login כל הזמן"**
ת: Cookie אולי פג תוקפו או נמחק. התחבר מחדש.

---

## ✨ סיכום

המערכת כוללת:
- ✅ 2 דפי Login (ייעודי + כללי)
- ✅ RouteGuard מתקדם
- ✅ Cookie-based auth למשפיענים
- ✅ Supabase auth למנהלים
- ✅ Triple-tap shortcut
- ✅ דשבורד מלא עם יציאה
- ✅ חוויית משתמש מלוטשת

**הכל מוכן ועובד!** 🎉
