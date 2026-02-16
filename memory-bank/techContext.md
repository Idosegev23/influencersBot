# Tech Context - טכנולוגיות ו-Setup

**עודכן:** 2026-01-11

---

## 🛠️ Tech Stack

### Frontend
| טכנולוגיה | גרסה | למה בחרנו |
|-----------|------|-----------|
| **Next.js** | 16.x | App Router, Server Components, API Routes |
| **React** | 19.x | UI library מוכר וחזק |
| **TypeScript** | 5.x | Type safety מלא |
| **Tailwind CSS** | 3.x | Styling מהיר וקונסיסטנטי |
| **Radix UI** | Latest | Accessible components |
| **Recharts** | Latest | Charts ו-Analytics |

### Backend
| טכנולוגיה | גרסה | למה בחרנו |
|-----------|------|-----------|
| **Next.js API Routes** | 16.x | Backend + Frontend באותו repo |
| **Supabase** | 2.x | PostgreSQL + Auth + Storage + RLS |
| **PostgreSQL** | 15.x | Database אמין ועוצמתי |
| **Upstash Redis** | Latest | Rate limiting + Caching |

### AI & APIs
| שירות | מודל | עלות | שימוש |
|-------|------|------|-------|
| **Google Gemini** | Vision 1.5 Pro | $0.00025/img | AI Parsing (primary) |
| **Anthropic Claude** | 3.5 Sonnet | $0.003/1K tokens | AI Parsing (fallback) |
| **OpenAI** | GPT-4o Vision | $0.005/1K tokens | AI Parsing (last resort) |
| **Google Calendar** | API v3 | חינם | Calendar integration |
| **Instagram** | Graph API | חינם | Profile data |
| **IMAI** | API | $100/חודש | Influencer analytics |
| **Apify** | Instagram Scraper | $50/חודש | Profile scraping |
| **Brand24** | Professional | $100/חודש | Social listening |
| **Airtable** | API | $50/חודש | סיכום אמלק |
| **Synthesia/D-ID** | API | $200/חודש | Video generation |
| **SendGrid** | Email API | $50/חודש | Email notifications |

### DevOps & Tools
| טכנולוגיה | שימוש |
|-----------|--------|
| **Vercel** | Hosting + Deployment |
| **Git** | Version control |
| **GitHub Actions** | CI/CD |
| **Sentry** | Error tracking + Monitoring |
| **Vitest** | Unit testing |
| **Playwright** | E2E testing |
| **ESLint** | Code linting |
| **Prettier** | Code formatting |

---

## 📦 Dependencies

### package.json - עיקריות

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/supabase-js": "^2.39.0",
    "@google/generative-ai": "^0.1.0",
    "typescript": "^5.3.3",
    "tailwindcss": "^3.4.0",
    "@radix-ui/react-*": "latest",
    "recharts": "^2.10.0",
    "zod": "^3.22.4",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^19.0.0",
    "vitest": "^1.0.0",
    "@playwright/test": "^1.40.0",
    "eslint": "^8.56.0",
    "prettier": "^3.1.0"
  }
}
```

---

## 🗄️ Database Schema

### טבלאות עיקריות

#### users
```sql
id UUID PRIMARY KEY (auth.uid())
email TEXT
full_name TEXT
role app_role (admin|agent|influencer|follower)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### accounts
```sql
id UUID PRIMARY KEY
owner_user_id UUID → users(id)
business_name TEXT
created_at TIMESTAMPTZ
```

#### partnerships
```sql
id UUID PRIMARY KEY
account_id UUID → accounts(id)
brand_name TEXT
campaign_name TEXT
status TEXT
start_date DATE
end_date DATE
payment_amount NUMERIC
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### partnership_documents
```sql
id UUID PRIMARY KEY
account_id UUID → accounts(id)
file_path TEXT
file_name TEXT
file_type TEXT
uploaded_by UUID → users(id)
parsed_data JSONB
parsing_status TEXT
confidence_score NUMERIC
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### ai_parsing_logs
```sql
id UUID PRIMARY KEY
document_id UUID → partnership_documents(id)
model_used TEXT
prompt_sent TEXT
response_received JSONB
parsing_duration_ms INT
cost NUMERIC
status TEXT
log_timestamp TIMESTAMPTZ
```

**נוספות**: tasks, invoices, calendar_events, conversations, coupons, notifications...

---

## 🔐 Environment Variables

### .env.local

```bash
# Supabase
# 🔑 **Project ID for MCP**: zwmlqlzfjiminrokzcse
NEXT_PUBLIC_SUPABASE_URL=https://zwmlqlzfjiminrokzcse.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SECRET_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# AI APIs
NEXT_PUBLIC_GOOGLE_AI_API_KEY=AIzaxxx...
ANTHROPIC_API_KEY=sk-ant-xxx...
OPENAI_API_KEY=sk-xxx...

# Integrations
GOOGLE_CALENDAR_CLIENT_ID=xxx
GOOGLE_CALENDAR_CLIENT_SECRET=xxx
INSTAGRAM_ACCESS_TOKEN=xxx
IMAI_API_KEY=xxx
APIFY_API_TOKEN=xxx
BRAND24_API_KEY=xxx
AIRTABLE_API_KEY=xxx
SYNTHESIA_API_KEY=xxx
SENDGRID_API_KEY=xxx

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx

# General
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🚀 Development Setup

### Prerequisites

```bash
# Node.js 20+
node --version  # v20.x.x

# npm 10+
npm --version   # 10.x.x

# Git
git --version   # 2.x.x
```

### התקנה

```bash
# Clone
git clone https://github.com/your-org/influencerbot.git
cd influencerbot

# Install dependencies
npm install

# Copy env template
cp .env.example .env.local
# ערוך .env.local עם ה-keys שלך

# Run migrations
npm run db:migrate

# Start dev server
npm run dev
```

### Scripts נפוצים

```bash
# Development
npm run dev                    # Start dev server (port 3000)
npm run build                  # Build for production
npm run start                  # Start production server

# Database
npm run db:migrate            # Run pending migrations
npm run db:reset              # Reset database
npm run db:seed               # Seed test data
npm run db:backup             # Backup database

# Testing
npm run test                  # Run unit tests
npm run test:watch            # Watch mode
npm run test:e2e              # E2E tests
npm run test:coverage         # Coverage report

# Code Quality
npm run lint                  # Run ESLint
npm run lint:fix              # Fix linting issues
npm run format                # Run Prettier
npm run type-check            # TypeScript check

# Maintenance
npm run backup:full           # Full backup (DB + files)
npm run check                 # Build + lint + type-check
```

---

## 🏗️ Project Structure

```
influencerbot/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Auth pages
│   │   ├── (dashboard)/       # Main app
│   │   ├── api/               # API routes
│   │   └── layout.tsx
│   │
│   ├── components/            # React components
│   │   ├── ui/               # Reusable UI (Radix)
│   │   ├── dashboard/        # Dashboard components
│   │   └── documents/        # Document components
│   │
│   ├── lib/                   # Business logic
│   │   ├── ai-parser/        # AI parsing logic
│   │   ├── supabase/         # Supabase client
│   │   ├── auth/             # Auth helpers
│   │   └── utils/            # Utilities
│   │
│   └── types/                 # TypeScript types
│
├── supabase/
│   ├── migrations/           # DB migrations
│   └── seed.sql             # Test data
│
├── public/                   # Static files
├── tests/                    # Test files
├── scripts/                  # Utility scripts
├── docs/                     # Documentation
├── memory-bank/             # Project knowledge base
│
├── .env.local               # Environment variables
├── .env.example             # Env template
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
├── tailwind.config.ts       # Tailwind config
├── next.config.js           # Next.js config
├── vitest.config.ts         # Vitest config
└── playwright.config.ts     # Playwright config
```

---

## 🔧 Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/upload-ui

# Make changes
# ... code ...

# Test
npm run test
npm run lint
npm run type-check

# Commit
git add .
git commit -m "feat: Add upload UI component"

# Push
git push origin feature/upload-ui

# Create PR
# ... review ...
```

### 2. Database Changes

```bash
# Create migration
cd supabase
psql $DATABASE_URL -c "
CREATE TABLE example (...);
" > migrations/010_create_example.sql

# Test migration
npm run db:reset  # Reset to clean state
npm run db:migrate  # Run all migrations

# Backup before deploy
npm run db:backup
```

### 3. Deployment

```bash
# Build locally
npm run build

# Test production build
npm run start

# Deploy to Vercel
git push origin main  # Auto-deploys

# Or manual
vercel --prod
```

---

## 🐛 Debugging

### Logs

```bash
# Dev server logs
npm run dev

# Supabase logs
npx supabase logs

# Check database
psql $DATABASE_URL
```

### Common Issues

#### 1. "Module not found"
```bash
rm -rf node_modules package-lock.json
npm install
```

#### 2. "Database connection failed"
```bash
# Check .env.local
echo $NEXT_PUBLIC_SUPABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

#### 3. "AI parsing failed"
```bash
# Check API key
echo $NEXT_PUBLIC_GOOGLE_AI_API_KEY

# Test Gemini API
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=$NEXT_PUBLIC_GOOGLE_AI_API_KEY"
```

---

## 📊 Performance Targets

| Metric | Target | Tool |
|--------|--------|------|
| **Page Load (p95)** | <2s | Lighthouse |
| **API Response (p95)** | <500ms | Sentry APM |
| **AI Parsing** | <10s | Logs |
| **Database Query** | <100ms | Supabase Dashboard |
| **Uptime** | 99.9% | Vercel Analytics |

---

## 🔒 Security

### Best Practices

1. **Never commit secrets** → use .env.local
2. **Always use RLS** → DB-level security
3. **Validate inputs** → Zod schemas
4. **Rate limit** → Redis
5. **HTTPS only** → Vercel enforces
6. **Audit logs** → Every mutation logged

### Security Checklist

- [ ] RLS enabled על כל הטבלאות
- [ ] API keys ב-.env.local (לא בקוד)
- [ ] Input validation עם Zod
- [ ] Rate limiting ב-Redis
- [ ] CORS configured נכון
- [ ] HTTPS enforced
- [ ] Sentry monitoring
- [ ] Regular backups

---

## 📚 Documentation Links

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Gemini API Docs](https://ai.google.dev/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Radix UI](https://www.radix-ui.com/)

---

**כל הטכנולוגיות בחרו בקפידה למען ביצועים, אבטחה וחוויית מפתח טובה!**

