# Agency CRM — Status & Handoff (June 2026)

Bestie as a full CRM for influencer agencies (agent layer → quotes → e-signature →
invoices → 48h reminders → payment tracking → dashboard). Spec/plan:
`~/.claude/plans/peaceful-meandering-token.md`.

## Shipped to `main` (all live)
| Commit | What |
|---|---|
| `9219b61` | Phase 0+1: multi-user login (admin `admin`/123456 + agents via Supabase Auth), agent mgmt, forced onboarding (email+WhatsApp), CRM-only clients |
| `2476541` | Phase 2: quotes + e-signature (`/sign/[token]`, pdf-lib Hebrew) + inbound ingestion (WhatsApp webhook branch + Gmail poller + manual) |
| `d90bd0f` | Phase 3-5: invoices, 48h reminders cron, payment tracking (net+30, route classification), agent dashboard + plan-vs-actual |
| `4524c47` | fix: ship the `/admin/agents` page (was untracked → 404 on prod) |
| `c2170ea` | Agent **Inbox** (view/triage/convert inbound) + email ingestion verified live |
| `048b971` | file→AI-parse, document view/download, quote cancel/resend, client edit/delete, **signing-link domain fix** |
| `bee3969` | invoice resend/cancel, agent settings page, RLS migration 052 (pending apply) |

## Architecture quick-facts
- Agent→accounts link = `public.users.managed_account_ids[]` (NO `agent_influencers` table). RLS disabled on most tables; isolation enforced in API code (every `/api/agent/*` filters by agent).
- CRM-only client = `accounts` row with `config.crmOnly=true` (no scan/persona/widget); `daily-scan` skips them.
- Public links base URL: `appBaseUrl()` in `src/lib/crm/quotes.ts` → defaults to `https://bestie.ldrsgroup.com`.
- Email ingestion: poller `/api/cron/poll-gmail` reads `GMAIL_SEND_FROM` (bestie@ldrsgroup.com) via the service account; **gmail.readonly delegation is granted (LIVE)**. WhatsApp ingestion: agent-sender branch in `/api/webhooks/whatsapp` (only fires on valid HMAC signature).
- Reminders go to the AGENT (email + WhatsApp) — `src/lib/crm/notify.ts`.

## PENDING — action items
1. **Apply RLS migration 052** (written, NOT applied — MCP was disconnected). Paste in Supabase SQL editor:
   ```sql
   alter table public.signature_requests   enable row level security;
   alter table public.crm_inbound_messages enable row level security;
   alter table public.gmail_sync_state      enable row level security;
   ```
2. **Admin password**: `src/app/api/auth/login/route.ts` still has `|| '123456'` fallback. User chose 123456 deliberately; harden = remove fallback + ensure `ADMIN_PASSWORD` set in Vercel. DEFERRED — user decision.
3. **Set `NEXT_PUBLIC_APP_URL=https://bestie.ldrsgroup.com`** in Vercel (app-wide correct domain).

## REMAINING P2 backlog (from the completeness audit, not built)
- Full quote field-edit before signing (only cancel/resend shipped). `PATCH /api/agent/quotes/[id]` + regenerate PDF while status='pending'.
- Deal: cancel / mark-complete / edit fundamentals pre-sign (`partnerships/[id]` actions).
- Dashboard: surface `status='active' && activity_completed_at IS NULL` ("activity pending") in the attention queue.
- Signature auto-expiry cron (`/api/cron/signature-expiry`) — currently expiry is computed client-side only.
- Parse-confidence badge on AI-imported quotes (`_confidence` already persisted in parsed_data).
- State-machine validation + one-time-use signature tokens.
- Data hygiene: store `invoices.paid_at` with time (currently `.slice(0,10)`); partial-unique on `users.whatsapp` for active agents; E.164 validation at onboarding.
- Rate-limit the public token endpoints (`/api/signatures/[token]/*`, `/api/invoices/[token]/upload`) via the Upstash `checkRateLimit` helper.
- Admin-side CRM client creation/assignment (currently agent-side only).
- WhatsApp reminder/ack **templates** (Meta approval) for delivery outside the 24h service window.

## Test agent
`https://bestie.ldrsgroup.com/admin` → username `ido` (created in prod DB). First login forces password change + profile. (Issue a fresh temp password via `/admin/agents` → reset if needed.)

## Verification approach used
No automated tests added — every flow verified end-to-end via live curl against the prod DB + full test-data cleanup each time (auth.users, accounts, partnerships, signature_requests, invoices, crm_inbound_messages, storage objects).
