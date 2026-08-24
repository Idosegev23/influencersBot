# Bestie as an inline surface — design

Status: approved in chat 2026-08-24 (Ido). Pilot account: LDRS (`ldrsgroup.com`, Webflow).

## Why

Bestie is a destination. A visitor has to notice a floating bubble and decide to
open it, and most never do. Everything the product can say — the persona, the
catalog, the case studies, the lead routing — sits behind that one decision.

Mounted inside the page, Bestie stops being a destination and becomes a surface
the visitor lands in. On LDRS's home page that means the first thing a brand
sees is an input that already knows what LDRS does, instead of two buttons that
lead to a form.

This is not a redesign of the widget. It is a third rendering surface for a
system that already has two.

## The finding that sets the scope

`src/lib/widget/banner.ts` already resolves this shape:

```
eyebrow · headline · subline · cta · art(gradient|image|video) · starters
```

That is a hero. It is already customer-editable in the dashboard (see
`2026-08-19-widget-editor-design.md`), already supports scheduled overrides with
a window, and already has two renderers — `public/widget.js` and
`src/components/chat/BannerHero.tsx` — reading one resolved shape.

The header of `banner.ts` reads "One schema, two surfaces." This design makes it
three. The inline surface renders the same resolved banner as its **resting
state**; the conversation itself stays an overlay, which is what widget.js
already builds today.

## Decisions taken

**Overlay, not in-flow growth.** When the visitor engages, the conversation
opens as a layer above the page. The host layout never reflows. This is the
decision that keeps the inline part small and cheap: only the invitation lives
inside the customer's DOM.

**Preset 1 — centered, headline preserved.** On LDRS the H1 stays exactly as it
is; Bestie sits centered beneath it, in place of the two CTA buttons. Rejected:
Bestie replacing the H1 (requires LDRS to give up the headline and the blur-in
animation built on it — a conversation to have with them, not a decision we
take), and any side-aligned placement.

**Mount target comes from config, not the script tag.** Existing installs need
no code change on the customer's site.

**Extend `public/widget.js`; scope a shadow root to the inline box only.**
Rejected: an iframe embed (an overlay must escape the iframe, which forces a
second full-viewport iframe and a postMessage dance, plus an extra document
above the fold and awkward mobile focus handling), and extracting a shared core
into a package (the right end state, but months of work that should follow a
proven sale, not precede it).

## Configuration

```jsonc
// accounts.config
"widget": {
  "inline": {
    "enabled": true,
    "selector": ".content_home-c-hero",   // produced by the picker
    "mode": "into",                        // into | replace | overlay
    "preset": "hero",                      // hero | bar
    "surface": "bare",                     // bare | glass | solid
    // measured by the picker; 0 = target has a fixed height, nothing to reserve
    "reserve": { "desktop": 0, "mobile": 0 },
    // "font": "inherit" means we set no font-family at all and let the host's
    // cascade through the shadow boundary. An explicit family overrides that.
    "theme": { "font": "inherit", "accent": "#4c3e5e", "radius": 999, "ground": "dark" },
    "bubble": "after-scroll"               // after-scroll | always | never
  }
}
```

`/api/widget/config` already runs on every load and already reads
`config.widget`, so this rides an existing request. Absence of
`config.widget.inline` means today's behavior exactly — floating bubble only.
No existing account changes.

### Mount modes

| Mode | Behavior | When |
| --- | --- | --- |
| `into` | Append as the last child of the target, in normal flow | The target is an existing content layer — the LDRS case |
| `replace` | Take over the target's box | An existing search input |
| `overlay` | Absolutely position over the target | The target has no content layer of its own |

`into` is the default the picker proposes when the target is a flex or grid
container. `overlay` is the only mode that mutates the host element (it sets
`position: relative` when the computed position is `static`); the other two do
not touch host styles at all.

### Mount resolution — three outcomes, none silent

1. **Found** — mount inline. Suppress the floating bubble until an
   `IntersectionObserver` reports the mount has scrolled out of view.
2. **Not found** — fall back to the floating bubble and call the existing
   `report()` diagnostics channel (`public/widget.js`, `type: 'inline_mount_missing'`)
   with the selector and path. A customer's theme change must not make the hero
   disappear into nothing.
3. **Found late** (SPA, lazy hydration) — a `MutationObserver` with a 5s
   deadline, then outcome 2.

A `report()` for outcome 2 is a hard requirement, not a nicety. `report()` is
capped and deduped already, so a repeated miss cannot flood.

## Rendering

### Shadow root scope

Only the inline box gets a shadow root. The overlay and panel stay `position:
fixed` children of `document.body` as they are today — they are not inside
anyone's layout, so there is nothing to isolate.

This scoping is also what makes the theming work. Inherited CSS properties cross
a shadow boundary; non-inherited ones do not. So `font-family` flows in from the
host page for free — provided we stop setting it, which today's
`updateContainerPosition()` does unconditionally — while the host's layout,
spacing and color rules stay out.

### The site sampler

At mount time, read from the host page via `getComputedStyle`:

| Token | Source |
| --- | --- |
| `font` | not set — inherited across the shadow boundary |
| `ground` (light/dark) | effective background of the mount target and its ancestors |
| `text` | computed `color` at the mount point |
| `radius` | `border-radius` of the nearest button/CTA |
| `accent` | `background-color` of the nearest primary button |

**Sampled values are proposed in the picker and saved to
`config.widget.inline.theme` after the customer approves them.** They are never
applied blind at runtime. A rule that flatters one account's palette can be
wrong on the next one; the same over-generalisation from a single account cost
us two rollbacks on the reel banner work.

### Presets

**`hero`** — centered column: the resolved banner headline (or none, when the
host page already has one), the input pill, and up to three starter chips.
**`bar`** — a single input row, no headline, no chips.

**Surface treatments:** `bare` (only the pill has a surface), `glass`
(`backdrop-filter` panel), `solid` (opaque). `glass` requires an opaque fallback
where `backdrop-filter` is unsupported or `prefers-reduced-transparency` is set.

**Mobile rule: the pill stays above the fold; the chips are expendable.** On a
390×700 viewport with a large headline, three chips wrap to two rows and push
the pill below the fold. Drop to two chips, then to zero, before the pill moves.

### `art: "host"` — a fourth art mode

`ResolvedBannerArt.mode` gains `host`, meaning *the host page provides the
background; draw nothing*. Without it an inline mount on LDRS would stack our
own reel `<video>` on top of the Webflow background video already playing —
two autoplaying videos in one hero.

`host` is the only valid art mode for `mode: "into"` and `mode: "overlay"`.
Enforce it in `resolveBanner`, not in the renderer, so both the widget and the
dashboard preview agree.

### Engaged state

On focus or submit, the resting box grows into the overlay. Because preset 1 is
centered, this is a scale from the box's own rect — not a panel appearing in a
corner. The host video keeps playing behind the blurred backdrop; the element is
never paused or swapped.

Page scroll locks while open. `Esc` and a backdrop click close it, and focus
returns to the pill.

On mobile the engaged state is the existing full-screen panel —
`inset:0; height:100dvh` with the `visualViewport` keyboard handling already in
`public/widget.js`. No new mobile state is written.

### One instance, two mounts

Not two copies of widget.js. One instance, one `sessionId`, one `messages[]`,
rendered into two places. A visitor who starts in the hero and scrolls past it
continues the same conversation in the bubble.

## Performance and layout stability

`into` mode inherits the target's box. On LDRS `.content_home-c-hero` computes to
`z-index:5; position:relative; display:flex; flex-flow:column; width:100%;
height:46.75rem` — a **fixed** height. Appending a flex child cannot change the
page height, so CLS on the pilot is zero by construction, and no `position`
override is needed.

That property does not generalise. For targets with `height:auto`, the picker
measures the rendered box and stores `reserve.{desktop,mobile}`; widget.js
applies the reserve as a `min-height` skeleton before config resolves, and
caches it in `localStorage` so a repeat visit paints immediately.

## The picker

Runs inside `/api/widget/preview/[accountId]`, which already fetches the
customer's real site server-side, strips `X-Frame-Options` and CSP
`frame-ancestors`, and injects `widget.js` into an admin iframe. Adding
`data-picker="true"` puts widget.js into a mode where hovering highlights
candidate elements and a click generates a stable selector and posts it to the
dashboard over `postMessage`.

The dashboard then shows the proposed mode, preset, sampled theme and measured
reserve, renders a live preview on the customer's own page, and saves to
`config.widget.inline` on approval.

**Selector stability rule:** prefer an `id`, then a single class that matches
exactly one element, then a short structural path. Never emit a selector
containing a Webflow-generated hash or an `:nth-child` chain deeper than two —
those break on the customer's next publish, and outcome 2 above is a fallback,
not a plan.

## Analytics

`widget_loaded` is the only signal that proves a customer installed anything,
and `/admin/health` is built on it. `widgetTrack` takes a free-form payload, so
add `surface: 'inline' | 'floating'` and `mount_preset` to `widget_loaded` and
to the funnel events. Without this, inline installs are indistinguishable from
floating ones at exactly the moment the distinction starts to matter.

## LDRS pilot

- Preset `hero`, mode `into`, target `.content_home-c-hero`, surface `bare`,
  art `host`, bubble `after-scroll`.
- Sampled theme: font inherited (Google Sans), ground dark, accent `#4c3e5e`.
- Entrance must wait for their H1 blur-in to finish. Their embed sets
  `html.ldrs-h1-lock` with a 3s failsafe; mount when the class clears or after
  3.2s, whichever comes first. Bestie must not animate in against the headline.
- Legibility over moving video: a local scrim behind the pill, not a
  full-hero darkening, and honour `prefers-reduced-transparency`.
- The conversation's job is qualification and routing. The two lead lanes
  already exist (brand/agency → Itamar, Roei, Kfir; creator/job-seeker →
  Sharon); the inline surface feeds them from the first second of the visit
  instead of from a form.

## Testing

- Unit: mount resolution (found / missing / late), selector generation and the
  stability rule, `art: "host"` enforcement in `resolveBanner`, sampler token
  extraction from a fixture computed-style, the mobile chip-drop rule.
- Unit: config absence produces today's behavior byte-for-byte.
- Manual on the pilot: the host video still plays during and after the overlay;
  page height unchanged with the mount present; bubble appears only after the
  mount scrolls out; session continues across both mounts; keyboard on iOS
  Safari does not cover the composer.

## Out of scope

Shopify/WordPress app blocks, an npm React package, auto-detecting a site's
search input, `bar` preset go-to-market, extracting `@bestie/core`, and any
change to the floating widget's own appearance. Each is a separate decision that
should follow evidence from the pilot.

## Open questions

1. Does LDRS agree to give up the two hero CTAs? Preset 1 places Bestie where
   they sit. If they want both, the hero gets crowded and we should revisit.
2. Who approves the Hebrew copy in the pilot's resting state and first turn?
   The reel-banner copy on `/chat/danielamit` shipped unapproved and is still
   Claude's writing.
3. `bubble: "after-scroll"` needs a threshold. Proposal: the bubble appears once
   the mount is fully out of view, not on first pixel.
