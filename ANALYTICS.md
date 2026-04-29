# LDRS / Bestie — Analytics Tracking Reference

> Canonical event matrix for the GA4 + Meta Pixel + TikTok Pixel stack.
> Built for the PPC manager — every event the product fires, where it
> fires, what's sent, and how each platform receives it.

**Last updated:** 2026-04-28  
**Stack:** GA4 (`gtag.js`) + Meta Pixel (`fbq`) + TikTok Pixel (`ttq`) — direct, **not** GTM.  
**Server-side:** Meta Conversions API + TikTok Events API (gated on tokens).  
**Repo:** `src/lib/analytics/*` is the single source of truth.

---

## Pixel IDs

| Platform | ID | Env var |
|---|---|---|
| **GA4** | `G-19QBYHM5FP` | `NEXT_PUBLIC_GA4_ID` |
| **Meta Pixel** | `1499456848104955` | `NEXT_PUBLIC_META_PIXEL_ID` |
| **TikTok Pixel** | `D7IFRGRC77U32HD1FN00` | `NEXT_PUBLIC_TIKTOK_PIXEL_ID` |
| Meta CAPI access token | _not set_ | `META_CAPI_TOKEN` (server-only) |
| Meta CAPI test event code | _optional_ | `META_CAPI_TEST_CODE` |
| TikTok Events API token | _not set_ | `TIKTOK_EVENTS_TOKEN` (server-only) |

---

## 🎯 Conversions (mark these in each platform)

| # | Internal name | GA4 | Meta Pixel | TikTok Pixel | Server-side |
|---|---|---|---|---|---|
| 1 | **lead_form_submitted** | `generate_lead` | **Lead** | **SubmitForm** | ✅ CAPI + EAPI |
| 2 | **meeting_request_submitted** | `schedule` | **Schedule** | **Contact** | ✅ CAPI + EAPI |
| 3 | **service_brief_submitted** | `generate_lead` | **Lead** | **CompleteRegistration** | ✅ CAPI + EAPI |
| 4 | **support_form_submitted** | `generate_lead` | **Lead** | **SubmitForm** | ✅ CAPI + EAPI |
| 5 | **handoff_form_submitted** | `contact` | **Contact** | **Contact** | – (manual flow) |
| 6 | **widget_lead_submitted** | `generate_lead` | **Lead** | **SubmitForm** | – |

---

## 🔐 Identity (auto-injected on every event)

| Param | Source | Notes |
|---|---|---|
| `client_id` | UUID, generated once → `localStorage` | Stable per device |
| `session_id` | `chat_sessions.id` from server | Per Bestie chat |
| `account_id` | DB | Whose chat it is |
| `is_returning` | `localStorage.visit_count > 0` | – |
| `is_conference` | `?source=conf` was on the URL | – |

**`identify(email, phone, externalId, firstName, lastName)`** runs after every successful form submit:
- Hashes (SHA-256) → Meta `em` / `ph` / `external_id` Advanced Matching
- Hashes → TikTok `email` / `phone_number` / `external_id`
- Sets GA4 `user_id` for cross-device join

---

## 🌐 Attribution (captured once on first visit, stored in `localStorage`)

| Param | Source |
|---|---|
| `source` | `?source=…` URL param |
| `utm_source` / `utm_medium` / `utm_campaign` / `utm_term` / `utm_content` | URL UTM params |
| `referrer`, `referrer_host` | `document.referrer` |
| `landing_path` | `window.location.pathname` |
| `arrival_at` | timestamp |

Forwarded as `first_source` / `utm_*` on **every** subsequent event.

---

## 🌍 Global params (added to every `track()` call)

```
client_id, session_id, account_id,
is_returning, is_conference,
first_source, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
current_path, current_tab,
viewport_w, viewport_h, is_mobile, is_pwa, language,
time_in_session_sec
```

---

## 📊 Full Event Matrix

> ⚙️ = auto-fires (no manual code) · ✋ = explicit `track(...)` call · ⚙️🛠 = both
> ✅ = standard event in that platform · custom = `gtag('event', ...)` / `fbq('trackCustom', ...)` / `ttq.track(...)`

### A · Acquisition / Session lifecycle

| Event | Trigger | Where | GA4 | Meta | TikTok | Conversion? |
|---|---|---|---|---|---|---|
| `page_load` | First paint + every route change | ⚙️ root layout | ✅ `page_view` | ✅ `PageView` | ✅ `Pageview` | – |
| `arrival` | Once per session | ⚙️ first paint | custom | trackCustom | custom | – |
| `qr_scan_detected` | `?source=conf` present | ⚙️ first paint | custom | trackCustom | custom | – |
| `returning_visitor` | `localStorage.visit_count > 0` | ⚙️ first paint | custom | trackCustom | custom | – |
| `client_init` | UUID generated/loaded | ⚙️ first paint | custom | trackCustom | custom | – |
| `session_start` | Chat page loads | ⚙️🛠 chat page | custom | trackCustom | custom | – |
| `session_end` | `beforeunload` | ⚙️ root layout | custom | trackCustom | custom | – |
| `consent_shown` | Cookie banner shown | ⚙️ (planned) | custom | trackCustom | custom | – |
| `consent_given` / `consent_declined` | Banner action | ⚙️ (planned) | custom | trackCustom | custom | – |

### B · Navigation / Engagement

| Event | Trigger | Where | GA4 | Meta | TikTok |
|---|---|---|---|---|---|
| `route_change` | `usePathname` change | ⚙️ root | custom | trackCustom | custom |
| `tab_changed` | NavTabs click | ✋ chat page | custom | trackCustom | custom |
| `tab_first_view` | First time tab is shown in session | (planned) | custom | trackCustom | custom |
| `scroll_depth` | 25 / 50 / 75 / 100% reached | ⚙️ root | custom | trackCustom | custom |
| `viewport_focus` | Tab regains focus | ⚙️ root | custom | trackCustom | custom |
| `viewport_blur` | Tab loses focus | ⚙️ root | custom | trackCustom | custom |

### C · Chat (all account types)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `chat_message_sent` | Visitor sends a message | ✋ `[username]/page.tsx` `handleSendMessage` | custom | trackCustom | custom | `length`, `has_question`, `msg_index` |
| `chat_message_received` | Bot streaming `done` | ✋ `onDone` | custom | trackCustom | custom | `length`, `latency_ms`, `has_suggestions`, `response_id` |
| `starter_pill_clicked` | Empty-state pill | ✋ StarterPills `onSelect` | custom | trackCustom | custom | `pill_label`, `pill_index`, `total_pills` |
| `suggestion_pill_clicked` | Pill after a bot reply | ✋ pill render | custom | trackCustom | custom | `pill_label`, `pill_index`, `is_meeting_cta` |
| `topic_pill_clicked` | "גלו עוד" pill | (planned) | custom | trackCustom | custom | – |
| `chat_message_error` | LLM error in stream | (planned) | custom | trackCustom | custom | `error_code` |
| `chat_input_focused` | Input focus | (planned) | custom | trackCustom | custom | – |
| `chat_input_typed` | First keystroke | (planned) | custom | trackCustom | custom | – |
| `chat_stream_aborted` | User cancels | (planned) | custom | trackCustom | custom | – |

### D · Services Tab (`service_provider` archetype)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `services_loaded` | After fetch | ✋ ServicesCatalogTab | custom | trackCustom | custom | `count`, `ai_count`, `classic_count` |
| `service_card_opened` | Card click → modal | ✋ ServicesCatalogTab | custom | ✅ `ViewContent` | ✅ `ViewContent` | `service_id`, `service_name`, `is_ai` |
| `service_modal_closed` | Modal close | (planned) | custom | trackCustom | custom | – |
| `service_ask_clicked` | "שאל את הבוט" | (planned) | custom | trackCustom | custom | – |
| `service_brief_opened` | Brief form open | (planned) | custom | trackCustom | custom | – |
| `service_brief_step` | Step transition | (planned) | custom | trackCustom | custom | – |
| **`service_brief_submitted`** | Brief submit success | ✋ ServicesCatalogTab `handleSubmit` | ✅ `generate_lead` | ✅ **Lead** | ✅ **CompleteRegistration** | `service_id`, `service_name`, `goal`, `budget_range` |

### E · ForYou Tab (LDRS conference)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `foryou_loaded` | Tab data fetched | ✋ ConferenceForYouTab | custom | trackCustom | custom | `case_studies_count`, `reels_count`, `highlights_count` |
| `case_study_clicked` | Case-study card | ✋ CaseCard | custom | ✅ `ViewContent` | ✅ `ViewContent` | `brand_slug`, `position`, `product`, `variant` |
| `highlight_clicked` | Highlight thumbnail | ✋ HighlightCard | custom | ✅ `ViewContent` | ✅ `ViewContent` | `highlight_id`, `title`, `items_count`, `position` |
| `reel_clicked` | Reel thumbnail | ✋ ReelCard | custom | ✅ `ViewContent` | ✅ `ViewContent` | `shortcode`, `position`, `views`, `likes` |

### F · Lead Capture — Conference popup (`/chat/ldrs_group?source=conf`)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `lead_popup_triggered` | Popup mount | ✋ chat page `maybeShowLeadPopup` | custom | trackCustom | custom | `trigger` (msg_count / meeting_intent), `msg_count` |
| `lead_popup_closed_no_submit` | Closed without submit | ✋ ConferenceLeadPopup `onClose` | custom | trackCustom | custom | `msg_count` |
| **`lead_form_submitted`** | Submit success | ✋ ConferenceLeadPopup `onSubmitted` | ✅ `generate_lead` | ✅ **Lead** | ✅ **SubmitForm** | `source: 'conference_popup'`, `lead_id`, `msg_count` |
| **`meeting_request_submitted`** | Same submit | ✋ ConferenceLeadPopup `onSubmitted` | ✅ `schedule` | ✅ **Schedule** | ✅ **Contact** | `source: 'conference_popup'` |
| `meeting_intent_detected` | Regex match in user message | ✋ chat page | custom | trackCustom | custom | `source: 'user_message'` |
| `meeting_pill_clicked` | "נקבע פגישה?" pill | ✋ pill render | custom | trackCustom | custom | `pill_text` |
| `meeting_request_initiated` | Pill click → popup opens | ✋ pill render | custom | ✅ `InitiateCheckout` | ✅ `AddToCart` | `entry_point` |

### G · Lead Capture — Generic popup (all non-conference accounts)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `lead_popup_triggered` | Popup mount | ✋ LeadCapturePopup `useEffect` | custom | trackCustom | custom | `trigger: 'generic_popup'`, `username` |
| `lead_popup_closed_no_submit` | Closed without submit | ✋ LeadCapturePopup unmount | custom | trackCustom | custom | `username` |
| **`lead_form_submitted`** | Submit success | ✋ LeadCapturePopup `handleSubmit` | ✅ `generate_lead` | ✅ **Lead** | ✅ **SubmitForm** | `username`, `lead_id`, `source: 'generic_popup'` |
| `identify` | Same submit, after track | ✋ LeadCapturePopup | custom | `fbq('init', …)` Advanced Matching | `ttq.identify(…)` | `email_sha256`, `phone_sha256`, `external_id` |

### H · Personal handoff (LDRS conference) — WhatsApp bridge to Itamar

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `handoff_button_shown` | Button rendered | ✋ AskItamarButton `useEffect` | custom | trackCustom | custom | – |
| `handoff_button_clicked` | Button tap | ✋ AskItamarButton | custom | trackCustom | custom | – |
| `handoff_form_opened` | Modal open | ✋ AskItamarButton | custom | trackCustom | custom | – |
| `handoff_field_filled` | Blur on a field | (planned) | custom | trackCustom | custom | `field` |
| **`handoff_form_submitted`** | Submit success | ✋ AskItamarButton `submit()` | ✅ `contact` | ✅ **Contact** | ✅ **Contact** | `ref_code`, `has_phone`, `question_length` |
| `handoff_form_closed_no_submit` | Closed without submit | (planned) | custom | trackCustom | custom | – |
| `itamar_replied` | Webhook → DB row updated | (server-side) | – | – | – | `ref_code`, `latency_min` |
| `handoff_fallback_triggered` | Cron after 6h no reply | (server-side) | – | – | – | `ref_code` |

### I · Support form (brand / food / beauty / fashion archetypes)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `support_form_opened` | Mount | ✋ SupportForm `useEffect` | custom | trackCustom | custom | `username`, `initial_brand` |
| `support_form_step` | Step transition | (planned) | custom | trackCustom | custom | – |
| **`support_form_submitted`** | Submit success | ✋ SupportForm `handleSubmit` | ✅ `generate_lead` | ✅ **Lead** | ✅ **SubmitForm** | `username`, `brand` |
| `support_form_closed_no_submit` | Unmount without submit | ✋ SupportForm cleanup | custom | trackCustom | custom | `username`, `last_step` |
| `identify` | Same submit | ✋ SupportForm | custom | Advanced Matching | `ttq.identify` | `phone_sha256`, name hashed |

### J · Brand cards / Coupons (`EnhancedBrandCards`)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `brand_card_opened` | Card tap | ✋ EnhancedBrandCards | ✅ `view_item` | ✅ `ViewContent` | ✅ `ViewContent` | `brand_id`, `brand_name`, `has_coupon`, `category` |
| `coupon_revealed` | Coupon shown | (planned) | custom | ✅ `ViewContent` | ✅ `ViewContent` | – |
| `coupon_copied` | Tap → copied to clipboard | ✋ EnhancedBrandCards | ✅ `select_promotion` | ✅ `AddToCart` | ✅ `AddToCart` | `brand_id`, `coupon_code`, `discount_percent` |
| `coupon_redeemed_clicked` | Tap → external link | ✋ EnhancedBrandCards | ✅ `select_promotion` | ✅ `AddToCart` | ✅ `AddToCart` | `brand_id`, `target_url` |

### K · Products (`ProductsCatalogTab`)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `product_card_clicked` | Card tap (featured/rail) | ✋ ProductsCatalogTab | ✅ `view_item` | ✅ `ViewContent` | ✅ `ViewContent` | `product_id`, `product_name`, `placement`, `rail_title?` |
| `product_buy_clicked` | "Buy" CTA in modal | (planned) | ✅ `select_item` | ✅ `AddToCart` | ✅ `AddToCart` | `product_id`, `target_url` |

### L · Topics (`TopicQuestionsTab`)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `topic_question_clicked` | Question pill | ✋ TopicQuestionsTab | custom | ✅ `ViewContent` | ✅ `ViewContent` | `question`, `group_label`, `position` |
| `topic_card_clicked` | Top-level group card | (planned) | custom | trackCustom | custom | – |

### M · Content browse (`ContentBrowseTab`)

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `content_browse_loaded` | Tab fetch | (planned) | custom | trackCustom | custom | – |
| `content_filter_changed` | Filter pill | (planned) | custom | trackCustom | custom | – |
| `content_card_clicked` | Card tap | ✋ ContentBrowseTab `handleCardClick` | custom | ✅ `ViewContent` | ✅ `ViewContent` | `content_id`, `title` |

### N · External links / contact

| Event | Trigger | Where | GA4 | Meta | TikTok | Params |
|---|---|---|---|---|---|---|
| `instagram_profile_clicked` | IG link | (planned) | custom | trackCustom | custom | `target_username` |
| `whatsapp_link_clicked` | wa.me / tel: WhatsApp | (planned) | custom | ✅ **Contact** | ✅ **Contact** | `target` |
| `phone_clicked` | `tel:` | (planned) | custom | ✅ **Contact** | ✅ **Contact** | `phone_e164` |
| `email_clicked` | `mailto:` | (planned) | custom | ✅ **Contact** | ✅ **Contact** | `domain` |
| `external_link_clicked` | Any external href | (planned) | custom | trackCustom | custom | `target_host` |
| `share_clicked` | Web Share API | (planned) | custom | trackCustom | custom | – |

### O · Errors / Performance

| Event | Trigger | Where | GA4 | Meta | TikTok |
|---|---|---|---|---|---|
| `js_error` | `window.onerror` | ⚙️ root | custom | trackCustom | custom |
| `unhandled_promise_rejection` | `unhandledrejection` | ⚙️ root | custom | trackCustom | custom |
| `api_error` | `fetch` non-ok | (planned) | custom | trackCustom | custom |
| `slow_response` | LLM > 8s | (planned) | custom | trackCustom | custom |

### P · Embeddable widget (`public/widget.js` — host-site embed)

> The widget piggybacks on the host site's `gtag` / `fbq` / `ttq`
> if installed; silently no-ops otherwise.

| Event | Trigger | GA4 | Meta | TikTok |
|---|---|---|---|---|
| `widget_loaded` | Script ready | custom | trackCustom | custom |
| `widget_opened` | User taps trigger | custom | trackCustom | custom |
| `widget_closed` | User closes panel | custom | trackCustom | custom |
| `widget_message_sent` | User submits message | custom | ✅ `ViewContent` | `ClickButton` |
| `widget_message_received` | Bot reply done | custom | trackCustom | custom |
| **`widget_lead_submitted`** | Lead form submit | ✅ `generate_lead` | ✅ **Lead** | ✅ **SubmitForm** |

---

## 🛰️ Server-side conversion APIs

> Mirror of important client conversions. Same `event_id` is sent → Meta + TikTok dedupe.

| Endpoint | Server-side `track` calls | Meta CAPI | TikTok Events API |
|---|---|---|---|
| `/api/leads/conference` | `lead_form_submitted`, `meeting_request_submitted` | Lead, Schedule | SubmitForm, Contact |
| `/api/chat/lead` | `lead_form_submitted` | Lead | SubmitForm |
| `/api/briefs` | `service_brief_submitted` | Lead | CompleteRegistration |
| `/api/support` | `support_form_submitted` | Lead | SubmitForm |
| `/api/cron/handoff-fallback` | _logs only_ | – | – |

**No-op semantics:** if `META_CAPI_TOKEN` is missing, Meta CAPI silently no-ops; same for `TIKTOK_EVENTS_TOKEN` and TikTok EAPI. The client pixel still fires regardless.

**PII hashing (server side):** SHA-256 of `email.toLowerCase().trim()` and `phone.replace(/\D/g, '')` + first/last name. IP and User-Agent forwarded for Meta Advanced Matching.

---

## 🔧 Setup checklist

### Meta Events Manager
1. Verify pixel `1499456848104955` is firing → "Test Events" tab
2. **Mark as Conversion**: `Lead`, `Schedule`, `Contact`, `CompleteRegistration`
3. Aggregated Event Measurement ranking (iOS 14.5+ priority): `Lead` ≥ #1, `Schedule` #2, `Contact` #3, `ViewContent` #4
4. (Optional, recommended) Generate **CAPI access token** + create a **test event code** → set `META_CAPI_TOKEN` + `META_CAPI_TEST_CODE` in Vercel env

### Google Analytics 4
1. Verify in DebugView (set `?debug_mode=true` in URL or use the GA4 DebugView dimension)
2. **Mark as Conversion**: `generate_lead`, `schedule`, `contact`
3. Custom Definitions → register dimensions for: `source`, `is_conference`, `client_id`, `service_name`, `brand_slug`, `pill_label`, `username`
4. Link to Google Ads → Import conversions

### TikTok Events Manager
1. Verify pixel `D7IFRGRC77U32HD1FN00` via Test Event tool
2. **Mark as Conversion**: `SubmitForm`, `Contact`, `CompleteRegistration`, `ViewContent`
3. (Optional) Generate **Events API access token** → set `TIKTOK_EVENTS_TOKEN` in Vercel env

---

## 🐞 Debug

### Pixel-side
- **Meta**: Chrome → Meta Pixel Helper extension
- **TikTok**: Chrome → TikTok Pixel Helper extension
- **GA4**: Realtime + DebugView (auto-enabled if `?debug_mode=true`)

### Internal dispatcher
```js
// In DevTools console:
localStorage.setItem('ldrs_track_debug', '1');
location.reload();
// Every track() call now logs to console.
```

### Server-side
Vercel logs:
```
[conference-lead] CAPI dispatch failed: ...
[Lead API] CAPI dispatch failed: ...
[briefs] CAPI dispatch failed: ...
[Support] CAPI dispatch failed: ...
```

Successful Meta CAPI returns HTTP 200 with `events_received: 1`.  
Successful TikTok Events API returns `code: 0`.

---

## 📁 Code map

| Concern | File |
|---|---|
| Type-safe event names | `src/lib/analytics/types.ts` |
| Client dispatcher (gtag/fbq/ttq) + identify | `src/lib/analytics/track.ts` |
| Auto-tracking hook (page/scroll/focus/errors) | `src/lib/analytics/hooks.ts` |
| Pixel script tags | `src/components/AnalyticsLoader.tsx` |
| Mount point | `src/app/layout.tsx` (via `AnalyticsClient`) |
| Server-side CAPI / Events API | `src/lib/analytics/server-track.ts` |
| Widget (host-site embed) | `public/widget.js` |

---

## 🚦 Coverage status

| Surface | Client-side | Server-side |
|---|---|---|
| Chat page (all accounts) | ✅ full | – (no conversions on plain chat) |
| Services tab | ✅ full | ✅ via `/api/briefs` |
| Conference popup | ✅ full | ✅ via `/api/leads/conference` |
| Generic lead popup | ✅ full | ✅ via `/api/chat/lead` |
| Support form | ✅ full | ✅ via `/api/support` |
| Brand cards / coupons | ✅ full | – (no server endpoint) |
| Products catalog | ✅ partial (card click) | – |
| Topic questions | ✅ partial (question click) | – |
| Content browse | ✅ partial (card click) | – |
| ForYou tab (conference) | ✅ full | – |
| Handoff (Itamar WhatsApp) | ✅ full | – (server fires via webhook only) |
| Embeddable widget | ✅ full (host-piggyback) | – |

`(planned)` rows above are events whose payload is defined in `types.ts`
but whose call sites haven't been wired yet — they'll be added on demand
without changing the schema.
