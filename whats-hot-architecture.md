# "מה חם" — ארכיטקטורת קומפוננטות ו-API

## מבנה קבצים

```
src/
├── app/influencer/[username]/whats-hot/
│   └── page.tsx                    ← דף הטאב הראשי
│
├── components/whats-hot/
│   ├── WhatsHotPage.tsx            ← קומפוננטה ראשית (אורקסטרציה)
│   ├── NewsTicker.tsx              ← טיקר כותרות רץ למעלה
│   ├── BreakingCard.tsx            ← כרטיס Breaking Story בולט
│   ├── HotTopicsList.tsx           ← רשימת נושאים מדורגת
│   ├── TopicRow.tsx                ← שורת נושא בודד (heat bar + מטא)
│   ├── RecentPostsGrid.tsx         ← גריד פוסטים אחרונים
│   ├── PostCard.tsx                ← כרטיס פוסט בודד
│   ├── HeatBar.tsx                 ← בר חום ויזואלי (שימוש חוזר)
│   └── StatusBadge.tsx             ← באדג' סטטוס (breaking/hot/cooling)
│
├── app/api/whats-hot/
│   ├── topics/route.ts             ← GET נושאים חמים (מדורג)
│   └── recent-posts/route.ts       ← GET פוסטים אחרונים
│
└── lib/whats-hot/
    ├── types.ts                    ← טיפוסים משותפים
    └── queries.ts                  ← שאילתות Supabase
```

## קומפוננטות — תיאור מפורט

### `WhatsHotPage.tsx` — אורקסטרציה

```tsx
// Data fetching + layout orchestration
// State: topics[], recentPosts[], isLoading
// Fetches: /api/whats-hot/topics + /api/whats-hot/recent-posts
// Passes onOpenChat() to all children

interface WhatsHotPageProps {
  username: string;
}
```

**התנהגות:**
- טוען נתונים ב-`useEffect` (או SWR/React Query)
- Skeleton loading state ל-3 הסקשנים
- Pull-to-refresh במובייל (אופציונלי)
- כל לחיצה → `router.push(/chat/${username}?context_id=X&context_type=topic|post)`

### `NewsTicker.tsx` — טיקר רץ

```tsx
// Infinite horizontal scroll using CSS animation
// Receives: items: string[] (topic names with emoji prefix)
// Click on item → onOpenChat(topicId)
```

**עיצוב:**
- רקע אדום חלש (`rgba(239,68,68,0.06)`)
- אנימציית `ticker-scroll` (CSS keyframes, 35s loop)
- RTL-aware — טקסט עברי רץ מימין לשמאל
- גובה: ~36px, `overflow: hidden`

### `BreakingCard.tsx` — כרטיס בולט

```tsx
interface BreakingCardProps {
  topic: HotTopic;
  onOpenChat: (topic: HotTopic) => void;
}
```

**עיצוב:**
- Gradient background אדום-כתום חלש
- `backdrop-filter: blur(20px)`
- Glow blob בפינה (radial-gradient)
- Hover: `translateY(-2px)` + shadow מוגבר
- CTA בתחתית: "לחצו לשיחה עם הבוט על הנושא →"
- כולל: StatusBadge, HeatBar, TagPills, channels count

### `HotTopicsList.tsx` + `TopicRow.tsx` — רשימה מדורגת

```tsx
interface TopicRowProps {
  topic: HotTopic;
  rank: number;        // 1-based
  onOpenChat: (topic: HotTopic) => void;
}
```

**עיצוב:**
- Glass card wrapper לכל הרשימה
- כל שורה: מספר דירוג | שם + badge | heat score
- דירוג 1-2: רקע כתום חלש, שאר: סגול חלש
- Divider בין שורות
- Hover: `translateX(-2px)` + רקע surface-hover

### `RecentPostsGrid.tsx` + `PostCard.tsx` — פוסטים

```tsx
interface PostCardProps {
  post: RecentPost;
  onOpenChat: (post: RecentPost) => void;
}
```

**עיצוב:**
- Grid: `repeat(auto-fill, minmax(260px, 1fr))` → 1 עמודה במובייל, 2-3 בדסקטופ
- כרטיס glass-card עם hover lift
- Type badge (Reel/Post), caption (2 שורות max), stats (views + likes)

### `HeatBar.tsx` — בר חום

```tsx
interface HeatBarProps {
  score: number;       // 0-100
  size?: 'sm' | 'md';  // sm=4px, md=6px height
}
```

**צבעים דינמיים:**
- 85-100: אדום→כתום
- 65-84: כתום→צהוב
- 0-64: צהוב→ירוק

### `StatusBadge.tsx` — באדג' סטטוס

| סטטוס | טקסט | צבע | אפקט |
|--------|------|------|-------|
| breaking | BREAKING | אדום | נקודה פועמת |
| hot | חם | כתום | — |
| cooling | מתקרר | ירוק | — |

---

## API Routes

### `GET /api/whats-hot/topics`

**Query params:**
```
?influencer_id=xxx
&limit=20           // default 20
&status=breaking,hot,cooling  // filter
```

**Response:**
```json
{
  "breaking": {
    "id": "...",
    "name": "...",
    "status": "breaking",
    "heat_score": 98,
    "summary": "...",
    "tags": ["...", "..."],
    "channels_covered": 14,
    "updated_at": "2026-03-23T10:00:00Z"
  },
  "topics": [
    {
      "id": "...",
      "name": "...",
      "status": "hot",
      "heat_score": 87,
      "tags": ["..."],
      "channels_covered": 9,
      "updated_at": "..."
    }
  ],
  "total_count": 351,
  "ticker_items": ["🔴 headline 1", "⚡ headline 2", ...]
}
```

**Supabase Query:**
```sql
SELECT * FROM hot_topics
WHERE influencer_id = $1
  AND status IN ('breaking', 'hot', 'cooling')
ORDER BY heat_score DESC
LIMIT $2;
```

### `GET /api/whats-hot/recent-posts`

**Query params:**
```
?influencer_id=xxx
&limit=8
```

**Response:**
```json
{
  "posts": [
    {
      "id": "...",
      "caption": "...",
      "posted_at": "2026-03-23T08:00:00Z",
      "views": 124500,
      "likes": 8700,
      "type": "reel"
    }
  ]
}
```

**Supabase Query:**
```sql
SELECT id, caption, posted_at, views, likes, type
FROM instagram_posts
WHERE influencer_id = $1
ORDER BY posted_at DESC
LIMIT $2;
```

---

## ניווט — הוספה ל-NavigationMenu

```tsx
// src/components/NavigationMenu.tsx
// הוספת פריט חדש ל-NAV_ITEMS:

import { Flame } from 'lucide-react';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'דשבורד', icon: LayoutDashboard },
  { key: 'partnerships', label: 'שת״פים', icon: Briefcase },
  { key: 'coupons', label: 'קופונים', icon: Tag },
  { key: 'whats-hot', label: 'מה חם', icon: Flame },  // ← חדש
  { key: 'conversations', label: 'שיחות', icon: MessageCircle },
  { key: 'chatbot-persona', label: 'הבוט שלי', icon: Bot },
  { key: 'settings', label: 'הגדרות', icon: Settings },
];
```

**מובייל:** הטאב מחליף את אחד מ-5 המקומות (למשל settings ירד לתפריט נוסף).

---

## ניווט לצ'אט — Flow

```
לחיצה על נושא/פוסט
  ↓
router.push(`/chat/${username}?context_id=${id}&context_type=topic`)
  ↓
Chat page reads query params
  ↓
Auto-sends first message:
  "ספר לי על: {topic.name}"
  ↓
Hybrid retrieval system uses topic/post as context
  ↓
Bot responds with relevant info from document_chunks + hot_topics
```

**שינוי נדרש ב-Chat page:**
```tsx
// src/app/chat/[username]/page.tsx
// קריאת query params בטעינה:

const searchParams = useSearchParams();
const contextId = searchParams.get('context_id');
const contextType = searchParams.get('context_type'); // 'topic' | 'post'

useEffect(() => {
  if (contextId && contextType) {
    // Auto-send initial message with context
    sendMessage(`ספר לי על: ${contextName}`);
  }
}, [contextId]);
```

---

## Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| Mobile (<640px) | Ticker → Breaking card (full width) → Topics list → Posts (1 col) → Bottom bar |
| Tablet (640-1024px) | Same flow, Posts in 2 cols |
| Desktop (>1024px) | Same flow, Posts in 3 cols, top nav |

---

## Caching Strategy

| Data | TTL | מנגנון |
|------|-----|--------|
| hot_topics | 5 min | Upstash Redis + SWR revalidation |
| recent_posts | 10 min | Upstash Redis + SWR revalidation |
| ticker | Derived from hot_topics | Same cache |

---

## טיפוסים (`lib/whats-hot/types.ts`)

```typescript
export interface HotTopic {
  id: string;
  name: string;
  status: 'breaking' | 'hot' | 'cooling';
  heat_score: number;
  summary?: string;
  tags: string[];
  channels_covered: number;
  updated_at: string;
}

export interface RecentPost {
  id: string;
  caption: string;
  posted_at: string;
  views: number;
  likes: number;
  type: 'reel' | 'image' | 'carousel';
  thumbnail?: string;
}

export interface WhatsHotData {
  breaking: HotTopic | null;
  topics: HotTopic[];
  recentPosts: RecentPost[];
  totalTopics: number;
  tickerItems: string[];
}
```
