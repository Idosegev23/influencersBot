# מדריך שימוש ב-Instaloader

## 📋 תוכן עניינים
1. [סקירה כללית](#סקירה-כללית)
2. [התקנה](#התקנה)
3. [שיטות שימוש](#שיטות-שימוש)
4. [דוגמאות שימוש](#דוגמאות-שימוש)
5. [מבנה הקבצים שמורדים](#מבנה-הקבצים-שמורדים)
6. [בעיות נפוצות ופתרונות](#בעיות-נפוצות-ופתרונות)

---

## 🎯 סקירה כללית

**Instaloader** הוא כלי Python מתקדם להורדת תוכן מאינסטגרם:

### ✅ מה ניתן להוריד:
- ✓ **פרופיל מלא**: תמונות, סרטונים, תיאורים
- ✓ **סטוריז**: סטוריז פעילות (24 שעות)
- ✓ **היילייטס**: כל היילייטס של הפרופיל
- ✓ **תגובות**: תגובות על פוסטים
- ✓ **Metadata**: לייקים, תאריך, מיקום, hashtags
- ✓ **תמונת פרופיל**: בגודל מלא
- ✓ **Geotags**: מיקומים של פוסטים
- ✓ **IGTV & Reels**: סרטונים ארוכים

### ⚠️ מגבלות:
- **פרופילים פרטיים**: דורשים התחברות + עקיבה
- **סטוריז והיילייטס**: דורשים התחברות
- **Rate Limiting**: אינסטגרם מגבילה מספר בקשות
- **Session**: יכול להיחסם אם יש יותר מדי בקשות

---

## 🔧 התקנה

```bash
# התקנה בסיסית
pip3 install instaloader

# בדיקה שהכל עובד
instaloader --version
```

---

## 🚀 שיטות שימוש

### 1️⃣ שימוש מהטרמינל (מהיר)

#### א. סריקה בסיסית (ללא התחברות)
```bash
# הורדת פרופיל מלא
instaloader miranbuzaglo

# הורדת פרופיל עם geotags
instaloader --geotags miranbuzaglo

# הורדת פרופיל עם תגובות
instaloader --comments miranbuzaglo

# הגבלת מספר פוסטים
instaloader --count=150 miranbuzaglo
```

#### ב. סריקה מלאה (עם התחברות)
```bash
# התחברות ראשונית
instaloader --login YOUR_USERNAME

# הורדה מלאה עם כל התכונות
instaloader --login YOUR_USERNAME \
  --stories \
  --highlights \
  --tagged \
  --igtv \
  --comments \
  --geotags \
  miranbuzaglo

# עדכון מהיר (רק פוסטים חדשים)
instaloader --login YOUR_USERNAME --fast-update miranbuzaglo
```

#### ג. אפשרויות מתקדמות
```bash
# שמירת timestamps (לעדכונים עתידיים)
instaloader --latest-stamps -- miranbuzaglo

# הורדה שקטה (פחות פלט)
instaloader --quiet miranbuzaglo

# הורדה רק של תמונות (בלי סרטונים)
instaloader --no-videos miranbuzaglo

# הורדה עם metadata מפורט
instaloader --metadata-json miranbuzaglo
```

### 2️⃣ שימוש דרך Python Script (גמיש יותר)

#### הרצת הסקריפט שכתבנו:
```bash
# ללא התחברות (פונקציונליות מוגבלת)
python3 scripts/test-instaloader.py

# עם התחברות (מומלץ)
python3 scripts/test-instaloader-with-login.py
```

#### דוגמה לסקריפט מותאם אישית:
```python
import instaloader

L = instaloader.Instaloader()

# התחברות
L.login("YOUR_USERNAME", "YOUR_PASSWORD")

# טעינת פרופיל
profile = instaloader.Profile.from_username(L.context, "miranbuzaglo")

# הורדת רק 50 פוסטים אחרונים
posts = profile.get_posts()
for i, post in enumerate(posts):
    if i >= 50:
        break
    L.download_post(post, target="miranbuzaglo")
    
    # הורדת תגובות
    for comment in post.get_comments():
        print(f"Comment by {comment.owner.username}: {comment.text}")
```

### 3️⃣ שימוש עם Session File (מומלץ)

```bash
# שמירת session פעם ראשונה
instaloader --login YOUR_USERNAME --sessionfile my_session

# שימוש חוזר (לא צריך להתחבר שוב!)
instaloader --sessionfile my_session --stories --highlights miranbuzaglo
```

---

## 📝 דוגמאות שימוש ספציפיות

### דוגמה 1: הורדת 150 פוסטים עם 3 תגובות לכל אחד
```bash
instaloader --login YOUR_USERNAME \
  --count=150 \
  --comments \
  --max-connection-attempts=5 \
  miranbuzaglo
```

### דוגמה 2: רק סטוריז והיילייטס
```bash
instaloader --login YOUR_USERNAME \
  --stories \
  --highlights \
  --no-posts \
  miranbuzaglo
```

### דוגמה 3: עדכון יומי של פרופיל
```bash
# שימוש ראשון
instaloader --login YOUR_USERNAME --latest-stamps -- miranbuzaglo

# עדכון יומי (רק חדש)
instaloader --login YOUR_USERNAME --latest-stamps -- miranbuzaglo
```

### דוגמה 4: הורדת כל הפרופילים שאתה עוקב
```bash
instaloader --login YOUR_USERNAME :saved
```

### דוגמה 5: הורדת hashtag
```bash
instaloader --login YOUR_USERNAME "#fashion" --count=100
```

---

## 📁 מבנה הקבצים שמורדים

לאחר הרצת instaloader, המבנה ייראה כך:

```
miranbuzaglo/
├── 2024-01-15_12-30-45_UTC.jpg          # תמונת פוסט
├── 2024-01-15_12-30-45_UTC.json.xz      # Metadata (תאריך, לייקים, תגובות)
├── 2024-01-15_12-30-45_UTC.txt          # תיאור הפוסט
├── 2024-01-15_12-30-45_UTC_1.jpg        # תמונה נוספת (אם זה carousel)
├── 2024-01-15_12-30-45_UTC_comments.json # תגובות
├── id                                    # User ID
├── miranbuzaglo_profile_pic.jpg         # תמונת פרופיל
├── stories/
│   └── 2024-01-16_08-15-20_UTC.mp4      # סטורי
└── highlights/
    └── Travel/
        └── 2023-12-01_10-00-00_UTC.jpg  # היילייט
```

### מידע בקבצי JSON:
```json
{
  "node": {
    "id": "...",
    "shortcode": "ABC123",
    "display_url": "https://...",
    "caption": "...",
    "taken_at_timestamp": 1234567890,
    "likes": 1234,
    "comments": 56,
    "location": {
      "name": "Tel Aviv"
    },
    "hashtags": ["#fashion", "#style"],
    "mentions": ["@brand"]
  }
}
```

---

## 🔍 בעיות נפוצות ופתרונות

### ❌ בעיה 1: "401 Unauthorized"
**סיבה**: אינסטגרם חוסמת בקשות ללא התחברות

**פתרון**:
```bash
# התחבר תמיד
instaloader --login YOUR_USERNAME miranbuzaglo
```

### ❌ בעיה 2: "Please wait a few minutes"
**סיבה**: יותר מדי בקשות - Rate limiting

**פתרון**:
```bash
# המתן 10-30 דקות ונסה שוב
# או השתמש באופציה --max-connection-attempts
instaloader --login YOUR_USERNAME \
  --max-connection-attempts=3 \
  --request-timeout=300 \
  miranbuzaglo
```

### ❌ בעיה 3: "PrivateProfileNotFollowedException"
**סיבה**: הפרופיל פרטי ולא עוקב אחריך

**פתרון**:
1. עקוב אחרי הפרופיל מהחשבון שלך
2. המתן לאישור
3. אז הרץ את instaloader

### ❌ בעיה 4: "Two Factor Authentication Required"
**סיבה**: החשבון שלך מוגן באימות דו-שלבי

**פתרון**:
```bash
# השתמש בסקריפט Python שלנו שתומך ב-2FA
python3 scripts/test-instaloader-with-login.py
```

### ❌ בעיה 5: Session מתנתק
**סיבה**: אינסטגרם מנתקת sessions ישנים

**פתרון**:
```bash
# התחבר מחדש ושמור session
instaloader --login YOUR_USERNAME --sessionfile my_session

# מעתה השתמש ב-sessionfile
instaloader --sessionfile my_session miranbuzaglo
```

---

## 📊 השוואה: Instaloader vs. אפשרויות אחרות

| תכונה | Instaloader | Apify | Manual Scraping |
|-------|------------|-------|-----------------|
| **חינמי** | ✅ | ❌ (בתשלום) | ✅ |
| **קל לשימוש** | ✅ | ✅ | ❌ |
| **סטוריז** | ✅ (עם login) | ✅ | ❌ (קשה) |
| **היילייטס** | ✅ | ✅ | ❌ (קשה) |
| **Rate Limiting** | ⚠️ בינוני | ✅ טוב | ❌ גרוע |
| **Metadata** | ✅ מלא | ✅ מלא | ⚠️ חלקי |
| **תחזוקה** | ✅ פעיל | ✅ | ❌ |

---

## 🎯 המלצות לפרויקט שלנו

### לשימוש חד-פעמי:
```bash
# הכי פשוט - טרמינל
instaloader --login YOUR_USERNAME \
  --stories --highlights --comments \
  --count=150 \
  miranbuzaglo
```

### לשימוש אוטומטי/חוזר:
```python
# השתמש בסקריפט Python
# עם session management
# ואינטגרציה עם הפרויקט הקיים
```

### לפרודקשן:
- שלב עם Apify (יותר יציב)
- שמור sessions בסופאבייס
- הוסף retry logic
- הוסף rate limiting נכון

---

## 🔗 קישורים שימושיים

- [תיעוד רשמי](https://instaloader.github.io/)
- [GitHub](https://github.com/instaloader/instaloader)
- [דוגמאות קוד](https://instaloader.github.io/as-module.html)

---

## 💡 טיפים מקצועיים

1. **תמיד שמור session** - חוסך זמן והתחברויות
2. **השתמש ב-sleep** - בין בקשות כדי להימנע מחסימה
3. **סרוק בלילה** - פחות עומס על אינסטגרם
4. **גבה קבצי JSON** - הם מכילים מידע חשוב
5. **השתמש ב-fast-update** - לעדכונים מהירים
6. **בדוק is_private** - לפני סריקה
7. **טפל בחריגות** - אינסטגרם משנה API הרבה

---

## 📞 תמיכה

אם נתקלת בבעיות:
1. בדוק את [Issues בגיטהאב](https://github.com/instaloader/instaloader/issues)
2. ודא שגרסת instaloader עדכנית: `pip3 install --upgrade instaloader`
3. השתמש ב-`--verbose` לדיבאג: `instaloader --verbose --login USER profile`
