# Instagram Graph API Integration — Brief for Claude Code

## Status: In Progress (March 2026)

Meta App **"InfluencerBot API"** created and configured with:
- Instagram messaging & content use case
- WhatsApp use case
- Test Instagram account connected with tester role + access token generated
- Webhook subscription opened in Meta dashboard (not yet verified)

---

## What Was Built

### 1. Webhook Endpoint
**File:** `src/app/api/webhooks/instagram/route.ts`

- `GET` — Meta verification challenge (hub.mode, hub.verify_token, hub.challenge)
- `POST` — Receives all Instagram webhook events (DMs, comments, story_insights)
- Verifies HMAC-SHA256 signature using app secret
- Routes messaging events to DM handler, change events to respective handlers
- Returns 200 immediately, processes DMs asynchronously (same pattern as Respond.io webhook)

### 2. Instagram Graph API Client
**File:** `src/lib/instagram-graph/client.ts`

Functions:
- `sendInstagramDM()` — Send text message via DM
- `sendInstagramQuickReply()` — Send message with quick reply buttons
- `sendInstagramImage()` — Send image via DM
- `sendLongInstagramDM()` — Auto-splits messages for Instagram's 1000 char limit
- `getUserProfile()` — Get IG user profile info
- `getStories()` — Get active stories for an account
- `getStoryInsights()` — Get story analytics (impressions, reach, exits, taps)
- `verifyWebhookSignature()` — HMAC-SHA256 verification

### 3. DM Handler (SandwichBot Integration)
**File:** `src/lib/instagram-graph/dm-handler.ts`

- `processInstagramGraphDM()` — Same flow as `src/lib/respondio/dm-chat-handler.ts`
- Uses SandwichBot with `mode: 'dm'`
- Resolves account from `ig_graph_connections` table
- Session key format: `dm_ig_graph_{senderId}_{accountId}`
- Strips markdown and suggestions for DM compatibility
- Saves messages to `chat_messages` with `metadata.source = 'instagram_graph'`

### 4. OAuth Flow
**Files:**
- `src/app/api/auth/instagram/connect/route.ts` — Initiates OAuth, redirects to Instagram
- `src/app/api/auth/instagram/callback/route.ts` — Handles callback, exchanges code → short-lived token → long-lived token (60 days), saves to DB

Scopes requested: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`

### 5. Token Refresh
**File:** `src/lib/instagram-graph/token-refresh.ts`

- `refreshExpiringTokens()` — Finds tokens expiring within 7 days, refreshes them
- Should be called via cron job (weekly)
- Marks connections as inactive if refresh completely fails

### 6. Index/Exports
**File:** `src/lib/instagram-graph/index.ts`

---

## What Still Needs to Be Done

### Critical — Before First Test

1. **Create `ig_graph_connections` table in Supabase**
```sql
CREATE TABLE ig_graph_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  ig_business_account_id TEXT UNIQUE NOT NULL,
  ig_username TEXT,
  ig_name TEXT,
  ig_profile_pic TEXT,
  ig_followers_count INTEGER DEFAULT 0,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  token_type TEXT DEFAULT 'long_lived',
  permissions TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ig_graph_account ON ig_graph_connections(account_id);
CREATE INDEX idx_ig_graph_ig_id ON ig_graph_connections(ig_business_account_id);
```

2. **Set environment variables in Vercel:**
```
INSTAGRAM_APP_ID=1078098345377774
INSTAGRAM_APP_SECRET=<new secret after reset>
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=<any string you choose>
INSTAGRAM_REDIRECT_URI=https://influencers-bot.vercel.app/api/auth/instagram/callback
```

3. **Deploy and verify webhook** — In Meta Dashboard > Instagram > Configure webhooks, enter:
   - Callback URL: `https://influencers-bot.vercel.app/api/webhooks/instagram`
   - Verify token: same as `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
   - Click "Verify and save"
   - Subscribe to: messages, messaging_postbacks, messaging_seen, message_reactions

4. **Set up Instagram Business Login** — In Meta Dashboard > step 4, enter:
   - Redirect URL: `https://influencers-bot.vercel.app/api/auth/instagram/callback`

### Important — Using Graph API for Scraping

**The access token from OAuth can replace ScrapeCreators/Apify for connected accounts.**

Once an influencer connects via OAuth, their token allows native Graph API calls:

| Data | Graph API Endpoint | Replaces |
|------|-------------------|----------|
| Posts + Media | `GET /{ig-user-id}/media?fields=id,caption,media_type,media_url,timestamp,like_count,comments_count` | ScrapeCreators posts |
| Comments | `GET /{media-id}/comments?fields=text,username,timestamp` | Apify comment scraper |
| Stories (own) | `GET /{ig-user-id}/stories?fields=id,media_type,media_url,timestamp` | ScrapeCreators stories |
| Story Insights | `GET /{story-id}/insights?metric=impressions,reach,replies` | **Not available via scraping** |
| Profile Info | `GET /{ig-user-id}?fields=username,followers_count,media_count,biography` | Apify profile scraper |
| Post Insights | `GET /{media-id}/insights?metric=impressions,reach,engagement` | **Not available via scraping** |
| Reels Insights | `GET /{media-id}/insights?metric=plays,reach,total_interactions` | **Not available via scraping** |

**Recommended strategy:** Create a `graph-api-scraper.ts` in `src/lib/scraping/` that uses the stored access token from `ig_graph_connections`. Use it as the PRIMARY source when a token exists, falling back to ScrapeCreators when it doesn't (e.g., for accounts not connected via OAuth).

**Key advantages over scraping:**
- Free (no Apify/ScrapeCreators costs)
- Insights data (views, reach, engagement) — impossible to scrape
- More reliable — won't break when Instagram changes their frontend
- Story insights (taps, exits, replies) — brand new data source
- Real-time via webhooks — no polling needed for DMs

**Limitations:**
- Only works for accounts that completed OAuth
- Can't access other people's stories (competitors)
- Rate limits: ~4800 calls per 24 hours per account
- Token expires after 60 days (refresh mechanism built in `token-refresh.ts`)

### Nice to Have — Later

- **WhatsApp Cloud API integration** — Similar to Instagram, uses same Meta App. Needs: WhatsApp Business number, message templates, webhook for incoming messages.
- **Cron job for token refresh** — Call `refreshExpiringTokens()` weekly
- **Graph API scraper** — New scraper in `src/lib/scraping/` that uses stored tokens as primary source
- **Webhook event storage** — Store raw webhook events for debugging
- **Ice Breakers** — Automated greeting messages when someone opens DM for the first time
- **Rich messages** — Quick replies and image responses in DM (functions already exist in client.ts)

---

## Architecture Summary

```
Influencer connects → OAuth flow → Access token saved to ig_graph_connections
                                                    ↓
                                    ┌───────────────┴───────────────┐
                                    ↓                               ↓
                            DM via webhook                  Scraping via Graph API
                            (real-time)                    (replaces ScrapeCreators)
                                    ↓                               ↓
                            SandwichBot                    Posts, Stories, Insights
                            (same engine)                  (native, free, reliable)
                                    ↓
                        Reply via Graph API
                        (sendInstagramDM)
```

## Meta App Details

- **App Name:** InfluencerBot API
- **Instagram App ID:** 1078098345377774
- **Status:** Development Mode (Unpublished)
- **Use Cases:** Instagram messaging & content + WhatsApp
- **Test accounts:** 1 connected (tester role)

## File Tree of New Code

```
src/
├── app/api/
│   ├── auth/instagram/
│   │   ├── connect/route.ts      ← Start OAuth flow
│   │   └── callback/route.ts     ← Handle OAuth callback
│   └── webhooks/instagram/
│       └── route.ts              ← Meta webhook endpoint
└── lib/instagram-graph/
    ├── index.ts                  ← Exports
    ├── client.ts                 ← Graph API client (send DM, stories, insights)
    ├── dm-handler.ts             ← DM handler (SandwichBot integration)
    └── token-refresh.ts          ← Token refresh utility
```
