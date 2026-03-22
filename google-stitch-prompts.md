# Google Stitch Prompts — InfluencerBot Platform
## מדריך פרומפטים מלא לכל מסכי המערכת

> **הנחיות כלליות לכל הפרומפטים (Design System):**
> - **Platform:** Web App (responsive — desktop + mobile)
> - **Direction:** RTL (Right-to-Left) — Hebrew UI
> - **Overall Vibe:** Soft & Dreamy — warm, cozy, friendly. Like Notion meets Calm. Nothing aggressive or corporate. Everything feels light, inviting, and pleasant to use.
> - **Backgrounds:** Warm cream (#FFF7ED) or soft white (#FEFCE8) as page background. Never dark.
> - **Cards:** White (#FFFFFF) with very soft drop shadows (shadow-sm), large rounded corners (rounded-2xl / 16-20px). No harsh borders — either borderless or very faint pastel border.
> - **Color Palette (Pastels):**
>   - Primary (actions, CTA): Soft Lavender (#C4B5FD) / Pastel Violet (#A78BFA)
>   - Success / positive: Mint Green (#A7F3D0)
>   - Highlights / accents: Baby Pink (#FBCFE8)
>   - Info / secondary: Sky Blue (#BAE6FD)
>   - Warning / attention: Peach (#FED7AA)
>   - Subtle / tags: Soft Yellow (#FDE68A)
>   - Text primary: Warm Dark Gray (#4B5563)
>   - Text secondary: Medium Gray (#9CA3AF)
> - **Pill Components (capsule shape, border-radius: 9999px):**
>   - CTA / primary actions → Filled pastel pill (e.g., lavender background, dark text)
>   - Filters / tabs → Outlined pastel pill (transparent bg, colored border)
>   - Status badges → Filled soft pastel (mint=active, peach=pending, pink=alert, sky blue=info)
>   - Active state → Filled pastel. Inactive → Outlined or ghost.
> - **Typography:** Hebrew font "Assistant" or "Heebo", clean rounded sans-serif. Warm dark gray text, never pure black.
> - **Icons:** Lucide icon set (thin line icons) in matching pastel colors.
> - **Animations:** Gentle fade-in, soft slide-up, no aggressive bounces. Everything smooth and calm.
> - **Shadows:** Soft and warm — `shadow-sm` or `shadow-md` with slight warmth, never harsh black shadows.
> - **Empty States:** Friendly illustration or large pastel icon with warm encouraging text.
> - **Charts:** Pastel-colored series, soft gradients fills, no harsh grid lines. Tooltips with white background and soft shadow.

---

## 1. דשבורד ראשי — Influencer Dashboard

### Prompt:

```
Design a modern SaaS influencer dashboard screen for a Hebrew RTL web application.

VIBE: Soft & Dreamy — warm cream background (#FFF7ED), white cards with gentle shadows, pastel accents (lavender, mint, pink, sky blue, peach). Think Notion meets a cozy wellness app. Pill-shaped components everywhere — filled pastels for actions, outlined for navigation. Typography in warm dark gray, never pure black. Rounded corners on everything (16-20px radius).

HEADER SECTION (top of page):
- Warm cream background with very subtle soft gradient (cream to slightly pinker cream).
- Left side (RTL — visually on the right): circular avatar photo (44x44px) with a soft 2px lavender border and a small mint-green online-status dot (14px) at the bottom-left. Next to it: display name in warm dark gray bold text, @username below in light gray.
- Right side (RTL — visually on the left): three pill-shaped buttons:
  1. "Copy Link" — outlined pill (faint gray border), link icon. On click: fills with mint green + checkmark.
  2. "Bot Link" — filled lavender pill with external link icon.
  3. "Logout" — outlined pill (faint gray border) with logout icon.

METRICS STRIP (below header):
- Horizontal row of 6 metric cards in a responsive grid (6 cols desktop, 3 cols mobile).
- Each card: white card with very soft shadow, rounded-2xl, containing:
  - A small pastel-colored icon circle (32px) — each metric uses a different pastel: lavender, sky blue, peach, mint, pink, soft yellow.
  - Large bold number (24px, warm dark gray, tabular-nums).
  - Small label (11px, medium gray).
  - Optional: small delta pill badge with trend arrow — mint background for positive, peach for negative.
- The 6 metrics: Followers (lavender), Conversations (sky blue), Partnerships (peach), Coupons (mint), Engagement Rate (pink), Views (soft yellow).

MAIN CONTENT — TWO COLUMN LAYOUT (60/40 desktop, single column mobile):

LEFT COLUMN (60%):

Section 1 — "Bot Activity" (פעילות בוט):
- White card, soft shadow, rounded-2xl.
- Header row: soft icon + title "פעילות בוט" in warm dark gray.
- 3 mini stat boxes (row): Incoming Messages, Responses Sent, Avg Response Time — each in a very light pastel tinted box (lavender/10, mint/10, sky blue/10).
- Mini bar chart below: 21-day activity bars, each bar filled with soft lavender gradient. Bars have rounded tops (4px radius). On hover: bar shifts to slightly deeper lavender, tooltip appears above with white background + soft shadow showing date & count.
- Empty state: light gray text "אין עדיין נתוני פעילות" centered, with soft pastel icon above.

Section 2 — "Recent Posts":
- White card, soft shadow.
- Post type filter pills at top (outlined pills): Image, Video, Reel, Carousel — each with matching pastel border.
- Post rows:
  - Soft pastel icon circle (type indicator) on right (RTL).
  - Caption (truncated, warm dark gray) + relative time (light gray).
  - Stats on left side: heart icon + likes (pink tint), comment icon + comments (sky blue tint), eye icon + views (peach tint).
- Hover: very subtle cream-to-white background transition.
- Divider between rows: very faint line (gray-100).

Section 3 — "Recent Chats":
- White card. Simple list: avatar circle, message count, relative time per row.
- Link arrow (outlined pill) to full conversations page.

RIGHT COLUMN (40%):

Section 1 — "Partnerships":
- Total revenue: large bold number with soft lavender text gradient.
- Partnership list: each row shows brand name, status pill (filled soft pastel — mint=active, sky blue=proposal, lavender=contract, peach=negotiation, gray=completed), amount.
- Empty state: "Add Partnership" button as filled lavender pill.

Section 2 — "Coupons":
- Coupon list: code in monospace (inside a dashed-border soft pill), discount value, copy count.

Section 3 — "Bot Status":
- Simple rows: icon + label + value. Persona status shows soft peach warning if unconfigured.

Section 4 — "Quick Navigation":
- 6 pill buttons in 2×3 grid, each filled with a different soft pastel:
  - "Manage Content" (lavender), "Bot Persona" (peach), "Documents" (sky blue), "QR + Share" (mint), "Support" (pink), "Settings" (soft yellow border, outlined).

RESPONSIVE: Desktop 2-column 60/40, mobile single column, metrics 3-col grid.
ANIMATIONS: Gentle staggered fade-in + slide-up on load.
```

---

## 2. צ'אט ציבורי — Public Chat Interface

### Prompt:

```
Design a full-screen chat interface for a public-facing AI chatbot, Hebrew RTL web application.

VIBE: Soft & Dreamy — warm, friendly, conversational. Like chatting with a kind friend. Cream/white background, pastel accent bubbles. Rounded everything. Pill-shaped buttons for actions and suggestions. Nothing intimidating — soft and welcoming.

OVERALL LAYOUT:
- Full viewport height (100vh), cream background (#FFF7ED).
- Chat messages scroll inside a central area.

TOP BAR:
- White bar with very soft bottom shadow.
- Right side (RTL): influencer avatar (40px circle, lavender border) + name (bold warm gray) + mint "online" dot.
- Left side (RTL): 4 tab pills:
  1. "צ'אט" (Chat) — filled lavender pill when active.
  2. "קופונים" (Coupons) — outlined lavender pill.
  3. "תמיכה" (Support) — outlined pill.
  4. "גלה" (Discover) — outlined pill.
- Inactive tabs: transparent bg with faint lavender border. Active: filled soft lavender.

CHAT MESSAGES AREA (scrollable):
- User messages: RIGHT-aligned (RTL), soft lavender bubble (#E9D5FF), warm dark gray text, rounded-2xl with slightly less rounding on bottom-right corner.
- Bot messages: LEFT-aligned (RTL), white bubble with very soft shadow, warm gray text, rounded-2xl with slightly less rounding on bottom-left.
- Timestamps: tiny light gray text below each bubble.
- Bot special messages:
  - Brand cards: horizontal scroll of white cards with soft shadow, brand logo, name, description, mint "Copy Coupon" pill button.
  - Product cards: white card, product thumbnail, name, price, soft pink "Copy Code" pill.
  - Content cards: Instagram preview card with image, caption snippet, pastel stat badges.
- Typing indicator: three soft bouncing dots in a white bubble (lavender dots).

SUGGESTED QUESTIONS (below last bot message):
- Up to 3 outlined lavender pill buttons with question text.
- Hover: pill fills with very light lavender tint.
- Click: inserts as user message.

INPUT AREA (fixed bottom):
- White bar with soft top shadow.
- RTL text input: rounded-2xl, faint lavender border, cream background, placeholder "...שאלו משהו" in light gray.
- Right (RTL): paperclip attachment button (outlined pill, gray).
- Left (RTL): send button — filled lavender circle when text present, soft gray when empty. Arrow-up icon inside.

COUPONS TAB:
- Grid of white coupon cards with soft shadow:
  - Brand name at top, coupon code in large monospace inside dashed-border pill, discount description, filled mint "Copy Code" pill, expiry in light gray.

SUPPORT TAB:
- Clean form on white card: category dropdown (outlined pill style), subject input, textarea, filled lavender "Submit" pill.

DISCOVER TAB:
- Category pills at top (outlined, different pastel borders per category).
- Content cards below: white cards with soft shadow, image, type badge (filled pastel pill), title.

RESPONSIVE: Mobile full-screen. Desktop: centered (max-width 480px) with blurred cream background.
```

---

## 3. ניהול שיתופי פעולה — Partnerships Page

### Prompt:

```
Design a partnership management dashboard for a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy — organized but cozy. Cream background, white cards, pastel pills for navigation and status. Like a friendly project management tool. Rounded corners, soft shadows, warm typography.

PAGE HEADER:
- Outlined pill back button (right side, RTL): arrow + "חזרה".
- Title: "שיתופי פעולה" (bold 24px, warm dark gray).
- Small info icon (outlined circle, gray).
- Left side (RTL): filled lavender pill "+ חדש" with plus icon.

VIEW SELECTOR (below header):
- White bar with soft shadow, rounded-2xl, containing 3 tab pills:
  1. "ספרייה" (Library) — filled lavender when active.
  2. "סקירה" (Overview) — outlined when inactive.
  3. "לוח שנה" (Calendar) — outlined when inactive.
- Smooth transition between active states.

STATS ROW (6 columns, responsive):
- 6 white cards with soft shadow:
  - "Total" — warm dark gray number.
  - "Active" — mint tinted number.
  - "Revenue ₪" — lavender tinted number.
  - "Pending ₪" — peach tinted number.
  - "Avg Deal ₪" — sky blue tinted number.
  - "Completion %" — pink tinted number.
- Each: centered content, small label (medium gray) below value.

LIBRARY VIEW (default):
- Partnership cards — white, rounded-2xl, soft shadow:
  - Brand avatar (40px, soft border) + brand name (bold) + campaign (gray).
  - Status pill (filled pastel): Active=mint, Proposal=sky blue, Contract=lavender, Negotiation=peach, Completed=gray, Cancelled=soft red/pink.
  - Amount: ₪XX,XXX bold.
  - Date range in light gray.
  - Deliverables count in small outlined pill.
  - Hover: very slight lift (translateY -2px) + shadow-md.
- Empty state: large pastel icon, "אין שיתופי פעולה עדיין", filled lavender "Add First" pill.

OVERVIEW VIEW:
- Two white cards side by side:
  1. Pipeline Chart — horizontal bars, each bar in the matching status pastel color. Soft rounded ends.
  2. Revenue Chart — area chart with soft lavender gradient fill, rounded line, peach dots for data points. X-axis months, Y-axis ₪.
- Chart tooltips: white card with soft shadow, warm dark gray text.

CALENDAR VIEW:
- Monthly grid on white card. Partnership events as soft pastel bars spanning date ranges, color matching status. Nav arrows as outlined pills.

RESPONSIVE: Desktop 6-col stats + 2-col charts. Mobile 2-col stats + stacked.
```

---

## 4. יצירת שיתוף פעולה חדש — New Partnership

### Prompt:

```
Design a multi-step partnership creation wizard for a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy — guided, gentle, step-by-step. Cream background, white form cards, pastel accents. Feels like a friendly onboarding flow — clear and not overwhelming.

STEP 1 — MODE SELECTION:
- Title: "יצירת שיתוף פעולה חדש" (warm dark gray, 24px).
- 4 option cards in 2×2 grid — white, rounded-2xl, soft shadow:
  1. Upload: cloud upload icon in lavender circle, bold title "העלאת חוזה", small gray description. Left border: 3px lavender.
  2. Template: template icon in sky blue circle. Left border: sky blue.
  3. Manual: pencil icon in mint circle. Left border: mint.
  4. Search: search icon in peach circle. Left border: peach.
- Hover: card lifts slightly + left border thickens to 5px.

STEP 2a — DOCUMENT UPLOAD:
- White card, rounded-2xl. Drag-drop zone: dashed lavender border (200px height), cloud icon (48px, lavender), text "גרור קובץ לכאן". On drag-over: lavender background tint, border goes solid.
- Accepted formats note in small gray text.
- File preview card: white mini-card with file icon + name + size.
- Progress bar: soft lavender gradient fill, rounded ends.
- Status messages:
  - Parsing: sky blue tinted bar, spinner, "...מנתח את המסמך".
  - Success: mint tinted bar, checkmark, "!המסמך נוסף בהצלחה".
  - Error: pink/peach tinted bar, X icon, error text.

STEP 2b — AI REVIEW:
- "סקירת פרטים" title.
- Confidence indicator: circular badge — mint fill (>80%), peach (60-80%), pink (<60%).
- Pre-filled form fields on white card:
  - Brand Name, Campaign Name — text inputs with soft lavender focus border.
  - Status — outlined pill dropdown.
  - Dates — date pickers with calendar icon.
  - Amount — number input with ₪ prefix.
  - Deliverables — tag input: tags as filled lavender pills with × button.
  - Payment Schedule — simple table with light row striping.
  - Exclusivity — soft toggle switch (lavender when on, gray when off).
  - Notes — textarea.
- Each AI-parsed field: small "AI" pill badge (sky blue, filled) next to label.
- Bottom: filled lavender pill "אישור ושמירה", outlined pill "חזרה".

STEP 2c — MANUAL FORM:
- Same fields, all empty. Clean single-column layout (max-width 600px).

RESPONSIVE: Mode cards → 1 column on mobile. Form → full-width.
```

---

## 5. מאגר מסמכים — Documents Library

### Prompt:

```
Design a document management library for a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy — clean file manager feeling, cream background, white cards, pastel status indicators. Like a cozy Dropbox. Friendly and organized.

PAGE HEADER:
- Outlined pill back button: arrow + "חזרה".
- Title: "מאגר מסמכים" (bold 24px, warm dark gray).
- Subtitle: "העלה מסמכים למאגר המידע של הצ'אטבוט" (medium gray).

UPLOAD SECTION (white card, rounded-2xl, soft shadow):
- Header: upload cloud icon (lavender) + "העלאת מסמך למאגר".
- Format note: "PDF, Word, Excel, images — max 10MB" (small gray).
- Drag-drop zone: dashed lavender border, cream background (#FFF7ED inside), centered cloud icon (48px, gray), text "גרור קבצים לכאן או לחץ לבחירה".
- On drag-over: dashed border → solid lavender, background → very light lavender tint.
- Status messages (below zone):
  - Parsing: sky blue tinted rounded bar, spinner, "...מנתח ומאנדקס".
  - Success: mint tinted rounded bar, checkmark, "!המסמך נוסף למאגר בהצלחה".
  - Error: peach tinted rounded bar, X icon, message + close button.

STATS (2-column grid):
- Two small white cards: "Total Documents" and "Indexed Documents" — number + label.

DOCUMENTS LIST:
- Empty state: large FileText icon (lavender, 48px), "אין מסמכים במאגר עדיין" warm gray text.

- Document rows — white card, rounded-2xl, soft shadow:
  - FileText icon (32px) in soft lavender circle.
  - Filename (bold, truncated) + size + date (small gray).
  - Status pill (filled pastel, far left in RTL):
    - Indexed: mint pill with database icon + "12 chunks".
    - Processing: sky blue pill with spinner + "מאנדקס".
    - Failed: pink pill with X icon.
    - Pending: peach pill with clock icon.
  - Hover: very soft lift + shadow-md.

RESPONSIVE: Stats stack on mobile. Document cards full width.
```

---

## 6. אנליטיקס — Analytics Dashboard

### Prompt:

```
Design a comprehensive analytics dashboard for a Hebrew RTL influencer SaaS platform.

VIBE: Soft & Dreamy — data-rich but warm and friendly. Cream background, white chart cards, pastel data series. Like a cozy version of Mixpanel. Soft shadows, rounded everything, warm typography.

PAGE HEADER:
- BarChart icon (lavender) + "אנליטיקס" (bold 24px).
- Date range selector (right side, RTL): outlined pill with calendar icon and dropdown — options: "7 ימים", "14 ימים", "30 ימים", "90 ימים". Soft lavender border, white bg.

SUMMARY CARDS (4 columns, 2 on mobile):
- White cards, rounded-2xl, soft shadow, 120px height:
  - Top-right corner: delta pill badge — filled mint + up-arrow (positive), filled peach + down-arrow (negative).
  - Pastel-colored icon circle (48px): different pastel per card.
  - Large bold number (30px, warm dark gray, tabular-nums).
  - Small label (medium gray).
  - Optional sub-metric (tiny gray text).
- Cards: Sessions (sky blue icon), Messages (mint icon), Coupons Copied (lavender icon), Product Clicks (peach icon).

CHARTS (2-column grid, stacked mobile):

Chart 1 — "Sessions & Messages" (Area Chart):
- White card, rounded-2xl, soft shadow.
- Two series: Sessions (soft lavender line + gradient fill from lavender/30 to transparent), Messages (soft mint line + gradient fill from mint/30 to transparent).
- X-axis dates, Y-axis counts — light gray axis lines (no harsh grid).
- Tooltip: white popup, soft shadow, warm gray text.
- Legend: small pastel dots + labels.

Chart 2 — "Conversions" (Bar Chart):
- White card. Two bar series: Coupons (lavender bars, rounded top), Clicks (peach bars, rounded top).
- Same soft axis and tooltip styling.

TOP PRODUCTS TABLE (full-width white card):
- Header: warm gray text on very light lavender tinted row.
- Columns: #, מוצר, מותג, קליקים, קופונים, סה״כ.
- Ranking pills: #1 soft yellow filled pill, #2 light gray filled, #3 peach filled. Rest: minimal.
- Hover: very subtle row highlight (cream tint).

ADDITIONAL STATS (3-column grid):
- 3 white cards: avg duration (sky blue icon), satisfaction (soft yellow icon), return visitors (mint icon).

RESPONSIVE: 4-col → 2-col cards. 2-col → stacked charts. Table scrolls horizontally on mobile.
ANIMATIONS: Cards fade in staggered. Chart lines draw smoothly.
```

---

## 7. היסטוריית שיחות — Conversations History

### Prompt:

```
Design a chat conversations history page for a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy — organized inbox feeling, warm and cozy. Cream background, white session cards, soft pastel accents. Like a friendly email app.

PAGE HEADER:
- MessageCircle icon (lavender) + "היסטוריית שיחות" (bold 24px).
- Session count: outlined pill "XX שיחות" (faint gray).

SEARCH & FILTER:
- Search input: white bg, rounded-2xl, soft lavender focus border, search icon right (RTL), placeholder "...חיפוש בשיחות", X clear button when typing.
- Filter pills (below search):
  1. "הכל" (All) — filled lavender when active.
  2. Star icon + "מסומנים" — filled soft yellow when active, outlined when inactive.
  3. Flag icon + "מדווחים" — filled pink when active, outlined when inactive.

SESSIONS LIST:
- Session cards — white, rounded-2xl, soft shadow:
  - Flagged: soft pink left border (3px).
  - Starred: soft yellow left border.
  - Normal: no colored border.

- Card content (clickable):
  - Right (RTL): user avatar circle (48px, very light lavender bg, User icon), "X הודעות" (bold) + star/flag icons inline, clock + time (gray).
  - Left (RTL): soft yellow star toggle button, soft pink flag toggle button, chevron (rotates on expand).

- Expanded messages (accordion, smooth animation):
  - Max-height 384px, scrollable.
  - User messages: small lavender avatar, soft lavender bubble.
  - Bot messages: small mint avatar, white bubble with soft shadow.
  - Tiny timestamps below each.

LOAD MORE: outlined pill "Load More", centered.
EMPTY STATE: large MessageCircle icon (lavender), warm gray text.

RESPONSIVE: Full-width cards. Filters scroll horizontally on mobile.
```

---

## 8. פרסונת צ'אטבוט — Chatbot Persona Editor

### Prompt:

```
Design an AI chatbot persona configuration editor for a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy — creative and warm, like a character customizer in a cozy game. Cream background, white expandable section cards, pastel accents on inputs and toggles.

PAGE HEADER:
- Bot icon (lavender) + "פרסונת הצ'אטבוט" (bold 24px).
- Subtitle: "הגדר את האישיות והסגנון של הבוט שלך" (medium gray).
- "Save" button: filled lavender pill. On success: changes to mint pill "!נשמר" with checkmark.

SECTIONS (accordion cards — white, rounded-2xl, soft shadow):

Section 1 — "Voice Rules" (כללי קול): microphone icon (peach).
- Tone: outlined pill dropdown (Friendly, Professional, Casual, Witty).
- Response Length: outlined pill dropdown (Short, Medium, Detailed).
- Favorite Phrases: tag input — each tag is a filled lavender pill with × button. Input has + button.
- Language: outlined pill dropdown (Hebrew, English, Mixed).
- Sass Level: slider with lavender track, mint thumb.
- Emoji Usage: 3 outlined pill radio buttons (None, Minimal, Frequent). Active = filled lavender.

Section 2 — "Knowledge Map" (מפת ידע): brain icon (sky blue).
- Topic cards (white, rounded-xl, faint border):
  - Topic name (bold) + expand chevron.
  - Key points (list), subtopics (nested), examples.
  - Outlined pill edit/delete buttons.
- "+ Add Topic" filled lavender pill.
- Domains: tag row of filled pastel pills (mint, sky blue, peach).

Section 3 — "Storytelling" (סיפור): book icon (pink).
- Storytelling Mode: soft toggle (lavender on, gray off).
- Slang Map: two-column editor — formal word → slang. Each row editable. "+ Add" pill.

Section 4 — "Greeting" (ברכה): hand-wave icon (soft yellow).
- Greeting textarea: cream background, soft lavender focus border, character count.
- Directives textarea: same style, larger.
- Suggested Questions: editable list with delete × pills, drag handles, "+ Add" pill.

Section 5 — "Bio" (ביוגרפיה): user icon (mint).
- Bio textarea. Interests tag input with autocomplete suggestions as outlined pills.

Each section header: pastel icon circle + bold title + item count pill badge (outlined) + expand chevron.

RESPONSIVE: Max-width 700px centered. Sections full-width on mobile.
```

---

## 9. אנליטיקס קופונים — Coupon Analytics

### Prompt:

```
Design a coupon analytics page for a Hebrew RTL influencer SaaS platform.

VIBE: Soft & Dreamy — performance-focused but warm. Cream background, white cards, pastel metric highlights. Like a friendly Shopify analytics view.

PAGE HEADER:
- Ticket icon (mint) + "אנליטיקס קופונים" (bold 24px).
- Subtitle: "ביצועי קופונים ומכירות" (medium gray).

OVERVIEW CARDS (6 cols desktop, 3 tablet, 2 mobile):
- 6 white cards, rounded-2xl, soft shadow:
  1. Total Coupons (lavender icon).
  2. Times Copied (sky blue icon).
  3. Times Used (mint icon).
  4. Revenue (peach icon, ₪ value bold).
  5. Conversion % (pink icon, small progress ring in pastel).
  6. Follower/Non-follower ratio (soft yellow icon).

COUPON TABLE (white card, rounded-2xl):
- Header row: very light lavender tinted background.
- Columns: קופון, מותג, הנחה, הועתק, משתמשים ייחודיים, קליקים, המרה%.
- Data rows:
  - Code in monospace inside outlined pill with status dot (mint=active, pink=expired).
  - Copy count with tiny pastel bar indicator.
  - Conversion with mini lavender progress bar.
- Sortable column headers with subtle arrow icons.
- Hover: very light cream row highlight.

TOP PRODUCTS:
- Trophy icon + "Top Products" header.
- White product cards: name, brand, stats. Top 3: soft yellow/gray/peach ranking pills.

BRAND BREAKDOWN:
- Collapsible sections per brand. Brand logo + name + revenue. Mini pastel bar chart.

RESPONSIVE: Cards responsive grid. Table horizontal-scrolls on mobile.
```

---

## 10. הגדרות — Settings Page

### Prompt:

```
Design a settings page for a Hebrew RTL influencer chatbot SaaS platform.

VIBE: Soft & Dreamy — clean customization page. Cream background, white section cards, pastel toggles and selectors. Like a cozy theme editor. Inviting, not overwhelming.

PAGE HEADER:
- Settings icon (warm gray) + "הגדרות" (bold 24px).

SECTION 1 — "Theme" (עיצוב): palette icon (lavender).
- Color Presets: 6 circles (50px each) showing gradient swatches:
  - Purple, Blue, Green, Pink, Orange, Light.
  - Selected: lavender ring border + small checkmark overlay.
- Font Selection: 2 outlined pill dropdowns side by side (Heading, Body). Font options preview in dropdown.
- Dark Mode: soft toggle switch (lavender dot when on, gray when off) + sun/moon icon.
- Logo Upload: 80×80 dashed-border area with camera icon.
- Hide Branding: soft toggle.

SECTION 2 — "Widget" (ווידג'ט): message icon (sky blue).
- Position: 2 visual radio cards (bottom-right / bottom-left) with mini phone mockup showing dot position.
- Placeholder: text input, soft lavender focus border.
- Greeting: textarea (4 rows), cream bg.
- Suggested Questions: editable list — each item is an outlined pill with text + × button + drag handle. "+ Add" filled lavender pill at bottom.

SECTION 3 — "Contact" (קישור): phone icon (mint).
- Phone: input with +972 prefix, soft border.
- WhatsApp toggle (mint when on).
- Instagram DM toggle:
  - Connected: mint "Connected" filled pill + @username.
  - Not connected: filled sky blue "Connect Instagram" pill.

SECTION 4 — "Scraping" (סריקה): download icon (peach).
- Post Type Toggles (2×2 grid): Photos, Videos, Reels, Carousels — soft toggles (lavender).
- Content Options (4 checkboxes): Captions, Hashtags, Comments, Location — soft pastel checkboxes.

SAVE BUTTON:
- Fixed bottom bar or floating: filled lavender pill "שמור הגדרות". During save: spinner. Success: mint "!נשמר" for 2 seconds.

RESPONSIVE: Max-width 700px centered. All sections stack on mobile.
```

---

## 11. שיתוף ו-QR — Share & QR Code Page

### Prompt:

```
Design a share and QR code page for a Hebrew RTL influencer chatbot SaaS platform.

VIBE: Soft & Dreamy — inviting and shareable. Cream background, white cards, pastel accents. Like a friendly link-in-bio tool.

PAGE HEADER:
- Share icon (mint) + "שתף את הבוט" (bold 24px).
- Subtitle: "שתף את הצ'אטבוט שלך עם העולם" (medium gray).

CARD 1 — "Direct Link" (קישור ישיר): link icon.
- White card, rounded-2xl. URL in read-only input (monospace, faint lavender border).
- Two pills: filled mint "Copy Link" (copy icon), outlined "Open" (external icon).

CARD 2 — "QR Code" (קוד QR): QR icon.
- White card. Large QR code (200×200px) centered — lavender modules on white.
- Color preset swatches (small pastel circles).
- Pills: filled lavender "Download PNG", outlined "Print".

CARD 3 — "Social Share" (שיתוף): share icon.
- White card. 3 circular buttons (56px each):
  - WhatsApp: soft mint circle, white icon.
  - Instagram: soft pink gradient circle, white icon.
  - Copy: soft gray circle, white icon.

CARD 4 — "Embed Widget" (הטמעה): code icon.
- White card. Code textarea (dark text on cream bg, monospace), outlined lavender pill "Copy Code".

RESPONSIVE: 2×2 grid desktop, stacked mobile. QR 160px on mobile.
```

---

## 12. תקשורת — Communications Page

### Prompt:

```
Design a communications management page for a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy — organized ticket system but warm. Cream background, white cards, pastel category badges.

PAGE HEADER:
- Mail icon (sky blue) + "תקשורת" (bold 24px).
- Filled sky blue pill "+ הודעה חדשה" on left (RTL).

FILTERS:
- Category pills (outlined, filled when active):
  - "הכל" (lavender), "פיננסי" (mint), "משפטי" (peach), "שיתופי פעולה" (sky blue), "כללי" (gray).
- Status pills: "הכל", "פתוח" (sky blue filled), "סגור" (gray filled).

STATS BAR: Small inline stats — numbers bold, labels gray.

COMMUNICATIONS LIST:
- White cards, rounded-2xl, soft shadow:
  - Category filled pastel pill.
  - Subject (bold) + brand name (gray).
  - Status pill: "Open" (sky blue) / "Closed" (gray).
  - Date (light gray), unread count (pink filled circle badge).
  - Preview text (1 line, light gray).
- Hover: subtle lift.

EMPTY STATE: Mail icon (sky blue, 48px), warm gray text.
RESPONSIVE: Cards full-width. Filter pills scroll horizontally.
```

---

## 13. ניהול תוכן — Content Management (Manage Page)

### Prompt:

```
Design a content management page with tabs for a Hebrew RTL influencer SaaS platform.

VIBE: Soft & Dreamy — CMS feeling but cozy. Cream background, white content cards, pastel type badges.

PAGE HEADER: Grid icon (lavender) + "ניהול תוכן" (bold 24px).

TABS (horizontal, pill style):
- 4 tabs: "מותגים" (building), "מוצרים" (bag), "תוכן" (file), "הגדרות" (settings).
- Active: filled lavender pill with soft underline. Inactive: outlined.

BRANDS TAB:
- Search input (rounded, lavender focus) + filled lavender "+ הוסף מותג" pill.
- Brand cards (white, rounded-2xl): logo, name, description, coupon code (monospace inside mint outlined pill), category tag (filled pastel pill), edit/delete outlined icon pills.
- Modal: white card overlay (rounded-2xl, soft shadow), form fields, filled lavender "Save" pill + outlined "Cancel" pill.

PRODUCTS TAB:
- Search + category filter pill dropdown.
- 3-col grid: white product cards with image, name, brand, category tag (pastel pill), price.

CONTENT TAB:
- Type filter pills at top (outlined, different pastel borders):
  - Recipe (peach), Look (pink), Tip (soft yellow), Workout (mint), Review (lavender), Tutorial (sky blue).
- Content cards: type filled pastel pill badge, title, description, edit/delete pills.
- Filled lavender "+ הוסף תוכן" pill.

SETTINGS TAB:
- Greeting textarea + suggested questions list + Save pill.

RESPONSIVE: Tabs scroll horizontally on mobile. Grid → 1 col.
```

---

## 14. תובנות קהל — Audience Insights

### Prompt:

```
Design an audience insights page for a Hebrew RTL influencer SaaS platform.

VIBE: Soft & Dreamy — data-rich but warm. Cream background, white chart cards, pastel chart colors.

PAGE HEADER: Users icon (mint) + "תובנות קהל" (bold 24px). Date range outlined pill.

OVERVIEW (4 cols, 2 mobile):
- White cards: Conversations (sky blue icon), Messages (mint), Coupon Copies (lavender), Support (peach).

CHARTS (2×2 grid):
1. Demographics: donut chart with pastel segments (lavender, mint, pink, sky blue). Center: total count. Legend below.
2. Engagement Metrics: white card with horizontal metric rows — icon + label + value + mini pastel progress bar.
3. Growth: line chart — new conversations (sky blue line + gradient), returning (mint line + gradient). Soft axis styling.
4. Top Content: table with type pill badge, title, views, engagement, clicks. Top 3 ranking pills (soft yellow, gray, peach).

RESPONSIVE: 2-col → stacked. Cards full-width.
```

---

# חלק ב׳ — מסכי אדמין וניהול ווידג'ט

---

## 15. אדמין דשבורד — Admin Dashboard

### Prompt:

```
Design an admin dashboard for a Hebrew RTL multi-tenant SaaS platform.

VIBE: Soft & Dreamy — warm cream background (#FFF7ED), white cards with gentle shadows, pastel accents. Professional control panel but warm and approachable. Pill-shaped components everywhere. Typography in warm dark gray (#4B5563), never pure black. Rounded corners (16-20px).

PAGE HEADER:
- Right side (RTL): Shield icon (lavender) + "פאנל ניהול" (bold 24px, warm dark gray).
- Left side (RTL): two action pills:
  1. Filled lavender pill "+ הוסף חשבון" with UserPlus icon.
  2. Outlined pill "אונבורדינג" with ClipboardCheck icon.
  3. Outlined pill "לוגואים" with Image icon.

TABS (below header):
- Two tab pills side by side:
  1. "חשבונות סושיאל" (Users icon) — filled lavender when active.
  2. "אתרים" (Globe icon) — outlined lavender border when inactive.
- Smooth transition between active states.

STATS ROW (below tabs, 3 columns):
- 3 white cards, rounded-2xl, soft shadow:
  1. "סה״כ חשבונות" — large bold number (warm dark gray), Users icon in lavender circle.
  2. "משפיענים פעילים" — number, activity icon in mint circle.
  3. "סה״כ עוקבים" — formatted number (e.g., "2.1M"), people icon in sky blue circle.
- Each card: icon circle (40px) top-right (RTL), large number below, small label in medium gray.

FILTER BAR (Social tab):
- Row of outlined filter pills:
  - "הכל" (filled lavender when active), "יוצרי תוכן", "מותגים".
- Search input on the left (RTL): white bg, rounded-2xl, soft lavender focus border, search icon, placeholder "...חיפוש חשבון".

ACCOUNT CARDS GRID (3 columns desktop, 2 tablet, 1 mobile):
- White cards, rounded-2xl, soft shadow:
  - Top: Avatar circle (48px, soft lavender border) + display name (bold) + @username (medium gray) below.
  - Middle row of mini stat pills (outlined, small):
    - Posts count (lavender outlined pill), Transcriptions (sky blue), Coupons (mint).
  - Status indicators row:
    - IG Connected: mint filled dot + "מחובר" / pink dot + "לא מחובר".
    - DM Bot: small soft toggle switch (lavender=on, gray=off) + label.
    - Account status: mint pill "פעיל" / gray pill "לא פעיל".
  - Bottom: action pills row (outlined, icon-only, 32px each):
    - Chat (MessageCircle, sky blue border), View (Eye, lavender), Manage (Settings, peach), Persona (User, mint).
  - Hover: subtle lift (translateY -2px) + shadow-md transition.

WEBSITES TAB (when active):
- Same stats row but: "סה״כ אתרים", "דפים נסרקים", "RAG Chunks".
- Website cards grid:
  - Domain name (bold, monospace) + display name (gray).
  - Primary color dot (16px circle showing brand color).
  - Stats: pages count, chunks count (outlined pills).
  - Token field: masked "•••••" with outlined "Copy" pill (mint).
  - Action pills: Preview (Eye), Settings (Settings), filled lavender "Generate Token" pill.

FAB (bottom-left): filled lavender circle (56px) with "+" icon, soft shadow-lg.

EMPTY STATE (if no accounts): Large Users icon (lavender, 64px), "אין חשבונות עדיין" warm gray text, filled lavender "+ הוסף חשבון ראשון" pill below.

RESPONSIVE: 3-col → 2-col → 1-col grid. Stats stack on mobile. Filter pills scroll horizontally.
ANIMATIONS: Cards staggered fade-in + slide-up on load.
```

---

## 16. רשימת משפיענים — Influencers List

### Prompt:

```
Design a detailed influencers list page for a Hebrew RTL admin panel of a SaaS platform.

VIBE: Soft & Dreamy — organized spreadsheet feeling but warm and cozy. Cream background (#FFF7ED), white cards, pastel badges and status indicators. Like a friendly CRM. Rounded corners, soft shadows, warm typography.

PAGE HEADER:
- Right (RTL): Users icon (lavender) + "משפיענים" (bold 24px, warm dark gray).
- Left (RTL): outlined pill "חזרה לדשבורד" with arrow icon.

SEARCH BAR:
- Full-width white card, rounded-2xl, soft shadow:
  - Search input: search icon (right, RTL), soft lavender focus border, placeholder "...חיפוש לפי שם או שם משתמש".

INFLUENCER LIST (vertical card list, full width):
- Each influencer is a white card, rounded-2xl, soft shadow, with horizontal layout:

  RIGHT SIDE (RTL):
  - Avatar (48px circle, soft lavender border).
  - Name column: display name (bold, warm dark gray) + @username below (medium gray).
  - Category badge: filled pastel pill — "lifestyle" (lavender), "parenting" (mint), "food" (peach), "fashion" (pink), "beauty" (soft yellow). Small text.

  CENTER:
  - Stats row — 3 mini outlined pills side by side:
    - "XX פוסטים" (lavender border).
    - "XX תמלולים" (sky blue border).
    - "XX קופונים" (mint border).

  LEFT SIDE (RTL):
  - IG Status indicator:
    - Connected: mint filled pill with check icon + "מחובר".
    - Expired: peach filled pill with alert icon + "פג תוקף".
    - Disconnected: pink filled pill with X icon + "לא מחובר".
  - Action pills row (outlined, icon-only, compact):
    - Chat (MessageCircle, sky blue) — opens chat page.
    - Copy IG Link (Link, mint) — copies OAuth connect URL.
    - Persona (User, lavender) — opens persona editor.
    - Details (ChevronLeft) — navigates to detail page.

- Hover: card lifts slightly + shadow-md.
- Divider: none — use gap-3 between cards.

EMPTY STATE: Users icon (lavender, 64px), "אין משפיענים במערכת" + filled lavender "הוסף משפיען" pill.

RESPONSIVE: Cards full-width always. Action pills collapse to 3-dot overflow menu on mobile. Stats pills stack vertically on small screens.
ANIMATIONS: Staggered fade-in on load.
```

---

## 17. דף פרטי משפיען — Influencer Detail Page

### Prompt:

```
Design a comprehensive influencer account management page for a Hebrew RTL admin SaaS panel.

VIBE: Soft & Dreamy — detailed admin view but warm. Cream background (#FFF7ED), white section cards, pastel status indicators and action buttons. Like a cozy account dashboard. Rounded corners (16-20px), soft shadows.

PAGE HEADER:
- Outlined pill back button: arrow + "חזרה לרשימה".
- Avatar (56px, lavender border) + display name (bold 24px) + @username (medium gray) + verification badge (sky blue check if verified).
- Right side action pills:
  - Filled lavender "בנה פרסונה מחדש" pill with RefreshCw icon.
  - Outlined "צפה בצ'אט" pill with MessageCircle icon.
  - Outlined "עריכת פרסונה" pill with User icon.

PROFILE CARD (top, full width):
- White card, rounded-2xl, soft shadow.
- Two columns inside:
  LEFT (RTL): Bio text (warm dark gray), category badge (pastel pill), plan badge (outlined pill).
  RIGHT (RTL): Key stats in 2×3 mini grid:
    - Posts (lavender bg circle icon), Transcriptions (sky blue), Coupons (mint), Partnerships (peach), Documents (pink), Websites (soft yellow).
    - Each: icon circle (32px) + bold number + small label.

IG CONNECTION STATUS (white card, rounded-2xl):
- Status display:
  - Connected: mint left border (3px), mint filled pill "מחובר" + token expiry date in gray.
  - Expired: peach left border, peach pill "פג תוקף" + filled sky blue "רענן חיבור" pill.
  - Disconnected: pink left border, pink pill "לא מחובר" + filled lavender "חבר אינסטגרם" pill with copy link action.
- DM Bot Toggle: large soft toggle switch (lavender when on, gray off) + label "בוט DM" + status text.

DOCUMENTS SECTION (white card, rounded-2xl):
- Header: FileText icon (sky blue) + "מסמכים" + document count outlined pill.
- Upload zone: dashed lavender border area, cloud icon, "גרור קובץ לכאן" text. On drag: solid border + lavender tint.
- Document list (inside card):
  - Each row: FileText icon (32px, lavender circle bg) + filename (bold, truncated) + file size (gray) + upload date (gray).
  - Status pill on left (RTL):
    - Parsed: mint pill + confidence percentage + AI model name (tiny gray text, e.g., "Gemini Flash").
    - Processing: sky blue pill with spinner + "...מעבד".
    - Failed: pink pill with X.
  - Delete: small outlined pink pill with Trash icon (appears on hover).

PERSONA SECTION (white card, rounded-2xl):
- Header: User icon (mint) + "פרסונה".
- Display fields (read-only style):
  - Tone: pastel pill showing current tone.
  - Language: outlined pill.
  - Response Style: text snippet in gray.
  - Greeting: text in italic, cream background box.
- "עריכת פרסונה" outlined lavender pill link.

CHAT CONFIG SECTION (white card, rounded-2xl):
- Header: Settings icon (peach) + "הגדרות צ'אט".
- Config rows: label + value pairs in clean layout.

ACTIONS FOOTER:
- Row of action pills:
  - Filled lavender "סריקה מלאה" pill (triggers full Instagram scan).
  - Outlined sky blue "Re-embed RAG" pill.
  - Outlined pink "מחק חשבון" pill (danger action — on click shows confirmation).

RESPONSIVE: Two-column profile → stacked on mobile. Document list full-width. Actions pills wrap.
ANIMATIONS: Sections fade in staggered.
```

---

## 18. הוספת חשבון — Add Account (2-Step Wizard)

### Prompt:

```
Design a 2-step account creation wizard for a Hebrew RTL admin panel.

VIBE: Soft & Dreamy — minimal, focused, friendly. Cream background (#FFF7ED), centered white form card. Gentle step transitions.

LAYOUT: Max-width 500px, centered vertically and horizontally.
- Top-right (RTL): outlined pill "חזרה לדשבורד" with arrow icon.

STEP 1 — INPUT:
- White card, rounded-2xl, soft shadow.
- UserPlus icon (48px, lavender) centered at top.
- Title: "הוספת חשבון חדש" (bold 20px, warm dark gray, centered).
- Fields:
  1. "שם משתמש באינסטגרם" — input with @ prefix icon (right, RTL), soft lavender focus border, placeholder "username".
  2. "שם תצוגה" — optional, same input style, helper text "(אופציונלי)" in gray.
- Filled lavender pill "צור חשבון" (full width). On click: shows spinner inside pill.

STEP 2 — SUCCESS RESULT:
- Same white card, smooth crossfade transition from Step 1.
- Mint left border (3px) on card.
- Large checkmark icon (mint circle, 48px) centered.
- "!החשבון נוצר בהצלחה" (bold, warm dark gray, centered).
- Info rows below:
  - "Account ID:" + value in monospace + outlined mint "Copy" pill (inline).
  - "קישור חיבור IG:" + truncated URL + outlined mint "Copy" pill.
- Two action pills at bottom:
  - Filled lavender "צפה בחשבון" pill → navigates to detail page.
  - Outlined "הוסף חשבון נוסף" pill → resets to Step 1.

ERROR STATE:
- Same card but with pink left border (3px).
- X icon in pink circle (48px) centered.
- Error text in warm dark gray.
- Outlined pink "נסה שוב" pill.

RESPONSIVE: Card full-width on mobile with padding. Same centered layout.
ANIMATIONS: Card fade-in on load. Smooth crossfade between steps. Copy pill → mint check animation.
```

---

## 19. אונבורדינג — Onboarding Checklist

### Prompt:

```
Design an onboarding checklist management page for a Hebrew RTL admin SaaS panel.

VIBE: Soft & Dreamy — project management but cozy and friendly. Cream background (#FFF7ED), white cards, pastel progress indicators. Like a warm Trello board. Rounded corners, soft shadows.

PAGE HEADER:
- ClipboardCheck icon (lavender) + "אונבורדינג לקוחות" (bold 24px).
- Outlined pill "חזרה" with arrow.
- Filled lavender pill "+ צ'קליסט חדש".

CHECKLIST CARDS (vertical list or grid):
- White cards, rounded-2xl, soft shadow:
  - Brand name (bold) + account username (gray).
  - Progress bar: soft rounded bar, lavender gradient fill showing completion %. Percentage text on right.
  - Task summary: "X/Y משימות הושלמו" in medium gray.
  - Date created (small gray).
  - Status pill: "בתהליך" (sky blue), "הושלם" (mint), "ממתין" (peach).
  - Action pills: "פתח" (filled lavender), "שלח" (outlined sky blue with Share icon).
  - Hover: subtle lift.

EXPANDED CHECKLIST VIEW (when clicking a checklist):
- Full-width white card, rounded-2xl.
- Header: brand name + progress bar + progress percentage.

SECTIONS (6 collapsible accordion sections):
Each section header: pastel icon circle + section title + completion count pill (e.g., "3/5") + expand chevron.

Section A — "נכסים דיגיטליים" (Layers icon, lavender).
Section B — "סריקות" (Download icon, sky blue).
Section C — "הגדרת פרסונה" (User icon, mint).
Section D — "הגדרות ווידג'ט" (MessageCircle icon, peach).
Section E — "בדיקות" (CheckCircle icon, pink).
Section F — "אישור סופי" (Flag icon, soft yellow).

TASK ROWS (inside each section):
- Each task: checkbox (soft pastel — lavender when checked, gray outline when unchecked) + task description text.
- Completed tasks: strikethrough text + mint checkmark + small "הושלם ע״י [name] • [date]" in tiny gray.
- Some tasks include: CLI command in monospace code block (cream bg, lavender border), or a link pill.
- Hover: very subtle cream highlight.

NOTES FIELD (bottom of checklist):
- Textarea with cream background, soft lavender focus border, placeholder "...הערות".

SEND OPTIONS (bottom row):
- Three outlined pills: "שלח במייל" (Mail icon), "שלח בוואטסאפ" (Phone icon, mint), "העתק סיכום" (Copy icon).

CREATE NEW CHECKLIST MODAL:
- White card overlay, rounded-2xl, soft shadow.
- Brand/account selector dropdown (outlined pill style).
- "האם צריך ווידג'ט?" toggle (lavender).
- Filled lavender "צור צ'קליסט" + outlined "ביטול" pills.

RESPONSIVE: Checklist cards full-width on mobile. Sections stack. Send pills wrap.
ANIMATIONS: Accordion smooth expand/collapse. Checkbox fill animation. Progress bar smooth fill.
```

---

## 20. ניהול לוגואים — Brand Logos Management

### Prompt:

```
Design a brand logos management page for a Hebrew RTL admin SaaS panel.

VIBE: Soft & Dreamy — visual media manager but cozy. Cream background (#FFF7ED), white cards with image previews, pastel action buttons.

PAGE HEADER:
- Image icon (pink) + "ניהול לוגואים" (bold 24px).
- Outlined pill "חזרה" with arrow.

FILTER & SEARCH:
- Search input: white bg, rounded-2xl, soft lavender focus border, placeholder "...חיפוש מותג".
- Filter pills row: "הכל" (filled lavender when active), "עם לוגו" (outlined mint border), "בלי לוגו" (outlined peach border).

BRAND CARDS GRID (3 columns desktop, 2 tablet, 1 mobile):
- White cards, rounded-2xl, soft shadow:
  - Logo preview area (120x120px, centered):
    - With logo: image displayed, rounded-xl, soft border.
    - Without logo: dashed lavender border square, camera icon (gray, 32px), text "אין לוגו".
  - Brand name (bold, centered below image).
  - Partnership count: outlined pill "X שיתופי פעולה" (small, gray).
  - Contact info: WhatsApp (mint icon + number), Email (sky blue icon + address), or "לא הוגדר" in gray.
  - Action pills row:
    - "העלה לוגו" / "החלף לוגו": filled lavender pill with Upload icon.
    - "ערוך פרטים": outlined sky blue pill with Edit icon.
    - "מחק לוגו" (if exists): outlined pink pill with Trash icon.
  - Hover: subtle lift + shadow-md.

UPLOAD FLOW (on click):
- Drag-drop zone: dashed lavender border, cream bg, cloud icon, "גרור תמונה לכאן".
- Formats: "PNG, JPG, SVG — max 5MB" in small gray.
- Progress: lavender gradient bar. Success: mint toast "!הלוגו הועלה בהצלחה".

EDIT CONTACT MODAL:
- White card overlay, rounded-2xl. WhatsApp input (+972), Email input.
- Filled lavender "שמור" + outlined "ביטול" pills.

RESPONSIVE: 3-col → 2-col → 1-col. Logo previews scale down on mobile.
ANIMATIONS: Cards staggered fade-in. Upload progress smooth fill.
```

---

## 21. עורך פרסונה (אדמין) — Admin Chatbot Persona Editor

### Prompt:

```
Design a chatbot persona configuration editor for a Hebrew RTL admin SaaS panel.

VIBE: Soft & Dreamy — creative character customizer, warm and cozy. Cream background (#FFF7ED), white expandable section cards, pastel accents on inputs, toggles, and tags.

PAGE HEADER:
- Outlined pill "חזרה" with arrow (right, RTL).
- Bot icon (lavender) + "עריכת פרסונה" (bold 24px).
- Account name + @username below in medium gray.
- Left side (RTL): filled lavender pill "שמור" with Save icon. On success: changes to mint pill "!נשמר" with checkmark for 2 seconds.

FORM LAYOUT (max-width 700px, centered):
- All sections are white cards, rounded-2xl, soft shadow.
- Inputs: cream background (#FFF7ED), rounded-xl, soft lavender focus border.
- Labels: warm dark gray, small, right-aligned (RTL).

SECTION 1 — "פרטים בסיסיים" (User icon, lavender circle):
- Name: text input. Instagram Username: input with @ prefix. Bio: textarea (4 rows), character count.
- Interests: tag input — tags as filled pastel pills (rotating colors: lavender, mint, sky blue, peach) with × button.

SECTION 2 — "קול וסגנון" (Mic icon, peach circle):
- Tone: 5 outlined pill radio buttons — "ידידותי", "מקצועי", "קז'ואלי", "פורמלי", "נלהב". Active = filled lavender.
- Language: outlined pill dropdown. Response Style: textarea. Emoji Usage: 4 pill radios.

SECTION 3 — "ברכה והנחיות" (MessageCircle icon, mint circle):
- Greeting Message: textarea (4 rows). Directives: textarea (6 rows). Helper text: "הנחיות אלו מגדירות את ההתנהגות הבסיסית של הבוט".

SECTION 4 — "שאלות מוצעות" (HelpCircle icon, sky blue circle):
- Editable list: outlined pill per question + × button + drag handle. "+ הוסף שאלה" filled lavender pill.

SAVE STATES: Saving → spinner. Success → mint + checkmark. Error → pink toast.

RESPONSIVE: Max-width 700px centered. All fields full-width. Tone pills wrap on mobile.
ANIMATIONS: Sections fade-in. Save transitions smooth. Tag add/remove animated.
```

---

## 22. הוספת אתר — Add Website (5-Step Wizard)

### Prompt:

```
Design a 5-step website onboarding wizard for a Hebrew RTL admin SaaS panel.

VIBE: Soft & Dreamy — guided setup flow, warm and encouraging. Cream background (#FFF7ED), centered white wizard card, pastel step indicators. Like a friendly installation wizard.

LAYOUT: Max-width 600px, centered.
- Top: outlined pill "חזרה" with arrow.

STEP INDICATOR (top of card):
- 5 circles connected by lines:
  - Completed: mint filled circle with checkmark.
  - Current: lavender filled circle with number.
  - Upcoming: outlined gray circle with number.
  - Connecting lines: mint (completed), gray (upcoming).
- Labels below: "כתובת", "סריקה", "עיבוד", "הגדרות", "סיום".

STEP 1 — "כתובת האתר" (Globe icon, lavender):
- White card. Globe icon (48px) centered. URL input (monospace, lavender focus border). Valid: mint border + checkmark. Invalid: pink border + X.
- Filled lavender pill "התחל סריקה" (full width).

STEP 2 — "סריקה" (Download icon, sky blue):
- Circular progress ring (80px, lavender fill, percentage centered). Status text. Horizontal progress bar (lavender, animated stripe). Page counter. Warning note (peach text).

STEP 3 — "עיבוד" (Database icon, mint):
- RAG indexing progress bar (mint gradient). Chunk counter. Status spinner. Success: mint checkmark + summary.

STEP 4 — "הגדרות ווידג'ט" (Paintbrush icon, peach):
- Color Picker: 6 preset circles (40px) + custom input. Selected: lavender ring + checkmark.
- Welcome Message textarea. Widget Preview: mini phone mockup (200px) showing chat bubble in selected color.
- Filled lavender "שמור הגדרות" pill.

STEP 5 — "סיום" (CheckCircle icon, mint):
- Large mint checkmark (64px). "!האתר נוסף בהצלחה". Summary stats. Embed code block (monospace, cream bg) + "Copy Code" pill. Management link + "Copy Link" pill.
- Two pills: filled lavender "צפה בתצוגה מקדימה", outlined "חזרה לדשבורד".

RESPONSIVE: Card full-width on mobile. Preview below form. Stepper labels hidden on small screens.
ANIMATIONS: Step transitions crossfade. Progress fills gently. Success checkmark bounce.
```

---

## 23. תצוגה מקדימה — Website Widget Preview

### Prompt:

```
Design a website widget preview page for a Hebrew RTL admin SaaS panel.

VIBE: Soft & Dreamy — clean preview environment with controls. Cream background (#FFF7ED), white toolbar, live preview area.

TOP TOOLBAR (white bar, soft bottom shadow, 60px):
- Right (RTL): outlined pill "חזרה" + brand name (bold) + domain (gray monospace).
- Left (RTL): outlined pill "העתק קוד הטמעה" (Code icon), outlined pill "פתח אתר" (ExternalLink icon).
- Device toggle: two outlined icon pills — Desktop (monitor) / Mobile (smartphone). Active = filled lavender.

PREVIEW AREA (full remaining height):
- Desktop: centered iframe (max-width 1200px, rounded-2xl, soft shadow) with embedded widget.
- Mobile: phone frame (375×667px, centered, rounded-3xl, soft shadow).
- Widget bubble visible at bottom-right in brand color.
- Error state: Globe icon (64px, gray), "לא ניתן לטעון" + "נסה שוב" outlined pill.

WIDGET INFO PANEL (collapsible, slides from left RTL):
- White card: brand name, domain, color swatch + hex, welcome message, account ID, script tag code block.

RESPONSIVE: Full width on mobile. Toolbar pills → icons only. Info panel → bottom sheet.
```

---

## 24. הגדרות ווידג'ט ודומיין — Widget Settings & Domain Management

### Prompt:

```
Design a widget configuration and domain settings page for a Hebrew RTL admin SaaS panel.

VIBE: Soft & Dreamy — settings/customization page but warm and inviting. Cream background (#FFF7ED), white section cards, pastel toggles and color selectors. Like a cozy theme editor.

PAGE HEADER:
- Settings icon (peach) + "הגדרות ווידג'ט ודומיין" (bold 24px).
- Subtitle: "התאם את הווידג'ט והגדרות הדומיין" (medium gray).
- Account pill (outlined, lavender) showing which account.
- Left (RTL): filled lavender pill "שמור שינויים".

SECTION 1 — "דומיין" (Globe icon, sky blue circle):
- White card, rounded-2xl. Domain URL (read-only monospace). Account ID (monospace + "Copy" mint pill). Status toggle (mint=active). Management Token (masked + "Copy" pill + "צור טוקן חדש" lavender pill). Last Scan Date + "סרוק מחדש" sky blue pill.
- Stats row: 3 mini cards — Pages (lavender icon), RAG Chunks (mint), Last Update (gray).

SECTION 2 — "עיצוב הווידג'ט" (Paintbrush icon, lavender circle):
- Primary Color: 8 preset circles (40px): Purple, Blue, Green, Pink, Orange, Teal, Red, Indigo. Selected: lavender ring + checkmark. Last circle: "+" with color picker.
- Font: outlined pill dropdown. Dark Mode: soft toggle + sun/moon. Widget Position: 2 visual radio cards with mini phone mockup showing position. Selected: lavender border.

SECTION 3 — "תוכן הווידג'ט" (MessageCircle icon, mint circle):
- Brand Name input. Logo: 80×80 upload area (dashed lavender) + "החלף"/"מחק" pills. Welcome Message textarea. Suggested Questions: editable pill list + "+ הוסף שאלה".

SECTION 4 — "קוד הטמעה" (Code icon, peach circle):
- Script tag code block (monospace, cream bg). "העתק קוד" lavender pill. Instructions text. "בדוק הטמעה" outlined pill.

SECTION 5 — "סריקה ואינדוקס" (Database icon, sky blue circle):
- Max Pages input. Content Types checkboxes (lavender). Action pills: "סרוק מחדש" (sky blue), "Re-embed RAG" (lavender), "נקה Cache" (peach). Last scan stats.

LIVE PREVIEW (fixed sidebar on desktop, 300px):
- Mini phone frame (280×480px) with widget preview. Updates in real-time as settings change.

SAVE: Saving → spinner. Success → mint + subtle animation. Error → pink toast.

RESPONSIVE: Preview → top on mobile. Sections full-width. Color circles wrap 2 rows.
ANIMATIONS: Live preview smooth transitions. Toggle animations gentle. Sections staggered fade-in.
```

---

# חלק ג׳ — מסכי חוקים, ניסויים ומסכים נוספים

---

## 25. חוקים — Admin Rules Engine

### Prompt:

```
Design a rules engine page for a Hebrew RTL SaaS admin panel.

VIBE: Soft & Dreamy — technical but warm. Cream background, white cards, pastel category coding. Like a friendly policy editor.

PAGE HEADER: Shield icon (sky blue) + "מנוע חוקים" (bold 24px). Filled sky blue pill "+ חוק חדש".

TWO-COLUMN (60/40 desktop):

LEFT — RULES LIST:
- Rule cards (white, rounded-2xl):
  - Name (bold) + description (gray).
  - Category filled pastel pill: Routing=sky blue, Escalation=peach, Security=pink, Cost=mint, Personalization=lavender.
  - Priority: small outlined circle pill with number.
  - Toggle: soft switch (lavender on, gray off).
  - Edit/delete outlined icon pills.
  - Selected: lavender left border (3px).

RIGHT — RULE DETAIL:
- White card. Editable: name, description, category dropdown (outlined pill), priority input.
- Conditions: field dropdown + operator dropdown + value input. "+ Add" lavender pill.
- Actions: type + target + value. "+ Add" pill.
- Filled lavender "Save" + outlined "Cancel" pills.

RULE TESTER (bottom, full width):
- White card. Flask icon + "בדיקת חוק".
- 3 inputs: Message text, Intent outlined pill dropdown, Confidence slider (lavender track).
- Filled sky blue "Run Test" pill.
- Result: Matched = mint filled pill "Yes" / pink pill "No". Conditions table. Actions list.

RESPONSIVE: Columns stack on mobile.
```

---

## 26. ניסויים A/B — Admin Experiments

### Prompt:

```
Design an A/B experiment page for a Hebrew RTL SaaS admin panel.

VIBE: Soft & Dreamy — scientific but friendly. Cream background, white cards, pastel data visualization.

PAGE HEADER: Flask icon (lavender) + "ניסויים A/B" (bold 24px). Filled lavender pill "+ ניסוי חדש".

TWO-COLUMN (40/60):

LEFT — EXPERIMENTS LIST:
- Experiment cards (white, rounded-2xl):
  - Key (monospace, small), name (bold), description (gray).
  - Status: mint dot = enabled, gray dot = disabled.
  - Date range, variant count pill.
  - Selected: lavender left border.

RIGHT — RESULTS:
- Header: experiment name + total exposures + status pill.
- Variants table (white card):
  - Columns: Variant, Weight%, Exposures, Conversions...
  - Best: mint row highlight + small crown icon.
  - Worst: very faint pink tint.
  - Mini pastel horizontal bars in cells.

CREATE MODAL (white card overlay, rounded-2xl):
- Fields: key, name, description (textarea), allocation slider (lavender track), target mode (outlined pill dropdown).
- Variants: name + weight + overrides per row. "+ Add Variant" outlined pill. Weight sum warning (peach text if ≠ 100%).
- Filled lavender "Create" + outlined "Cancel" pills.

RESPONSIVE: Columns stack on mobile.
```

---

## 27. תוכן בוט — Bot Content Editor (Influencer)

### Prompt:

```
Design a bot knowledge base editor for a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy — CMS-like but cozy. Cream background, white accordion sections, pastel badges.

PAGE HEADER: Brain icon (lavender) + "תוכן הבוט" (bold 24px). Subtitle: "נהל את בסיס הידע של הצ'אטבוט".

ACCORDION SECTIONS (white cards, rounded-2xl, soft shadow):

1. "Core Topics" (BookOpen icon, lavender): topic cards with expand chevron, key points, subtopics, examples. Edit/delete outlined pills. "+ Add" lavender pill. Item count outlined pill on header.

2. "Coupons" (Ticket icon, mint): code in monospace inside dashed outlined pill, brand, discount, active toggle (soft switch), copy count.

3. "Partnerships" (Handshake icon, peach): brand, status filled pastel pill, amount, dates.

4. "Instagram Content" (Instagram icon, pink): summary stats text, last scan date, filled sky blue "Rescan" pill.

5. "Knowledge Base" (Database icon, sky blue): stats (documents, chunks, last update), outlined pill link to documents page.

RESPONSIVE: Max-width 700px centered. Full-width sections.
```

---

## 28. כניסת משפיענים — Influencer Login

### Prompt:

```
Design a login page for influencers in a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy — welcoming portal. Warm cream background with very subtle soft gradient (cream to light lavender). Centered white card. Feels like opening a cozy app.

BACKGROUND: Warm cream (#FFF7ED) with very subtle circular gradient — center slightly lighter, edges slightly warmer/pinker.

LOGIN CARD (white, rounded-2xl, soft shadow, max-width 400px, centered):
- Logo/icon (64px, lavender) centered at top.
- "כניסה" (bold 24px, centered).
- "@username — Bot Dashboard" (medium gray).
- Email input: mail icon (right, RTL), soft lavender focus border, placeholder "your@email.com".
- Password input: lock icon, eye toggle, placeholder dots.
- Filled lavender pill "כניסה" (full width). Spinner during auth.
- Error: soft pink tinted message bar below button + gentle card shake.
- Success: mint checkmark animation before redirect.
- Links: "שכחתי סיסמה" + "צור קשר" in small medium gray text.

RESPONSIVE: Same centered layout on all sizes.
```

---

## 29. כניסת אדמין — Admin Login

### Prompt:

```
Design a minimal admin login page for a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy but slightly more serious. Very light gray background (#F9FAFB) instead of cream. Clean and minimal.

LOGIN CARD (white, rounded-2xl, soft shadow, max-width 380px, centered):
- Shield icon (48px, lavender) centered.
- "פאנל ניהול" (bold).
- "הזן סיסמה כדי להיכנס" (medium gray).
- Password input only: lock icon, eye toggle, soft lavender focus border.
- Filled lavender pill "כניסה" (full width).
- Error: soft pink "סיסמה שגויה" text + gentle card shake.
```

---

## 30. מודאל סריקת אינסטגרם — Scraping Progress Modal

### Prompt:

```
Design a modal showing Instagram scraping progress for a Hebrew RTL SaaS platform.

VIBE: Soft & Dreamy — process monitor but friendly. Not stressful. White modal, pastel progress indicators.

MODAL:
- Semi-transparent warm cream backdrop.
- White card modal (max-width 500px, rounded-2xl, soft shadow). No close during scan.

CONTENT:
- Instagram icon (gradient pink-lavender) + "סריקת אינסטגרם".
- "@username" in lavender text.

Progress:
- Circular ring (80px) — lavender gradient fill showing percentage. Number centered.
- Below: horizontal progress bar (lavender gradient fill, rounded ends, animated soft stripe).

Stages (vertical stepper):
- Each stage row:
  - Completed: mint filled circle with checkmark.
  - In Progress: lavender spinning circle.
  - Pending: outlined gray circle.
  - Failed: pink X circle.
- Stage name (warm gray bold) + detail text (small gray).
- Connecting vertical line: mint for completed sections, gray for pending.

- Estimated time: "זמן משוער: ~3 דקות" (light gray).

Buttons (by state):
- During: outlined pink pill "ביטול".
- Done: filled mint pill "סגור" + filled lavender pill "צפה בתוצאות".
- Error: filled peach pill "נסה שוב" + outlined "סגור".

ANIMATIONS: stages transition smoothly, ring fills gently, spinner rotates.
```

---

## טיפים לשימוש ב-Google Stitch

1. **התחל מהפרומפט כפי שהוא** — Stitch יפיק מסך ראשוני. אל תשנה הכל בבת אחת.

2. **שכלל בצעדים קטנים:**
   - "Make the cards softer with more rounded corners"
   - "Use warmer cream background instead of pure white"
   - "Make all buttons pill-shaped with pastel fills"

3. **מילות מפתח שעובדות טוב עם הסגנון הזה:** "soft shadow", "pastel", "cream background", "pill button", "rounded-2xl", "warm gray text", "gentle", "cozy", "friendly".

4. **ציין RTL במפורש** — תמיד "Hebrew RTL" כדי שה-layout יהיה נכון.

5. **נעל את התמה** — אחרי שיש מסך שאתה אוהב: "Apply this exact Soft & Dreamy theme to all screens — warm cream background, white rounded cards, pastel pill buttons, soft shadows, warm gray typography".

6. **קשר מסכים** — בחר מספר מסכים ו-Stitch ייצור פרוטוטייפ עם מעברים.

7. **Experimental Mode** — השתמש ב-Gemini 2.5 Pro לתוצאות טובות יותר.
