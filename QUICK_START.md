# ✅ Quick Start Checklist

## 🚀 מה לבדוק עכשיו

### 1. Login & Navigation
```bash
# 1. הפעל את השרת
npm run dev

# 2. התחבר
open http://localhost:3001/influencer/danitgreenberg/login
# Password: test123

# 3. בדוק את התפריט העליון
# צריך לראות: 🏠 דשבורד | 🤝 שת"פים | ✅ משימות | 🎫 קופונים | 💬 תקשורת | 👥 קהל | 📄 מסמכים
```

### 2. Partnerships Flow
```
✅ לחץ על "שת"פים"
✅ לחץ "+ הוסף שת"פ חדש"
✅ מלא טופס → שמור
✅ היכנס לשת"פ שנוצר
✅ לחץ "ערוך" → שנה משהו → שמור
✅ לחץ טאב "מסמכים"
```

### 3. Documents + AI Parsing
```
✅ העלה מסמך (PDF/Word)
✅ חכה 10-30 שניות
✅ לחץ "סקור נתונים" (אם parsing הצליח)
✅ ערוך פרטים
✅ לחץ "צור שת"פ מהמסמך"
```

### 4. Dashboards
```
✅ קהל - רא נתוני פעילות
✅ קופונים - ראה ביצועים
✅ תקשורת - ראה תקשורת מותגים
✅ מסמכים - כל המסמכים במקום אחד
```

---

## 🔍 איך לבדוק ש-AI עובד

### צריך מפתח API:
```bash
# בדוק אם יש
grep GEMINI_API_KEY .env

# אם אין, הוסף:
echo "GEMINI_API_KEY=your-key-here" >> .env
```

### העלה מסמך test:
1. מצא PDF עם הצעת מחיר
2. העלה דרך שת"פ
3. צפה ב-console:
   ```
   [Parse API] Processing document: filename.pdf
   [Parse API] Parsing completed with confidence: 0.85
   ```

---

## ⚠️ בעיות אפשריות

### "401 Unauthorized"
```bash
# פתרון:
1. התנתק והתחבר מחדש
2. נקה cookies
3. Restart שרת (Ctrl+C → npm run dev)
```

### "500 Internal Server Error - RLS Loop"
```bash
# אם רואה בconsole:
# "infinite recursion detected in policy for relation 'users'"

# פתרון זמני: הAPI שמשתמש בcookie auth עובד
# פתרון קבוע: צריך לתקן RLS policy
```

### "AI Parsing נכשל"
```bash
# בדוק:
1. האם GEMINI_API_KEY מוגדר?
2. האם הקובץ תקין (לא פגום)?
3. האם הקובץ בעברית/אנגלית?

# לוג יהיה ב-console
```

---

## 📁 קבצים חשובים

### Documentation:
- `WHAT_WE_BUILT.md` - רשימה מלאה של מה בנינו
- `STATUS_FINAL.md` - אחוז השלמה לפי קטגוריות
- `TODAY_SUMMARY.md` - סיכום העבודה היום
- `HOW_TO_USE.md` - מדריך שימוש מלא
- `API_AUTH_STATUS.md` - סטטוס auth לפי endpoint

### Setup:
- `RUN_MIGRATION_019.md` - איך להריץ את המיגרציה החדשה

### Scripts:
- `scripts/fix-api-auth.ts` - תיקון אוטומטי של auth (לעתיד)

---

## 🎯 הצעד הבא שלך

1. **בדוק Login** ✅
2. **גלוש בכל הדפים** ✅
3. **העלה מסמך test** 🤖
4. **בדוק שכל הlinks עובדים** ✅
5. **דווח על בעיות** 🐛

---

**🎊 המערכת מוכנה! תתחיל להשתמש! 🎊**

**יש שאלות? ראה את `HOW_TO_USE.md`**
