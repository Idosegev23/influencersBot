# Google Stitch Prompt — "Discover" Feature Redesign (Mobile-First Prototype)

## Context
Design a mobile-first interactive "Discover" tab for an influencer chatbot platform. This is a curated content discovery experience — the influencer's personal "collection" of their top 5 Instagram posts/reels. Think of it as a personal editorial showcase, not a feed.

The platform is in Hebrew (RTL direction), targets Instagram followers, and lives inside a chat interface as one of several tabs (Chat, Discover, Coupons, Support).

## Current Design Language
- Background: `#f4f5f7` (light warm gray)
- Primary text: `#0c1013` (near-black)
- Secondary text: `#676767` (medium gray)
- Active tab accent: `#7c3aed` (purple) with `rgba(168, 85, 247, 0.12)` background
- Gold accent: `#e5a00d` (used for sparkle icons)
- Cards: white background, `1px solid #e5e5ea` border, `20px` border-radius
- Category colors: Red `#FF6B6B`, Pink `#E84393`, Blue `#0984E3`, Green `#00B894`, Orange `#F39C12`, Purple `#6C5CE7`
- Font: Heebo (Hebrew), clean and modern
- Overall feel: Light, clean, minimal — not dark/luxury

## What to Design

### Screen 1: Discover Tab — Main View
A vertical scrollable view with horizontal card rows. Each row is a category (e.g., "Most Viral Videos", "Most Liked Posts").

**Layout:**
- Top: Section header with sparkle icon ✨ + "גלו תוכן" (Discover Content) in bold 22px + subtitle "הבחירות של {influencer name}" in 13px gray
- Below: Multiple horizontal scrolling card rows, each with:
  - Row title (16px bold, right-aligned RTL) + subtitle (12px gray)
  - Horizontally scrolling cards (140×240px, 9:16 portrait ratio)

**Card Design:**
- Full-bleed thumbnail image as background
- Dark gradient overlay from bottom (for text readability)
- Rank badge: small colored circle (28px) in top-right corner with number
- Play icon: if it's a video/reel, small semi-transparent circle in top-left
- Bottom overlay: AI-generated title (13px bold white, max 2 lines) + metric pill (views/likes count)
- Hover state: slight scale up (1.03) with shadow
- Tap state: slight scale down (0.98)

### Screen 2: Content Modal (Post Detail)
Opens when a user taps on any card. This is the main new component.

**Layout:**
- Full-screen modal overlay with dark backdrop blur
- Content area:
  - If video/reel: Video player (starts muted, with sound toggle button)
  - If image: Full-width image with aspect ratio preserved
  - Below media: AI title (18px bold) + AI summary paragraph (14px, gray)
  - Two action buttons at bottom:
    - Primary: "שוחח על זה עם ה-AI" (Chat about this with AI) — purple filled button, opens chat with context
    - Secondary: "לפוסט באינסטגרם" (Go to Instagram post) — outlined button, opens Instagram
- Close: X button in top-right corner
- Swipe down to dismiss (mobile gesture)

### Screen 3: Lead Magnet Popup
Appears after the user has viewed 2-3 items. Semi-transparent overlay.

**Layout:**
- Card centered on screen with blur background
- Header: "רוצה גישה לקולקשיין הפרטי?" (Want access to the private collection?)
- Subtitle: "תוכן בלעדי שלא תמצאו באינסטגרם" (Exclusive content you won't find on Instagram)
- Form: Name input + Email input
- CTA button: "קבלו גישה" (Get Access) — purple filled
- Small close X in corner
- Design should feel premium but not pushy

### Screen 4: Private Collection Preview (Optional)
Items 6-10 appear after the main 5, but blurred with a lock icon.

**Layout:**
- Same card grid as main view
- Cards have heavy gaussian blur over the thumbnail
- Lock icon centered on each blurred card
- Small label: "תוכן בלעדי" (Exclusive Content)
- Tapping shows the lead magnet popup

## User Flow Diagram
```
Enter Discover Tab
    ↓
See 5 curated cards in horizontal scroll rows
    ↓
Tap a card
    ↓
Modal opens: video plays (muted) or image displays
    ├── Tap "Chat about this" → Switch to Chat tab with context message
    └── Tap "Go to Instagram" → Open Instagram in new tab
    ↓
Close modal → Return to Discover (scroll position preserved)
    ↓
After viewing 2-3 items → Lead magnet popup appears
    └── Submit email → Unlock private collection items (6-10)
```

## Design Requirements
- **Mobile-first**: Design for 375px width (iPhone), then show how it scales to tablet/desktop
- **RTL direction**: All text and layouts are right-to-left (Hebrew)
- **Consistent with existing design**: Use the color palette above, don't introduce new colors
- **Animations**: Cards should have subtle hover/tap animations. Modal should animate in with a smooth scale+fade. Scroll should feel fluid and snappy.
- **Accessibility**: All interactive elements need clear tap targets (min 44px), good contrast ratios
- **Performance feel**: The prototype should feel fast and responsive — no heavy page loads

## Screens to Deliver
1. Discover Tab — main view with card rows (populated with placeholder food/lifestyle content)
2. Content Modal — video/image detail view with action buttons
3. Lead Magnet Popup — email capture overlay
4. Private Collection — blurred locked cards section
5. Mobile + Desktop responsive comparison

## Don't
- Don't make it look like Netflix (dark theme). Keep it light and clean.
- Don't use English text — all UI labels should be in Hebrew
- Don't overcomplicate the layout. It should feel editorial and curated, not like a content dump.
- Don't forget the RTL direction — this is critical for Hebrew.
