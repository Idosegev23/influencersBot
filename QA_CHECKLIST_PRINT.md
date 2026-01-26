# ✅ QA Checklist - הדפס וסמן

**Tester:** לירן  
**Date:** 26/01/26  
**Version:** v2.0

---

## 🔐 1. Authentication & Permissions (15 min)

### Admin Access
- [ ] Login כ-Admin עובד
- [ ] גישה ל-`/admin/add`
- [ ] גישה ל-כל הדשבורדים
- [ ] יכול לערוך כל דבר

### Agent Access
- [ ] Login כ-Agent עובד
- [ ] רואה רק משפיענים שלו
- [ ] **לא** רואה משפיענים אחרים (403)
- [ ] **לא** יכול לגשת ל-`/admin`

### Influencer Access
- [ ] Login ב-`/influencer/[user]/login`
- [ ] רואה רק את הדאטה שלו
- [ ] **לא** יכול לגשת למשפיענים אחרים (403)
- [ ] **לא** יכול לגשת ל-`/admin` (403)

### Follower Access
- [ ] יכול לפתוח chatbot (ללא login)
- [ ] יכול לשלוח הודעות
- [ ] **לא** יכול לגשת לdashboard

**Notes:**
```




```

---

## 📸 2. Instagram Scraping (20 min)

### הוספת משפיען חדש
- [ ] `/admin/add` טוען
- [ ] הזנת Instagram URL
- [ ] Scraping מתחיל (loading)
- [ ] **אחרי 1-2 דקות:**
  - [ ] 50 posts נסרקו
  - [ ] 30 reels נסרקו (או warning אם failed)
  - [ ] Gemini analysis הצליח
  - [ ] נוצרו: partnerships, coupons, persona

### סריקה מחדש (Rescan)
- [ ] כפתור "🔄 סרוק מחדש" בdashboard
- [ ] Loading indicator
- [ ] אחרי 1-2 דקות דאטה מתעדכן
- [ ] `last_synced_at` מתעדכן

### Logs Verification
- [ ] בVercel Logs:
  - [ ] `📸 Scraping Instagram...`
  - [ ] `✅ Gemini analysis successful`
  - [ ] `💾 Saving X partnerships...`
- [ ] אין שגיאות: `❌ Failed`

**Notes:**
```




```

---

## 📄 3. Document Intelligence (25 min)

### Upload Flow
- [ ] `/influencer/[user]/partnerships` טוען
- [ ] כפתור "➕ שת\"פ חדש" → "📄 העלה מסמך"
- [ ] Drag & Drop עובד
- [ ] File picker עובד
- [ ] תומך: PDF, DOCX, JPG, PNG
- [ ] **לא** מאפשר >10MB

### AI Parsing
- [ ] אחרי upload → "🤖 מנתח..."
- [ ] אחרי 10-15 שניות:
  - [ ] מוצג preview של הדאטה
  - [ ] Confidence score (0-100%)
  - [ ] כל השדות מולאו

### Review & Confirm
- [ ] יכול לערוך כל שדה
- [ ] שינויים נשמרים
- [ ] כפתור "✅ אשר" פועל
- [ ] Redirect ל-partnership page

### Auto-Generation
- [ ] Partnership נוצר
- [ ] Tasks נוצרו (1 per deliverable)
- [ ] Invoices נוצרו (אם יש milestones)
- [ ] Calendar events נוצרו
- [ ] Notification נוצרה

**Notes:**
```




```

---

## 🎫 4. Coupons & ROI (20 min)

### Copy Tracking
- [ ] `/influencer/[user]/coupons` טוען
- [ ] טבלה עם כל הקופונים
- [ ] כפתור "📋 Copy" ליד כל קוד
- [ ] לחיצה → קוד מועתק ל-clipboard
- [ ] Toast: "קוד הועתק! ✅"
- [ ] המונה עולה: "העתק (1)" → "העתק (2)"

### Usage Tracking
- [ ] הוסף usage ידנית (SQL):
  ```sql
  INSERT INTO coupon_usages (...)
  ```
- [ ] רענן dashboard
- [ ] `usage_count` עלה
- [ ] `conversion_rate` מחושב נכון

### Top Products
- [ ] רשימת "המוצרים הנמכרים ביותר"
- [ ] Quantity + Revenue נכונים
- [ ] אחוזים מסתכמים ל-100%

### ROI Calculator
- [ ] Investment + Revenue שדות
- [ ] ROI % מחושב נכון:  
  `((Revenue - Investment) / Investment) * 100`
- [ ] מוצג בצבעים (ירוק=טוב, אדום=לא טוב)

**Expected Numbers:**
```
Copy: 50
Usage: 15
Conversion: 30%
Revenue: ₪3,750
Avg Basket: ₪250
```

**Notes:**
```




```

---

## 💬 5. Chatbot & Persona (15 min)

### Chatbot (צד עוקב)
- [ ] `/influencer/[user]` טוען (public)
- [ ] איקון צ'אט 💬 בפינה
- [ ] Click → chat window נפתח
- [ ] שלח הודעה: "היי!"
- [ ] בוט עונה תוך 2-3 שניות
- [ ] תשובה מותאמת (tone, emoji, style)
- [ ] מציע קופונים אם רלוונטי

### Persona Auto-Generation
- [ ] בDB: `chatbot_persona` קיים
- [ ] שדות: `name`, `tone`, `bio`, `directives`
- [ ] Bio מאינסטגרם
- [ ] Directives רלוונטיים

### Persona Editor (Admin)
- [ ] `/admin/chatbot-persona/[accountId]` טוען
- [ ] כל השדות ניתנים לעריכה
- [ ] Dropdown: tone, emoji_usage
- [ ] Textarea: directives, greeting
- [ ] שמירה עובדת
- [ ] שינויים משפיעים על הבוט

**Notes:**
```




```

---

## 📋 6. Tasks & Projects (15 min)

### Tasks List
- [ ] `/influencer/[user]/tasks` טוען
- [ ] רשימת כל המשימות
- [ ] Filter by status: pending/in_progress/completed
- [ ] Filter by partnership

### Task Detail
- [ ] Click על task → פרטים
- [ ] יכול לעדכן status
- [ ] יכול להוסיף הערה
- [ ] יכול ליצור subtask
- [ ] שינויים נשמרים מיד

### Task Creation
- [ ] "➕ משימה חדשה" עובד
- [ ] מלא: title, description, deadline, partnership
- [ ] שמור
- [ ] Task מופיע ברשימה

**Notes:**
```




```

---

## 💼 7. Partnerships (15 min)

### List View
- [ ] `/influencer/[user]/partnerships` טוען
- [ ] רשימה עם כל השת\"פים
- [ ] כל כרטיס מציג: brand, campaign, status, amount
- [ ] Filter: by status, by date
- [ ] Search: by brand name

### CRUD Operations
- [ ] **Create:** "➕ שת\"פ חדש" → מילוי ידני
- [ ] **Read:** click על שת\"פ → פרטים מלאים
- [ ] **Update:** "✏️ ערוך" → שינוי status/amount
- [ ] **Delete:** "🗑️ מחק" → soft delete (deleted_at)

### Partnership Detail
- [ ] Overview section טוען
- [ ] ROI calculator מוצג
- [ ] Coupons table מוצגת
- [ ] Documents list מוצגת
- [ ] Timeline מוצג

**Notes:**
```




```

---

## 🔔 8. Notifications (10 min)

### In-App
- [ ] פעמון 🔔 בheader
- [ ] Badge עם מספר (אם יש unread)
- [ ] Click → dropdown עם התראות
- [ ] Click על התראה → redirect לדף
- [ ] התראה מסומנת כ-"נקראה"

### Email (אם מוגדר)
- [ ] Notification נשלחת למייל
- [ ] נושא: נכון
- [ ] תוכן: רלוונטי + קישור
- [ ] Sender: `noreply@...`

### WhatsApp (אם מוגדר)
- [ ] הודעה מגיעה ל-WhatsApp
- [ ] תוכן: קצר וברור
- [ ] קישור עובד

**Notes:**
```




```

---

## 💬 9. Communications Hub (10 min)

### List View
- [ ] `/influencer/[user]/communications` טוען
- [ ] רשימת שיחות
- [ ] Filter: category (financial/legal/technical)
- [ ] Filter: status (open/resolved/closed)
- [ ] Filter: priority (high/medium/low)

### Create Communication
- [ ] "➕ שיחה חדשה" עובד
- [ ] בחירת partnership
- [ ] מילוי: subject, category, priority, message
- [ ] שמירה
- [ ] מופיע ברשימה

### Thread View
- [ ] Click על שיחה → thread מלא
- [ ] כל ההודעות מוצגות
- [ ] יכול להוסיף הודעה חדשה
- [ ] יכול לצרף קבצים
- [ ] יכול לשנות status

**Notes:**
```




```

---

## 📅 10. Calendar Integration (10 min)

### Connect
- [ ] `/influencer/[user]/settings` → Calendar
- [ ] כפתור "🔗 Connect Google Calendar"
- [ ] OAuth popup
- [ ] אחרי approval: status "✅ Connected"

### Sync
- [ ] צור task עם deadline
- [ ] בדוק Google Calendar → event נוצר
- [ ] Event details נכונים
- [ ] קישור למשימה עובד

### Disconnect
- [ ] כפתור "Disconnect"
- [ ] Status: "Not connected"
- [ ] Tasks חדשים לא נוצרים ב-Calendar

**Notes:**
```




```

---

## 📊 11. Analytics Dashboards (15 min)

### Main Dashboard
- [ ] `/influencer/[user]/dashboard` טוען
- [ ] Stats cards: partnerships, tasks, revenue
- [ ] Charts טוענים (לא "No data")
- [ ] Recent activity feed
- [ ] Upcoming deadlines

### Audience Dashboard
- [ ] `/influencer/[user]/audience` טוען
- [ ] Conversations stats
- [ ] Coupons analytics
- [ ] Top products
- [ ] Timeline chart

### Partnership Analytics
- [ ] `/influencer/[user]/partnerships/[id]` טוען
- [ ] Overview
- [ ] ROI calculator (מספרים נכונים!)
- [ ] Coupons performance table
- [ ] Documents list
- [ ] Timeline

**Validation:**
```
✅ מספרים תואמים ל-DB
✅ אין NaN או undefined
✅ charts מוצגים
```

**Notes:**
```




```

---

## 🚀 12. Performance & Errors (10 min)

### Page Load Time
- [ ] First load: <3 seconds
- [ ] Subsequent: <1 second
- [ ] No console errors (אדומים)

### API Response Time
- [ ] Simple queries: <200ms
- [ ] Complex analytics: <1000ms
- [ ] AI parsing: <15 seconds

### Error Handling
- [ ] Network error → הודעה ברורה
- [ ] API error → הודעה ברורה
- [ ] Timeout → retry option

### Security
- [ ] SQL injection → לא עובד ✅
- [ ] XSS → לא עובד ✅
- [ ] CSRF → 401 Unauthorized ✅
- [ ] Data leakage → 403 Forbidden ✅

**Notes:**
```




```

---

## 🐛 Bugs Found

### Critical (🔴 חייבים לתקן לפני launch)
```
1. _______________________________________
   Impact: ____________________________
   
2. _______________________________________
   Impact: ____________________________
```

### High (🟠 לתקן מהר)
```
1. _______________________________________
2. _______________________________________
3. _______________________________________
```

### Medium (🟡 לתקן בשבוע הבא)
```
1. _______________________________________
2. _______________________________________
```

### Low (🟢 לא דחוף)
```
1. _______________________________________
```

---

## ✅ Summary

**Total Tests:** _____ / 80  
**Pass Rate:** _____%  
**Critical Bugs:** _____  
**Ready for Production?** ☐ Yes  ☐ No  ☐ After fixes

**Tester Signature:** __________________  
**Date Completed:** __________________

---

## 📝 General Notes

```
[כתוב כאן הערות כלליות, impressions, suggestions]









```

---

**הדפס דף זה ותסמן תוך כדי הבדיקות! ✅**
