# Argania — Support Requests Interface (mirror of LA BEAUTÉ)

**Date:** 2026-06-08
**Account:** Argania (`c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1`), username `argania_group`, domain `argania-oil.co.il`, archetype `brand`.

## Goal
Give Argania the same support-request capability LA BEAUTÉ has: customers open support requests from the embedded widget; the Argania team gets notified (email + WhatsApp) and manages tickets in a branded dashboard.

## Guiding principle
**Reuse, don't reinvent.** Nearly the whole support stack (`support_requests`, `support_ticket_history`, the `/influencer/[username]/support` dashboard, `/api/support` notifications, WhatsApp templates, realtime) is already account-agnostic. Branding lives in the account `config`. This is mostly configuration + filling two real gaps.

## The two real gaps
1. The admin widgets UI (`/admin/websites`) can toggle the `support` module but has **no editor** for the support contact email, and **no field at all** for a support WhatsApp phone. The user expects to set both there.
2. There is no branded login entry point for Argania (LA BEAUTÉ has `/labeaute/login`).

## Scope (approved)
- **Both** widget support entry points → the embedded `widget.js` already renders one support form driven by `config.widget.modules.support` with categories `order/product/return/other` + an order-number field. Enabling the module covers product/order **and** general. No widget.js change.
- **Notifications:** email to Argania team + WhatsApp to team. `/api/support` already reads `config.support_email` and `config.support_whatsapp_phone` and sends via the existing (account-agnostic) `brand_support_ticket` template. No notification code change.
- **Dashboard access:** dedicated branded page `/argania/login`, single shared password (`123456` for now). Reuses the existing influencer-cookie auth and the existing `/influencer/argania_group/support` dashboard.

## Changes

### 1. Admin API — `src/app/api/admin/websites/route.ts`
- **GET:** add `supportWhatsappPhone: config.support_whatsapp_phone || null` to each website row.
- **PATCH:** add a third, mutually-exclusive mutation type — contact update — alongside master-toggle and module-toggle. Body `{ accountId, contact: { supportEmail?, supportWhatsappPhone? } }`. Persists to **top-level** `config.support_email` / `config.support_whatsapp_phone` (where `/api/support` and the GET read them). Light normalization: trim email; strip spaces/dashes from phone; empty → `null`.

### 2. Admin UI — `src/app/admin/websites/page.tsx`
- Extend `WebsiteAccount` with `supportWhatsappPhone: string | null`.
- In `WebsiteCard`, when the support module is on, render a small contact block: email input + WhatsApp phone input + Save (own saving state). New `handleSaveContact` posts the `contact` PATCH.

### 3. Branded login — `src/app/argania/login/page.tsx` (new)
- Mirror `/labeaute/login` structure, **single password only** (no first/last name).
- Branding pulled from the account (not hardcoded): fetch a lightweight public source for `display_name` / `primaryColor` / `profile_pic` (reuse `/api/widget/config?accountId=…` which already returns `brandName`, `theme.primaryColor`, `profilePic`). Fallback to Argania green `#2d5016`.
- POST `/api/influencer/auth` `{ username: 'argania_group', password }` → on success redirect to `/influencer/argania_group/support`.
- If already authed (cookie), skip to the dashboard.

### 4. Dashboard redirect — `src/app/influencer/[username]/support/page.tsx`
- Mirror the existing `labeaute.israel` redirect: when `username === 'argania_group'` and not authenticated, `router.push('/argania/login')`.

### 5. DB config (one-off script, service role)
- `config.widget.modules.support.enabled = true` (or via the admin toggle).
- `security_config.admin_password_hash = hashPassword('123456')` (PBKDF2, 100k iters, SHA-256, `salt:hash` — matches `verifyPassword`).
- Email + WhatsApp phone: left for the user to set in the admin UI.

## Out of scope (YAGNI)
Daily support report, Itamar-style personal WhatsApp handoff, brand analytics page, per-agent login.

## Verification
- `npm run type-check`.
- Hit `/api/influencer/auth` with `argania_group` + `123456` → cookie set; dashboard loads.
- Enable support module + set a test email/phone in admin → submit a widget support request on prod → `support_requests` row created + email/WhatsApp sent.
