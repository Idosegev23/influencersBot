# פרומפט לקלוד קוד — שדרוג קומפוננטת "גלו" (Discover)

## הקשר
אני בונה פלטפורמת SaaS למשפיעני אינסטגרם. יש לי טאב שנקרא "גלו" שמציג את התוכן המובחר של המשפיענ/ית — הטופ 5 מהאינסטגרם שלהם. המטרה: לתת לעוקבים מקום לגלול, לדעת על מה לדבר עם הצ'אטבוט, ולהרגיש שזו "הבחירה האישית" של המשפיענית.

## מצב נוכחי
הקומפוננטה הקיימת נמצאת ב: `src/components/chat/discovery/`
- `DiscoveryTab.tsx` — אורקסטרטור ראשי, מציג שורות marquee
- `DiscoveryCard.tsx` — כרטיס בודד (140x240px, יחס 9:16)
- `DiscoveryRow.tsx` — שורת גלילה אופקית עם Marquee
- `DiscoveryList.tsx` / `DiscoveryListItem.tsx` — תצוגת רשימה
- `CategoryCard.tsx` / `CategoryGrid.tsx` — בחירת קטגוריה
- `QuestionsView.tsx` — ממשק שאלות אינטראקטיבי

### טיפוסים קיימים (`src/lib/discovery/types.ts`)
```typescript
interface DiscoveryItem {
  rank: number;
  postId?: string;
  shortcode?: string;
  postUrl?: string;
  thumbnailUrl?: string;
  captionExcerpt: string;
  mediaType?: 'post' | 'reel' | 'carousel' | 'video';
  metricValue?: number;
  metricLabel?: string;
  aiSummary?: string;
  aiTitle?: string;
}
```

### ה-Hook הקיים (`src/hooks/useDiscoveryAll.ts`)
מחזיר `{ rows, loading, error }` — כש-rows זה מערך של `{ category, items }`.

### הצבעים והעיצוב הנוכחי
- רקע כללי: `#f4f5f7` (אפור בהיר)
- טקסט כותרת: `#0c1013` (כהה)
- טקסט משני: `#676767` (אפור בינוני)
- אייקון sparkles: `#e5a00d` (זהב)
- טאב פעיל (גלו): סגול `#7c3aed` עם רקע `rgba(168, 85, 247, 0.12)`
- כרטיסים: רקע לבן, border `#e5e5ea`, border-radius 20px
- גרדיאנט על כרטיסים: `linear-gradient(to top, rgba(0,0,0,0.75)...transparent)`
- צבעי קטגוריות: אדום `#FF6B6B`, ורוד `#E84393`, כחול `#0984E3`, ירוק `#00B894`, כתום `#F39C12`, סגול `#6C5CE7`
- פונט: Heebo (עברית)
- כיוון: RTL

## מה צריך לבנות — "גלו 2.0"

### הקונספט
גלו הוא ה"קולקשיין האישי" של המשפיענית. לא feed ולא ארכיון — אלא בחירה אישית. 5 דברים שהיא בחרה להראות לך. העיצוב צריך להרגיש editorial/luxury אבל בהתאמה לשפה הוויזואלית הקיימת (לא חייב נטפליקס, זה צריך להתאים למערכת).

### הפלואו המלא
```
כניסה לטאב גלו
    ↓
5 כרטיסים קינמטיים (swipe אופקי / scroll אנכי)
    ↓
לחיצה על אייטם
    ↓
מודאל: וידאו/תמונה מוצגים + 2 כפתורים:
    ├── "שוחח על זה" → חזרה לטאב צ'אט עם קונטקסט ("ראיתי את הפוסט על X")
    └── "לפוסט המקורי" → פתיחת אינסטגרם בטאב חדש
    ↓
סגירת מודאל → חזרה לגלו (scroll position נשמר)
    ↓
אחרי 2-3 אייטמים → lead magnet popup עולה
    └── "רוצה גישה לקולקשיין הפרטי?" → טופס רישום
```

### דרישות טכניות מפורטות

#### 1. כרטיסים (Cards)
- לשמור על יחס 9:16 (מתאים לרילסים)
- hover: scale(1.03) עם shadow (כבר קיים, לשמור)
- הצגת: תמונה/thumbnail כ-background, rank badge בפינה, כותרת AI בתחתית עם גרדיאנט כהה
- אם זה reel/video — אייקון Play בפינה
- מטריקה (צפיות/לייקים) כ-pill שקוף בתחתית

#### 2. מודאל (Modal) — **זה החלק החדש העיקרי**
- פתיחה עם אנימציית Framer Motion (scale + fade)
- backdrop blur כהה
- בתוך המודאל:
  - אם `mediaType === 'reel' || 'video'` → נגן וידאו (מתחיל muted, עם toggle לסאונד)
  - אחרת → תמונה בגודל מלא
  - כותרת AI (`aiTitle`) מתחת
  - תקציר AI (`aiSummary`) אם קיים
  - שני כפתורים:
    - **"שוחח על זה עם ה-AI"** — קורא ל-`onAskInChat` עם הקונטקסט המועשר (כמו שכבר ממומש ב-`handleItemClick`) + מחזיר לטאב צ'אט
    - **"לפוסט באינסטגרם"** — `window.open(item.postUrl, '_blank')`
- סגירה: לחיצה על X, לחיצה על backdrop, או Escape
- חזרה: scroll position ב-`DiscoveryTab` נשמר (לא מאפס)

#### 3. Private Collection (אופציונלי — Phase 2)
- אייטמים 6-10 מופיעים עם blur + אייקון מנעול
- לחיצה → popup רישום (שם + אימייל)
- אחרי רישום → התוכן נפתח
- הלידים נשמרים ב-Supabase (טבלה `discovery_leads`)

#### 4. Lead Magnet Popup
- מופעל אוטומטית אחרי צפייה ב-2-3 אייטמים (counter ב-sessionStorage)
- עיצוב: כרטיס עם blur background
- "רוצה גישה לקולקשיין הפרטי של {influencerName}?"
- שדות: שם, אימייל
- כפתור שליחה → שמירה ב-Supabase + סגירת popup
- אם המשתמש סגר — לא מופיע שוב באותו session

#### 5. שמירת מצב (Session Memory)
- `sessionStorage` עבור:
  - scroll position בגלו
  - counter של אייטמים שנצפו (למגנט לידים)
  - האם popup לידים כבר הוצג
- כפתור "חזרה לגלו" בממשק הצ'אט (אחרי שהמשתמש עבר מגלו לצ'אט)

### מבנה קבצים מוצע
```
src/components/chat/discovery/
├── DiscoveryTab.tsx          ← לעדכן — להוסיף state למודאל ולידים
├── DiscoveryCard.tsx         ← קיים, שדרוגים קלים
├── DiscoveryRow.tsx          ← קיים, בסדר
├── DiscoveryModal.tsx        ← **חדש** — מודאל עם וידאו/תמונה + כפתורים
├── LeadMagnetPopup.tsx       ← **חדש** — popup רישום
├── PrivateCollectionCard.tsx ← **חדש** — כרטיס נעול עם blur
├── DiscoveryList.tsx         ← קיים
├── DiscoveryListItem.tsx     ← קיים
├── CategoryCard.tsx          ← קיים
├── CategoryGrid.tsx          ← קיים
├── QuestionsView.tsx         ← קיים
└── DiscoveryLoading.tsx      ← קיים
```

### חוקי עיצוב
- RTL בכל מקום (`dir="rtl"`)
- Framer Motion לכל אנימציה
- Tailwind CSS לסטיילינג (עם inline styles לצבעים ספציפיים כמו שכבר נעשה בפרויקט)
- Mobile-first — הקומפוננטה חייבת לעבוד על מובייל (375px ומעלה)
- צבעים: להשתמש בפלטת הצבעים הקיימת, לא להמציא צבעים חדשים
- פונט Heebo לעברית

### API Routes קיימים שכבר עובדים
- `GET /api/discovery/all-lists?username=X` — כל הרשימות
- `GET /api/discovery/list?username=X&category=Y` — רשימה ספציפית
- `GET /api/discovery/categories?username=X` — קטגוריות

### אל תשנה
- את ה-hooks הקיימים (`useDiscovery`, `useDiscoveryAll`)
- את מבנה ה-API routes
- את ה-types ב-`src/lib/discovery/types.ts`
- את לוגיקת הקטגוריות ב-`src/lib/discovery/categories.ts`

### התחל מ:
1. צור את `DiscoveryModal.tsx` — זה הדבר הכי חשוב
2. עדכן את `DiscoveryTab.tsx` לתמוך במודאל (state: selectedItem, isModalOpen)
3. צור את `LeadMagnetPopup.tsx`
4. בדוק שהכל עובד RTL ומובייל
