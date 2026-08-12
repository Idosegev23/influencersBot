# Widget Demo Link on Demo-Scan Completion — Design

**Date:** 2026-08-12
**Status:** Approved

## Problem

When a demo account finishes the QStash scan pipeline, the team WhatsApp notification
(`demo_ready_v1`) carries a single URL button that opens `/chat/<slug>`. The widget demo
page `/demo/<accountId>` — the customer's own site with the real widget injected — already
exists but is never sent. The team has to build that link by hand.

## Goal

Demo-scan completion sends ONE WhatsApp message with TWO buttons: chat demo + widget demo.

## Non-Goals

- No new "widget account" entity — the widget already works for every account via
  `widget.js?data-account-id`.
- `account_ready_v1` (real/full scans) is unchanged.
- No changes to the `/demo/[id]` page or widget config generation.

## Design

### 1. New WhatsApp template: `demo_ready_v2`

- Category UTILITY, language `he`, body identical to v1 (`{{1}}` = brand name).
- Two URL buttons:
  - index 0 — "לצ'אט" → `https://bestie.ldrsgroup.com/chat/{{1}}` (param = username slug)
  - index 1 — "לדמו הווידג'ט" → `https://bestie.ldrsgroup.com/demo/{{1}}` (param = accountId)
- Submitted via Meta Graph API with a one-off script
  `scripts/create-wa-template-demo-ready-v2.ts`.

### 2. `src/lib/whatsapp-notify.ts`

- `runTemplate` gains `urlButtonParams?: string[]` — one button component per array index.
  The existing single `urlButtonParam` stays for backward compatibility.
- `sendDemoReady` gains `accountId` and sends `demo_ready_v2` with both button params.
- **Approval-window fallback:** if the v2 send fails (template missing/unapproved,
  e.g. Meta error 132001), fall back to `demo_ready_v1` with the chat button only.
  Code deploys immediately; behavior upgrades itself once Meta approves.

### 3. `src/lib/pipeline/notify.ts`

- `notifyScanComplete` already has `job.account_id`; pass it through to `sendDemoReady`.
  Only the `isDemo === true` path changes.
- `pickTeamSend` signatures align so the demo sender receives `accountId`.

### 4. Testing

- Unit: `runTemplate` with two URL buttons emits button components with index 0 and 1.
- Unit: v2 failure falls back to v1.
- Live (post-approval): updated `scripts/send-wa-demo-ready.ts` accepts accountId;
  verify the `/demo/<accountId>` link opens with the widget.
