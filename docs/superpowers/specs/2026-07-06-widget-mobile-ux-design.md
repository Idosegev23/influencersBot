# Widget Mobile UX Redesign — Bottom-Sheet — Design

- **Date:** 2026-07-06
- **Status:** Approved design → pending implementation plan
- **Owner:** Ido
- **Scope:** `public/widget.js` mobile experience only (breakpoint `window.innerWidth < 640`). Desktop unchanged.

---

## 1. רקע ובעיה

חוויית הווידג'ט במובייל נתפסת כלא טובה. אובחנו **4 כאבים** (כולם אושרו):
1. **פולשני** — מצב-פתוח = full-screen takeover; מרגיש כבד, מנתק מהאתר, קשה לחזור.
2. **הדר אוכל גובה** — כותרת cover-image + לוגו תופסת חצי מסך לפני שרואים את הצ'אט.
3. **מקלדת מכסה את הקלט** — כשמקלידים, המקלדת עולה ומסתירה את שדה ההקלדה/ההודעות.
4. **בועית סגורה חוסמת תוכן** — הבועית הצפה מכסה כפתורים/ברים של האתר (עגלה, ניווט).

זה לא סדרת טלאים אלא **החלפת פרדיגמת מצב-הפתוח**. הפרדיגמה הנבחרת פותרת את כל ה-4.

## 2. החלטות (מ-brainstorming)

| נושא | החלטה |
|------|-------|
| פרדיגמת מצב-פתוח | **Bottom-sheet** (לא full-screen takeover) |
| cover image במובייל | **מבוטל לגמרי** — הדר דק (לוגו+שם) בלבד. cover נשאר בדסקטופ |
| בועית סגורה | **scroll-aware** — מתכווצת/נעלמת בגלילה למטה, חוזרת בגלילה למעלה |
| דסקטופ | **ללא שינוי** — הכרטיס הקיים נשאר |

## 3. עיצוב מפורט

### 3.1 Breakpoint + היקף
כל ההתנהגות מאחורי `isMobile = window.innerWidth < 640`. משפיע על **כל ה-views** שמשתמשים ב-mobile panel (chat, support_form, support_success, lead_form, book_demo_form, order_form, order_result — כרגע 6 מופעים של אותו panelStyle). כדי לא לחזור על עצמנו, מרכזים את מעטפת ה-sheet ל-helper אחד (`mobileSheetStyle()` + `mobileSheetShell(innerHtml)`), במקום 6 מחרוזות כפולות.

### 3.2 מצב פתוח — ה-Sheet
- **מבנה:** backdrop (fixed inset:0, כהה ~rgba(0,0,0,0.45)) + sheet (fixed bottom:0, `height: 88dvh`, `max-height: 92dvh`, פינות עליונות מעוגלות ~20px).
- **כניסה:** slide-up (`translateY(100%)`→`0`) + fade-in של ה-backdrop, ~0.28s cubic-bezier.
- **סגירה:** (א) טאפ על ה-backdrop, (ב) swipe-down על ה-sheet/handle מעל סף, (ג) X בהדר. כולם מחזירים ל-closed (bubble).
- **drag handle:** פס אפור ~40px למעלה במרכז; touch-drag כלפי מטה מזיז את ה-sheet; שחרור מעל ~120px או מהירות גבוהה = סגירה, אחרת snap חזרה.
- **האתר מאחור:** נראה ומעומעם דרך ה-backdrop; לא נגלל (scroll-lock, ראה 3.5).

### 3.3 הדר דק (פותר #2)
- במובייל **אין cover-image**. הדר קומפקטי בגובה ~56px: אווטר קטן (לוגו) + שם המותג + נקודת "זמין" + כפתור X.
- זהה בין welcome ל-chat (במובייל אין את הכותרת העשירה של הדסקטופ).
- `headerHtml(pc, isMobile)` מקבל ענף מובייל שמחזיר את ההדר הדק (מתעלם מ-coverImage).

### 3.4 מקלדת (פותר #3)
- שימוש ב-**`window.visualViewport`**: מאזין ל-`resize`/`scroll` של ה-visualViewport. כשהמקלדת עולה, גובה ה-sheet מתעדכן ל-`visualViewport.height` (בניכוי offset), כך ש:
  - שדה הקלט **נשאר מעוגן מעל המקלדת** תמיד (הקלט ב-flex bottom של ה-sheet).
  - אזור ההודעות גולל מעל הקלט; scroll-to-bottom אחרי resize.
- fallback: אם `visualViewport` לא נתמך — הקלט נשאר `position:sticky` בתחתית ה-sheet (עדיף על היום).

### 3.5 גלילה ומחוות
- **scroll-lock** של האתר כשה-sheet פתוח (קיים ב-`render()` — נשמר/מורחב ל-backdrop).
- `overscroll-behavior: contain` על אזור ההודעות ועל ה-sheet — מונע scroll-chaining לאתר.
- אזור ההודעות הוא ה-scroll היחיד בתוך ה-sheet.

### 3.6 בועית סגורה — scroll-aware (פותר #1-חלקי + #4)
- גודל ~**52px** (מ-60), safe-area (`bottom: calc(16px + env(safe-area-inset-bottom))`).
- **scroll listener** על ה-window: גלילה למטה מעבר לסף → הבועית מתכווצת/נעלמת (`translateY`/opacity); גלילה למעלה או עצירה → חוזרת. debounced. כך הבועית לעולם לא מכסה בר-תחתון של האתר בזמן קריאה/גלישה.
- הבועית עדיין `position:fixed` bottom-right (או לפי `config.position`).

## 4. הערות מימוש (widget.js)

- `public/widget.js` — vanilla IIFE, `var`, inline styles. יש לו **hunks לא-מקומיטים של Ido** — כל commit חייב stash-technique (stash → edit → commit → pop) כדי לא לבלוע אותם.
- מרכוז: `mobileSheetStyle()` מחזיר את מחרוזת ה-sheet; `mobileBackdropHtml()` את ה-backdrop; מוסיפים `attachSheetGestures()` (drag/keyboard/backdrop listeners) שנקרא אחרי render של view מובייל פתוח.
- 6 מופעי `position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:0;` מוחלפים בקריאה ל-`mobileSheetStyle()`.
- ה-container/`updateContainerPosition` + `renderClosed` מקבלים את התנהגות ה-bubble ה-scroll-aware.
- `visualViewport` listener נרשם פעם אחת (לא per-render) ומעדכן את גובה ה-sheet אם פתוח.

## 5. בדיקות
זו חווית UX — **בדיקה ידנית על מכשירים אמיתיים חובה**: iOS Safari + Android Chrome. תרחישים: פתיחה/סגירה (3 הדרכים), הקלדה עם מקלדת (קלט נשאר גלוי), גלילת האתר מאחור (נעולה), בועית מתכווצת בגלילה, safe-area על מכשיר עם notch/home-bar, סיבוב מסך. אין framework אוטומטי ל-widget.js; `node --check` + בדיקה ידנית.

## 6. סיכונים
- **`visualViewport` iOS quirks** — התנהגות שונה בין גרסאות; ה-fallback (sticky input) מבטיח שלא יישבר.
- **drag gesture מול scroll** — יש להבחין בין swipe-down-to-dismiss (על ה-handle/הדר) לבין גלילת ההודעות; ה-drag פעיל רק מה-handle/הדר, לא מאזור ההודעות.
- **desktop regression** — כל שינוי מאחורי `isMobile`; לוודא שהכרטיס בדסקטופ לא זז.
- **Ido's uncommitted widget.js hunks** — סיכון בליעה; stash-technique מנוהל בכל commit.

## 7. Non-goals
- לא נוגעים בדסקטופ.
- לא משנים את לוגיקת הצ'אט/RAG/המלצות — רק שכבת ה-UI/UX של המובייל.
- לא Phase C (עגלה/פופאפ) — זה נפרד.
