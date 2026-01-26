# 📚 Memory Bank - בנק הזיכרון של הפרויקט

**עודכן:** 2026-01-11

---

## מה זה Memory Bank?

**Memory Bank** הוא מערכת התיעוד המרכזית של הפרויקט. כל הקבצים כאן מכילים את הידע הקריטי על המערכת, ההחלטות שהתקבלו, והסטטוס הנוכחי.

**🎯 מטרה**: לאפשר המשכיות בין sessions - אחרי reset, כל המידע כאן מאפשר לנו להמשיך בדיוק מאיפה שעצרנו.

---

## 📁 הקבצים

### קבצים מרכזיים (חובה לקרוא!)

#### 1. `projectbrief.md` ⭐
**מה זה?** תעודת הלידה של הפרויקט
- מטרת הפרויקט
- בעיה עסקית
- הפתרון
- משתמשי קצה
- מדדי הצלחה
- תקציב

**מתי לקרוא?** כשאתה רוצה להבין **למה** המערכת הזו קיימת.

---

#### 2. `activeContext.md` 🔥
**מה זה?** הקונטקסט הנוכחי - איפה אנחנו עכשיו
- מה בוצע עד כה
- מה חסר
- השלב הבא
- סטטוס כללי
- blockers

**מתי לקרוא?** **בכל התחלת session!** זה המקום הראשון לקרוא.

---

#### 3. `progress.md` ✅
**מה זה?** מה עובד ומה לא
- מה בוצע בפועל
- מה עוד לא עובד
- מדדי התקדמות
- Milestones
- Recent activity

**מתי לקרוא?** כשאתה רוצה לדעת בדיוק **מה הסטטוס**.

---

### קבצים משלימים

#### 4. `productContext.md` 💡
**מה זה?** למה המוצר הזה קיים
- Pain points
- הפתרון
- User journeys
- Value proposition
- Success metrics

**מתי לקרוא?** כשאתה רוצה להבין את חווית המשתמש.

---

#### 5. `systemPatterns.md` 🏗️
**מה זה?** הארכיטקטורה וההחלטות הטכניות
- Architecture overview
- Security patterns
- AI Parser architecture
- Data flows
- Database patterns
- Error handling

**מתי לקרוא?** כשאתה כותב קוד או מתכנן feature.

---

#### 6. `techContext.md` 🛠️
**מה זה?** הטכנולוגיות והsetup
- Tech stack
- Dependencies
- Database schema
- Environment variables
- Development workflow
- Debugging

**מתי לקרוא?** כשאתה צריך setup או troubleshooting.

---

## 🔄 תהליך שימוש

### התחלת Session חדש

```
1. קרא activeContext.md → מה הסטטוס הנוכחי?
2. קרא progress.md → מה בוצע?
3. הבט ב-PROJECT_PLAN.md → מה המשימה הבאה?
4. התחל לעבוד!
```

### סיום משימה

```
1. עדכן progress.md → סמן משימה כהושלמה
2. עדכן activeContext.md → מה השלב הבא?
3. Commit ו-Push
```

### החלטה טכנית חשובה

```
1. תעד ב-systemPatterns.md
2. הסבר למה בחרת בגישה הזו
3. הוסף דוגמה
```

---

## 📋 תזכורות חשובות

### ⚠️ עקרונות

1. **אין "הושלם" ללא בדיקות!**
   - כל משימה צריכה Unit + Integration + QA
   - רק אחרי כל הבדיקות → "הושלם"

2. **PROJECT_PLAN.md הוא המדריך**
   - כל עבודה לפי התוכנית
   - 10 Phases, ~150 משימות
   - תמיד עובדים לפי הסדר

3. **אבטחה מעל הכל**
   - Multi-tenancy מוחלט
   - RLS על כל טבלה
   - אפס דליפות בין חשבונות

4. **תיעוד מתמיד**
   - כל החלטה מתועדת
   - כל feature מתועד
   - תמיד עדכני

---

## 🎯 Quick Reference

| אני רוצה... | קרא את... |
|-------------|-----------|
| להבין מה המערכת | `projectbrief.md` |
| לדעת איפה אנחנו | `activeContext.md` |
| לראות מה בוצע | `progress.md` |
| להבין את המשתמשים | `productContext.md` |
| לכתוב קוד | `systemPatterns.md` |
| לעשות setup | `techContext.md` |
| לראות את התוכנית | `../PROJECT_PLAN.md` |

---

## 📊 מבנה הקבצים

```
memory-bank/
├── README.md                 ← אתה כאן
├── projectbrief.md          ← הבסיס
├── activeContext.md         ← מה עכשיו
├── progress.md              ← מה בוצע
├── productContext.md        ← למה
├── systemPatterns.md        ← איך
└── techContext.md           ← עם מה
```

---

## 🔄 תדירות עדכון

| קובץ | תדירות עדכון |
|------|--------------|
| `projectbrief.md` | רק בשינויים משמעותיים בסקופ |
| `activeContext.md` | אחרי כל משימה גדולה |
| `progress.md` | אחרי כל משימה שמושלמת |
| `productContext.md` | כשיש insights חדשים על משתמשים |
| `systemPatterns.md` | כשיש החלטה ארכיטקטורית |
| `techContext.md` | כשמוסיפים טכנולוגיה חדשה |

---

## ✅ Checklist - אחרי Session

- [ ] עדכנתי `progress.md` עם מה שבוצע
- [ ] עדכנתי `activeContext.md` עם השלב הבא
- [ ] אם היו החלטות טכניות → עדכנתי `systemPatterns.md`
- [ ] אם הוספתי טכנולוגיה → עדכנתי `techContext.md`
- [ ] Commit + Push

---

**Memory Bank הוא הזיכרון המוסדי של הפרויקט. שמור אותו עדכני!** 🧠

