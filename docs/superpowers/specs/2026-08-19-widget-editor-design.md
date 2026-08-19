# Widget editor in the customer dashboard — design

Status: approved in chat 2026-08-19 (Ido). Covers phases 1 and 2.
Phase 3 (persona + knowledge-base detail) is named at the end but not specified here.

## Why

A customer can change a handful of widget fields today, in two places, and
neither is where they live. `/manage/[token]` is a link-auth page with three
tabs; the real dashboard at `/influencer/[username]/` holds their persona,
documents, products and analytics but cannot touch the widget. Anything the
widget actually says — the starters, the reel, the teaser — is changed by us,
by hand, in the database.

The second problem is time. Promotions are the shortest-lived thing a brand
publishes and the easiest to forget: ברא's site still carried a promotion dated
to the end of the month, and the only reason our bot spoke about it correctly
was that someone re-scanned that week. A customer who edits a headline for a
sale has to remember to change it back.

## Decisions taken

**Surface: the dashboard.** `/influencer/[username]/`, behind login. The
persona and knowledge bases already live there, and putting widget control
beside them means one place to answer "what does my bot look like and know".
`/manage/[token]` keeps its current fields and does not grow; it is a
convenience link, not the product.

**Editing is manual, scheduling is optional.** No rules engine, no per-page
conditions. The customer writes what they want and may state a window.

## Model: a default plus scheduled overrides

The default banner is what the widget shows the rest of the year. An override
is a partial banner with a window; while the window is open its fields are
merged over the default, and when it closes it simply stops existing.

```jsonc
// accounts.config
{
  "widget": { "banner": { /* the default: eyebrow, headline, subline, cta, starters, art */ } },
  "chat":   { "banner": { /* optional per-surface default, as today */ } },
  "reels":  [ /* account-level rotation, as today */ ],

  "overrides": [
    {
      "id": "autumn-sale",
      "from": "2026-08-20",          // inclusive, Asia/Jerusalem
      "until": "2026-08-31",         // inclusive
      "surface": "both",             // "widget" | "chat" | "both"
      "eyebrow": "מבצע החודש",
      "headline": "20% על סדרת הפטריות",
      "teaser": "מבצע עד סוף החודש 🍄",
      "starters": { "items": ["מה כלול במבצע?", "עד מתי זה בתוקף?"] }
    }
  ]
}
```

Why a layer rather than editing the fields directly: the promotion removes
itself. Direct editing means every sale ends with someone remembering to undo
it, and the failure is silent — a stale offer reads as a live one.

### Resolution

`resolveBanner(config, surface, ctx)` already owns the fallback ladder for both
renderers and is covered by 55 tests. It gains one step, before everything else
it does:

1. Pick the overrides whose window contains "now" and whose `surface` matches.
2. Merge them over the surface's default, in array order — later wins, so two
   overlapping promotions resolve predictably rather than by accident.
3. Continue exactly as today.

Merging is per field, unlike the surface fallback which is deliberately
whole-object. The difference is intentional: a surface fallback answers "which
banner is this", where an override answers "what changed for now", and a promo
that only replaces the eyebrow should not blank the headline.

**Time zone.** Windows are dates, not timestamps, and are evaluated in
`Asia/Jerusalem` regardless of where the code runs. A promotion ending on the
31st ends at the close of the 31st in Israel; on Vercel, UTC would end it three
hours early.

**Freshness.** `/api/widget/config` sets no cache headers today and must keep
it that way, or a window will open or close late by however long a CDN holds
the response.

## What becomes editable

Already editable: eyebrow, headline, subline, CTA label and prefill, art mode,
starters *label*, colour, cover, modules.

Added here:

- **Starter questions themselves.** Today the customer can title the row but
  not write the questions; the list falls back to `/api/widget/chips`. Writing
  them pins the list — which is a real choice, so the editor states that pinned
  questions stop updating on their own.
- **Reel selection.** Choose from the reels already scanned and persisted, as a
  grid of poster frames with the vision picker's score shown. Selection only —
  uploading video is not in scope, and `config.reels` stays the switch.
- **Teaser and tooltip text.** The two invitation bubbles are the widget's
  first words and are currently locale defaults nobody can change.
- **Live preview** beside the editor.

## Preview

Render the real widget, not a facsimile. `WidgetPreview.tsx` is a React
re-implementation of the widget chrome that has already drifted from it — wrong
cover height, wrong avatar size, a hardcoded palette. The editor embeds
`/api/widget/preview/[accountId]` in an iframe and posts draft config into it,
so the preview is `public/widget.js` itself and cannot drift.

The draft is held in the editor and pushed to the iframe on change; nothing is
written until save. Reels play in preview as they will in production.

## Out of scope

Uploading video or images beyond today's cover upload. Per-page or per-audience
conditions. A/B testing. Editing the chat page's tabs. Phase 3 — persona detail
and knowledge-base inventory — is a separate design.

## Risks

- **Two defaults and a list of overrides is more state than "one banner".** The
  editor must always show which one is live right now, or the customer will
  edit the default while a promotion is covering it and conclude nothing works.
- **Pinned starters go stale**, by definition. Worth a nudge in the editor when
  a pinned list has not been touched in some months.
- Overrides are the first thing in this config that expires on its own; nothing
  else in `accounts.config` has a clock. A window that never closes because a
  date was mistyped is a stale promotion with no error anywhere.
