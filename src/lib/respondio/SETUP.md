# Respond.io Integration — Setup Guide

## Environment Variables

Add these to `.env.local`:

```env
# Respond.io API Key (from Settings > Integrations > Developer API)
RESPONDIO_API_KEY=your_api_key_here

# Respond.io API base URL (default: https://api.respond.io/v2)
RESPONDIO_BASE_URL=https://api.respond.io/v2

# Webhook secret for verifying incoming webhooks
RESPONDIO_WEBHOOK_SECRET=your_webhook_secret_here
```

## Setup Steps

### 1. Respond.io Account
- Sign up at [respond.io](https://respond.io)
- Choose **Advanced plan** ($279/mo) — required for webhooks
- Connect your Instagram account(s) in Settings > Channels

### 2. API Key
- Go to **Settings > Integrations > Developer API**
- Generate a new API key
- Copy to `RESPONDIO_API_KEY`

### 3. Webhook Configuration
- Go to **Settings > Integrations > Webhooks**
- Add webhook URL: `https://your-domain.vercel.app/api/webhooks/respondio`
- Subscribe to events:
  - `message.created` (or `inbound_message`)
  - `conversation.assigned` (optional — for human handoff)
  - `conversation.closed` (optional — for analytics)
- Copy the webhook secret to `RESPONDIO_WEBHOOK_SECRET`

### 4. Database Migration
Run the SQL in `migrations.sql` in the Supabase SQL Editor:
- Creates `respondio_channel_mappings` table
- Creates `respondio_dm_log` table
- Sets up RLS policies and indexes

### 5. Channel Mapping
After connecting Instagram in Respond.io, map the channel to your influencer account:

```sql
INSERT INTO respondio_channel_mappings (account_id, respondio_channel_id, channel_type, channel_name)
VALUES (
  'your-influencer-account-uuid',
  123,  -- Respond.io channel ID (find in Settings > Channels)
  'instagram',
  '@influencer_username'
);
```

### 6. Test
1. Send a DM to the connected Instagram account
2. Check Vercel logs for `[Webhook]` and `[DM Handler]` entries
3. Verify the bot responds in the DM

## Architecture

```
Instagram DM
    ↓
Respond.io (receives DM)
    ↓ webhook POST
/api/webhooks/respondio
    ↓
dm-chat-handler.ts
    ↓ finds matching account
processWidgetMessage() / SandwichBot
    ↓ generates AI response
client.ts → sendLongTextMessage()
    ↓ Respond.io API
Instagram DM (reply sent)
```

## File Structure

```
src/lib/respondio/
├── client.ts           # Respond.io API client (send messages, manage contacts)
├── dm-chat-handler.ts  # DM processing logic (webhook → SandwichBot → reply)
├── index.ts            # Main exports
├── migrations.sql      # Database tables for channel mappings & DM logs
└── SETUP.md            # This file

src/app/api/webhooks/respondio/
└── route.ts            # Webhook endpoint (POST for events, GET for health)
```

## Multi-Tenant Support

The system supports multiple influencers through `respondio_channel_mappings`:
- Each Instagram channel in Respond.io maps to one bestieAI account
- The bot automatically loads the correct personality, knowledge, and persona
- DM sessions are scoped per contact + per account

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Webhook not receiving events | Check Respond.io webhook status page, verify URL is correct |
| Bot not responding | Check Vercel function logs, verify `RESPONDIO_API_KEY` is set |
| Wrong influencer responding | Check `respondio_channel_mappings` table |
| Message too long | Auto-split at 1000 chars for Instagram (handled in client.ts) |
| Webhook timeout | Processing is async — response returned immediately |
