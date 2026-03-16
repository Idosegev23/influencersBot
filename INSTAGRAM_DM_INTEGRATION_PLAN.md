# Instagram DM Integration Plan

> תוכנית טכנית לחיבור בוט ישירות ל-Instagram DM דרך Meta API
> Generated: 2026-03-08

---

## סקירה כללית

### מה רוצים
משפיענים מחברים את חשבון האינסטגרם שלהם → עוקבים שולחים DM → הבוט עונה בשם המשפיען על בסיס התוכן שלו → התשובה מופיעה ב-DM של האינסטגרם.

### מה כבר קיים בפרויקט
- `widget-chat-handler.ts` — מטפל בהודעות צ'אט עם SandwichBot
- `sandwichBot.ts` — אורקסטרציה של archetype → knowledge → response
- `knowledge-retrieval.ts` — שליפת תוכן רלוונטי (פוסטים, תמלולים, היילייטים)
- `personality-wrapper.ts` — בניית אישיות מותאמת למשפיען
- `conversation-memory.ts` — rolling summary
- מבנה multi-tenant עם `account_id` על כל טבלה

### מה חסר
1. OAuth flow לחיבור חשבון אינסטגרם
2. Webhook endpoint לקבלת הודעות נכנסות מ-Meta
3. פונקציית שליחת הודעה חזרה דרך Instagram API
4. שמירת access tokens
5. App Review מול Meta

---

## ארכיטקטורה

```
עוקב שולח DM למשפיען באינסטגרם
            ↓
      Meta Platform
            ↓ POST /api/webhooks/instagram
      ┌─────────────────────────────┐
      │  Webhook Handler            │
      │  1. Verify signature        │
      │  2. Parse payload           │
      │  3. Map recipient → account │
      └─────────────┬───────────────┘
                    ↓
      ┌─────────────────────────────┐
      │  processInstagramMessage()  │
      │  (new function)             │
      │  - Uses same SandwichBot    │
      │  - Same knowledge retrieval │
      │  - Same personality         │
      └─────────────┬───────────────┘
                    ↓
      ┌─────────────────────────────┐
      │  sendInstagramReply()       │
      │  POST graph.instagram.com   │
      │  /<IG_ID>/messages          │
      │  with influencer token      │
      └─────────────────────────────┘
            ↓
      עוקב מקבל תשובה ב-DM
```

---

## Phase 1: Meta App Setup (ידני, פעם אחת)

### 1.1 יצירת App ב-Meta Developer Dashboard

1. כנס ל-https://developers.facebook.com/apps/
2. Create App → Use case: "Other" → App type: "Business"
3. תן שם (למשל "InfluencerBot Platform")
4. ב-Dashboard, הוסף את ה-product: **Instagram**
5. בחר **Instagram Login** (לא Facebook Login)

### 1.2 הגדרות נדרשות ב-Dashboard

- **Valid OAuth Redirect URIs:** `https://yourdomain.com/api/auth/instagram/callback`
- **Deauthorize Callback URL:** `https://yourdomain.com/api/webhooks/instagram/deauthorize`
- **Data Deletion Request URL:** `https://yourdomain.com/api/webhooks/instagram/data-deletion`
- **Webhook Callback URL:** `https://yourdomain.com/api/webhooks/instagram`
- **Webhook Verify Token:** random string שתשמור ב-env

### 1.3 Permissions נדרשים

| Permission | שימוש | Access Level |
|-----------|-------|-------------|
| `instagram_business_basic` | גישה בסיסית לחשבון | Standard (dev) → Advanced (production) |
| `instagram_business_manage_messages` | קריאה ושליחה של DMs | Advanced (דורש App Review) |

---

## Phase 2: Database Changes

### 2.1 Migration — טבלת instagram_connections

```sql
CREATE TABLE instagram_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Instagram identifiers
  ig_user_id TEXT NOT NULL,           -- Instagram Professional Account ID
  ig_username TEXT,                     -- @username for display

  -- OAuth tokens
  access_token TEXT NOT NULL,          -- Instagram user access token
  token_expires_at TIMESTAMPTZ,        -- token expiration

  -- Webhook subscription
  webhook_subscribed BOOLEAN DEFAULT false,
  subscribed_fields TEXT[],            -- ['messages', 'messaging_seen', ...]

  -- Status
  status TEXT DEFAULT 'active',        -- active, disconnected, token_expired
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(ig_user_id),
  UNIQUE(account_id)                   -- one IG account per influencer account
);

-- Index for webhook lookup (incoming message → which account?)
CREATE INDEX idx_ig_connections_ig_user_id ON instagram_connections(ig_user_id);
CREATE INDEX idx_ig_connections_account_id ON instagram_connections(account_id);

-- RLS
ALTER TABLE instagram_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own connection" ON instagram_connections
  FOR SELECT USING (account_id = auth.uid());
CREATE POLICY "Users can manage own connection" ON instagram_connections
  FOR ALL USING (account_id = auth.uid());
```

### 2.2 Migration — טבלת instagram_messages (log)

```sql
CREATE TABLE instagram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id),

  -- Message data
  ig_message_id TEXT NOT NULL,         -- Meta's message ID (mid)
  sender_ig_id TEXT NOT NULL,          -- IGSID of the sender
  recipient_ig_id TEXT NOT NULL,       -- IG ID of the influencer
  direction TEXT NOT NULL,             -- 'inbound' or 'outbound'
  content TEXT,                        -- message text
  attachment_type TEXT,                -- image, video, audio, story_mention, ig_reel, null
  attachment_url TEXT,                 -- media URL if applicable

  -- Processing
  processed BOOLEAN DEFAULT false,
  error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(ig_message_id)
);

CREATE INDEX idx_ig_messages_account ON instagram_messages(account_id);
CREATE INDEX idx_ig_messages_sender ON instagram_messages(sender_ig_id);
```

---

## Phase 3: OAuth Flow (חיבור משפיען)

### 3.1 קבצים חדשים

```
src/app/api/auth/instagram/
  ├── connect/route.ts      — Redirect to Meta OAuth
  └── callback/route.ts     — Handle OAuth callback, save token
src/lib/instagram/
  ├── oauth.ts              — OAuth helpers
  ├── api.ts                — Instagram API calls
  ├── webhook-handler.ts    — Process incoming webhooks
  └── message-sender.ts     — Send DM replies
```

### 3.2 OAuth Connect — `/api/auth/instagram/connect`

```typescript
// src/app/api/auth/instagram/connect/route.ts
export async function GET(req: NextRequest) {
  const accountId = /* extract from session */;

  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI!,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_manage_messages',
    state: accountId, // to map callback back to account
  });

  return Response.redirect(
    `https://www.instagram.com/oauth/authorize?${params}`
  );
}
```

### 3.3 OAuth Callback — `/api/auth/instagram/callback`

```typescript
// src/app/api/auth/instagram/callback/route.ts
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const accountId = req.nextUrl.searchParams.get('state');

  // 1. Exchange code for short-lived token
  const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: process.env.INSTAGRAM_REDIRECT_URI!,
      code,
    }),
  });
  const { access_token, user_id } = await tokenRes.json();

  // 2. Exchange for long-lived token (60 days)
  const longLivedRes = await fetch(
    `https://graph.instagram.com/access_token?` +
    `grant_type=ig_exchange_token&` +
    `client_secret=${process.env.INSTAGRAM_APP_SECRET}&` +
    `access_token=${access_token}`
  );
  const { access_token: longToken, expires_in } = await longLivedRes.json();

  // 3. Get username
  const profileRes = await fetch(
    `https://graph.instagram.com/me?fields=user_id,username&access_token=${longToken}`
  );
  const profile = await profileRes.json();

  // 4. Save to DB
  await supabase.from('instagram_connections').upsert({
    account_id: accountId,
    ig_user_id: user_id,
    ig_username: profile.username,
    access_token: longToken, // TODO: encrypt before storing!
    token_expires_at: new Date(Date.now() + expires_in * 1000),
    status: 'active',
  });

  // 5. Subscribe to webhooks
  await subscribeToWebhooks(user_id, longToken);

  // 6. Redirect back to dashboard
  return Response.redirect('/dashboard?ig_connected=true');
}
```

### 3.4 Token Refresh (חובה!)

Long-lived tokens תקפים 60 יום. צריך cron job שמרענן:

```typescript
// src/app/api/cron/refresh-ig-tokens/route.ts
// Schedule: כל יום, מרענן tokens שפגים ב-7 ימים הקרובים
export async function GET() {
  const { data: expiring } = await supabase
    .from('instagram_connections')
    .select('*')
    .lt('token_expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    .eq('status', 'active');

  for (const conn of expiring || []) {
    const res = await fetch(
      `https://graph.instagram.com/refresh_access_token?` +
      `grant_type=ig_refresh_token&` +
      `access_token=${conn.access_token}`
    );
    const { access_token, expires_in } = await res.json();

    await supabase.from('instagram_connections').update({
      access_token,
      token_expires_at: new Date(Date.now() + expires_in * 1000),
    }).eq('id', conn.id);
  }
}
```

---

## Phase 4: Webhook Handler (ליבת האינטגרציה)

### 4.1 Webhook Verification — GET

```typescript
// src/app/api/webhooks/instagram/route.ts

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}
```

### 4.2 Webhook Handler — POST

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json();

  // 1. Verify signature
  const signature = req.headers.get('X-Hub-Signature-256');
  if (!verifySignature(body, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  // 2. Must be instagram
  if (body.object !== 'instagram') {
    return new Response('OK', { status: 200 });
  }

  // 3. Respond immediately (Meta expects 200 within 5 seconds)
  // Process asynchronously
  const entries = body.entry || [];

  // Fire and forget — process in background
  processWebhookEntries(entries).catch(console.error);

  return new Response('OK', { status: 200 });
}
```

### 4.3 Message Processing

```typescript
// src/lib/instagram/webhook-handler.ts

import { processWidgetMessage } from '@/lib/chatbot/widget-chat-handler';
import { sendInstagramMessage } from './message-sender';

export async function processWebhookEntries(entries: any[]) {
  for (const entry of entries) {
    const igAccountId = entry.id; // Influencer's IG ID
    const messaging = entry.messaging || [];

    for (const event of messaging) {
      // Skip echo messages (sent by us)
      if (event.message?.is_echo) continue;
      // Skip deleted messages
      if (event.message?.is_deleted) continue;

      const senderIgId = event.sender.id;     // The follower
      const recipientIgId = event.recipient.id; // The influencer
      const messageText = event.message?.text;
      const messageId = event.message?.mid;

      if (!messageText) continue; // Skip non-text for now

      // 1. Find which account this belongs to
      const { data: connection } = await supabase
        .from('instagram_connections')
        .select('account_id, access_token')
        .eq('ig_user_id', recipientIgId)
        .eq('status', 'active')
        .single();

      if (!connection) continue;

      // 2. Get or create a session for this follower
      const sessionId = await getOrCreateIGSession(
        connection.account_id,
        senderIgId
      );

      // 3. Log inbound message
      await supabase.from('instagram_messages').insert({
        account_id: connection.account_id,
        session_id: sessionId,
        ig_message_id: messageId,
        sender_ig_id: senderIgId,
        recipient_ig_id: recipientIgId,
        direction: 'inbound',
        content: messageText,
        processed: false,
      });

      // 4. Process with SandwichBot (same brain as widget!)
      const result = await processWidgetMessage({
        accountId: connection.account_id,
        message: messageText,
        sessionId,
      });

      // 5. Send reply via Instagram API
      await sendInstagramMessage({
        igAccountId: recipientIgId,
        recipientId: senderIgId,
        text: result.response,
        accessToken: connection.access_token,
      });

      // 6. Log outbound message
      await supabase.from('instagram_messages').insert({
        account_id: connection.account_id,
        session_id: sessionId,
        ig_message_id: null,
        sender_ig_id: recipientIgId,
        recipient_ig_id: senderIgId,
        direction: 'outbound',
        content: result.response,
        processed: true,
      });
    }
  }
}
```

---

## Phase 5: Send Message Function

```typescript
// src/lib/instagram/message-sender.ts

interface SendMessageParams {
  igAccountId: string;  // Influencer's IG ID
  recipientId: string;  // Follower's IGSID
  text: string;
  accessToken: string;
}

export async function sendInstagramMessage(params: SendMessageParams) {
  const { igAccountId, recipientId, text, accessToken } = params;

  // Instagram DM has ~1000 byte limit per message
  // Split long messages if needed
  const chunks = splitMessage(text, 950);

  for (const chunk of chunks) {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${igAccountId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: chunk },
        }),
      }
    );

    if (!res.ok) {
      const error = await res.json();
      console.error('Instagram send failed:', error);
      throw new Error(`Instagram API error: ${error.error?.message}`);
    }
  }
}

function splitMessage(text: string, maxBytes: number): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return [text];

  const chunks: string[] = [];
  let current = '';

  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (encoder.encode(current + sentence).length > maxBytes) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current) chunks.push(current.trim());

  return chunks;
}
```

---

## Phase 6: Environment Variables

```bash
# .env.local — add these:

# Meta App
INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_REDIRECT_URI=https://yourdomain.com/api/auth/instagram/callback
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=random_secure_string_here

# Optional: encryption key for tokens at rest
TOKEN_ENCRYPTION_KEY=32_byte_hex_key
```

---

## Phase 7: App Review Checklist

לפני שמשפיענים חיצוניים יכולים להתחבר, צריך App Review:

### מה להכין
- [ ] **מדיניות פרטיות** — URL ציבורי (חובה)
- [ ] **תנאי שימוש** — URL ציבורי
- [ ] **סרטון הדגמה** — Screencast שמראה:
  - תהליך ההתחברות (OAuth)
  - משתמש שולח DM
  - הבוט עונה
  - איפה/איך הנתונים נשמרים
- [ ] **תיעוד** — למה צריך כל permission
- [ ] **Data Deletion endpoint** — GDPR compliance

### Permissions לבקש
| Permission | Justification |
|-----------|---------------|
| `instagram_business_basic` | "Our platform allows influencers to connect their account to enable AI-powered DM responses" |
| `instagram_business_manage_messages` | "We read incoming DMs and send automated responses based on the influencer's content" |

### Timeline צפוי
- הגשה ראשונה: ~1 שעה עבודה
- זמן תגובה מ-Meta: 5–30 ימי עסקים
- אם דוחים: תיקון + הגשה חוזרת (~7 ימים נוספים)

---

## סדר פעולות מומלץ

```
שבוע 1: Setup
├── יצירת Meta App (1-2 שעות)
├── DB migrations (1 שעה)
├── OAuth flow — connect + callback (3-4 שעות)
└── Webhook endpoint — verification + basic handler (2-3 שעות)

שבוע 2: Integration
├── processInstagramMessage — חיבור ל-SandwichBot (2-3 שעות)
├── sendInstagramMessage (1-2 שעות)
├── Token refresh cron (1 שעה)
├── בדיקות עם החשבון שלך (Standard Access) (2-3 שעות)
└── UI — כפתור "Connect Instagram" בדשבורד (2-3 שעות)

שבוע 3: Polish + Submit
├── Error handling + retry logic (2-3 שעות)
├── Rate limiting per follower (1 שעה)
├── Logging + monitoring (2 שעות)
├── מדיניות פרטיות + תנאי שימוש (2-3 שעות)
├── סרטון הדגמה (1-2 שעות)
└── הגשת App Review (1 שעה)

שבוע 4-6: המתנה
├── המתנה לאישור Meta
├── בינתיים: בדיקות עם חשבון test
├── שיפור response quality
└── הוספת תמיכה ב-media messages
```

---

## מגבלות חשובות

| מגבלה | פירוט |
|-------|-------|
| **חלון 24 שעות** | אפשר להגיב רק תוך 24 שעות מההודעה האחרונה של המשתמש |
| **רק טקסט** | בשלב ראשון. תמיכה ב-images/video אפשרית אבל מורכבת יותר |
| **1000 bytes** | מגבלת אורך להודעה (בערך 250-300 מילים בעברית) |
| **אין פנייה יזומה** | הבוט לא יכול לשלוח הודעה ראשון |
| **חובת גילוי** | חייב להגיד שזה בוט |
| **Professional accounts only** | המשפיען חייב להיות Creator או Business account |
| **Token expiry** | Long-lived token = 60 יום, חובה לרענן |

---

## Security Notes

1. **Token encryption** — Access tokens מאחסנים ב-DB. מומלץ להצפין עם AES-256 (encrypt at rest)
2. **Webhook signature** — תמיד לוודא X-Hub-Signature-256 לפני עיבוד
3. **Rate limiting** — הוסף rate limit per follower per account (למנוע spam)
4. **Token isolation** — כל token שייך ל-account_id אחד, אל תערבב
5. **Deauthorize callback** — כשמשפיען מנתק, מחק token מיד

---

## קבצים ליצירה (סיכום)

```
src/app/api/auth/instagram/
  ├── connect/route.ts
  └── callback/route.ts

src/app/api/webhooks/instagram/
  ├── route.ts                    — Main webhook (GET verify + POST handler)
  ├── deauthorize/route.ts        — Meta deauthorize callback
  └── data-deletion/route.ts      — GDPR data deletion

src/app/api/cron/
  └── refresh-ig-tokens/route.ts  — Token refresh cron

src/lib/instagram/
  ├── oauth.ts                    — OAuth helpers (buildAuthUrl, exchangeCode, refreshToken)
  ├── api.ts                      — Instagram API client wrapper
  ├── webhook-handler.ts          — Process incoming webhook events
  ├── message-sender.ts           — Send DM replies
  └── signature.ts                — Webhook signature verification

supabase/migrations/
  └── YYYYMMDD_instagram_connections.sql
```
?