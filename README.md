# InfluencerBot - AI Chatbot Platform for Influencers

מערכת SaaS ליצירת צ'אטבוטים מותאמים אישית למשפיענים.

## תכונות עיקריות

- **Onboarding Wizard** - הזנת URL אינסטגרם ויצירת צ'אטבוט אוטומטית
- **AI Analysis** - זיהוי סוג משפיען, חילוץ מותגים וקופונים, יצירת פרסונה
- **Dynamic Theming** - עיצוב מותאם לכל משפיען
- **Multi-tenant** - כל משפיען מקבל subdomain ייחודי
- **Admin Panel** - ניהול מוצרים, צפייה בשיחות, אנליטיקס
- **Auto-sync** - רענון אוטומטי של תוכן מאינסטגרם

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| AI | OpenAI GPT-5.2 / GPT-5-nano (Responses API) |
| Scraping | Apify Instagram Scraper |
| Charts | Recharts |
| Animations | Framer Motion |
| Hosting | Vercel (wildcard subdomain) |

## הגדרת משתני סביבה

צור קובץ `.env` עם:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Apify
APIFY_TOKEN=your-apify-token

# App
NEXT_PUBLIC_ROOT_DOMAIN=influencerbot.com
ADMIN_PASSWORD=your-admin-password

# Cron Secret
CRON_SECRET=your-random-secret
```

## הרצה מקומית

```bash
npm install
npm run dev
```

פתח http://localhost:3000

## מבנה הפרויקט

```
src/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── admin/
│   │   ├── page.tsx             # Admin login
│   │   ├── add/page.tsx         # Onboarding wizard
│   │   └── dashboard/page.tsx   # Dashboard
│   ├── [subdomain]/
│   │   ├── page.tsx             # Client chatbot
│   │   └── manage/page.tsx      # Influencer admin
│   └── api/
│       ├── apify/               # Instagram scraping
│       ├── analyze/             # AI analysis
│       ├── chat/                # Chat with GPT-5-nano
│       ├── cron/                # Auto-sync
│       └── admin/               # Admin APIs
├── components/
│   └── wizard/                  # Onboarding wizard steps
├── lib/
│   ├── supabase.ts              # Database client
│   ├── openai.ts                # AI (Responses API)
│   ├── apify.ts                 # Instagram scraper
│   ├── theme.ts                 # Dynamic theming
│   └── utils.ts                 # Utilities
└── types/
    └── index.ts                 # TypeScript types
```

## Database Schema

- `influencers` - פרטי משפיענים
- `posts` - פוסטים מאינסטגרם
- `products` - מוצרים וקופונים
- `content_items` - מתכונים/לוקים/סקירות
- `chat_sessions` - סשנים של שיחות
- `chat_messages` - הודעות
- `support_requests` - פניות תמיכה
- `analytics_events` - אירועי אנליטיקס

## מודלי AI

| שימוש | מודל | הסבר |
|-------|------|------|
| צ'אט | `gpt-5-nano` | הכי מהיר וזול |
| ניתוח | `gpt-5.2` | הכי חכם לניתוח מורכב |
| Persona | `gpt-5.2` | יצירת פרסונה מדויקת |

## Deploy to Vercel

1. Push to GitHub
2. Connect to Vercel
3. Add environment variables
4. Configure wildcard domain (*.influencerbot.com)
5. Deploy!

## רישיון

MIT
