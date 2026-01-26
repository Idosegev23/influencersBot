# 📸 מדריך צילום Screenshots למערכת

## 🎯 איזה תמונות צריך

### 1. Dashboard ראשי
**File:** `dashboard-main.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/dashboard`
**מה לצלם:**
- כל המסך (full page)
- עם ה-KPIs למעלה
- עם המשימות הקרובות
- עם השת"פים האחרונים

**Resolution:** 1920x1080 (או יותר)

---

### 2. Partnerships - Overview
**File:** `partnerships-overview.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/partnerships`
**מה לצלם:**
- Tab "סקירה כללית"
- Pipeline chart
- Revenue chart

---

### 3. Partnerships - Library
**File:** `partnerships-library.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/partnerships` (tab Library)
**מה לצלם:**
- טבלה מלאה עם 5-10 שת"פים
- עם הסינונים למעלה

---

### 4. Partnership Single - Details Tab
**File:** `partnership-detail.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/partnerships/[id]`
**מה לצלם:**
- פרטי השת"פ
- כפתורי Edit/Delete
- כל הפרטים מלאים

---

### 5. Partnership Single - Documents Tab
**File:** `partnership-documents.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/partnerships/[id]` (tab Documents)
**מה לצלם:**
- רשימת מסמכים
- כפתור העלאה
- אם יש מסמך parsed - confidence score

---

### 6. Document Upload
**File:** `document-upload.png`
**מה לצלם:**
- מסך drag & drop
- Progress bar (אם אפשר לתפוס)

---

### 7. Document Review - AI Parsed
**File:** `document-review.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/documents/[id]/review`
**מה לצלם:**
- כל הנתונים שה-AI חילץ
- Confidence score למעלה
- כפתור "צור שת"פ"

---

### 8. Tasks Dashboard
**File:** `tasks-dashboard.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/tasks`
**מה לצלם:**
- רשימת משימות
- סינונים
- Timeline (אם יש)

---

### 9. Task Detail
**File:** `task-detail.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/tasks/[id]`
**מה לצלם:**
- פרטי המשימה
- Status badges
- כפתורי Quick Actions

---

### 10. Audience Analytics
**File:** `analytics-audience.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/audience`
**מה לצלם:**
- KPI cards למעלה
- Growth chart
- Engagement metrics

---

### 11. Coupons Analytics
**File:** `analytics-coupons.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/coupons`
**מה לצלם:**
- Coupon performance table
- Stats cards
- Top products (אם יש data)

---

### 12. Communications
**File:** `communications.png`
**URL:** `http://localhost:3001/influencer/danitgreenberg/communications`
**מה לצלם:**
- רשימת תקשורות
- קטגוריות (פיננסי, משפטי, בעיות)
- Stats cards

---

### 13. Notifications Bell
**File:** `notifications.png`
**מה לצלם:**
- לחץ על הפעמון
- Dropdown עם התראות
- צלם את ה-dropdown פתוח

---

### 14. Chatbot UI
**File:** `chatbot.png`
**URL:** `http://localhost:3001/chat/danitgreenberg`
**מה לצלם:**
- ממשק הצ'אט
- כמה הודעות
- כפתור Copy Coupon (אם יש)

---

### 15. Navigation Menu
**File:** `navigation.png`
**מה לצלם:**
- התפריט העליון
- כל הכפתורים
- Active state על אחד מהם

---

## 📐 הגדרות צילום

### Resolution:
- **1920x1080** (Full HD) - minimum
- **2560x1440** (2K) - recommended
- **3840x2160** (4K) - best

### Browser:
- Chrome (incognito mode)
- Zoom: 100%
- Full screen (F11)
- Hide bookmarks bar

### Tools:
- **Mac:** Cmd+Shift+4 (screenshot)
- **Windows:** Windows+Shift+S
- **Tool:** CleanShot X / Shottr (recommended)

---

## 📁 איפה לשמור

שמור את כל התמונות ב:
```
promo-video/public/screens/
├─ dashboard-main.png
├─ partnerships-overview.png
├─ partnerships-library.png
├─ partnership-detail.png
├─ partnership-documents.png
├─ document-upload.png
├─ document-review.png
├─ tasks-dashboard.png
├─ task-detail.png
├─ analytics-audience.png
├─ analytics-coupons.png
├─ communications.png
├─ notifications.png
├─ chatbot.png
└─ navigation.png
```

---

## 🎨 Tips לצילום טוב

1. **נקה את המסך** - סגור tabs מיותרים
2. **Data איכותי** - צור 5-10 שת"פים לדוגמה עם שמות מותגים אמיתיים
3. **תאריכים הגיוניים** - לא 01/01/2020, תאריכים נוכחיים
4. **מספרים ריאליסטיים** - לא 999999, מספרים אמיתיים
5. **בעברית נכון** - בדוק שאין typos

---

## ✅ Checklist

לפני שמתחיל לצלם:
- [ ] השרת רץ (`npm run dev` בפרויקט הראשי)
- [ ] יש data טוב במערכת (5+ partnerships)
- [ ] המערכת עובדת (אין 401/500 errors)
- [ ] Browser נקי (incognito)
- [ ] Zoom 100%
- [ ] תיקיית `promo-video/public/screens/` קיימת

---

**אחרי שיש לך את התמונות - תגיד לי ואני אשלב אותן בסרטון!**
