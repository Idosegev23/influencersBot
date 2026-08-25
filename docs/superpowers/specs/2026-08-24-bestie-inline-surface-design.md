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
    "enabled": true,                       // true | false | "preview"
    "selector": ".content_home-c-hero",   // produced by the picker
    // Path PREFIXES the mount is allowed on. Absent/null = every page.
    // The embed is site-wide but every real selector is page-specific: without
    // a scope, every non-home pageview runs a document-wide MutationObserver
    // for 5s and then files an `inline_mount_missing` diagnostic for something
    // that is not a fault. Prefixes only — no regex or glob from config.
    "paths": ["/he", "/en"],
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

**As built, the picker always proposes `into`** — there is no flex/grid
detection deciding between modes; `replace` and `overlay` exist as stored
values `resolveInlineMount` accepts, but nothing in the customer-facing flow
offers them yet (operator-set only, by hand in the database — see "Out of
scope" below). `overlay` is the only mode that mutates the host element (it sets
`position: relative` when the computed position is `static`); the other two do
not touch host styles at all.

### Preview mode

`enabled` is a tri-state. `"preview"` mounts the inline surface **only** for a
visitor who arrived with `?bestie=1`, recorded in `sessionStorage` so it
survives navigation within the site. Every other visitor sees exactly today's
behavior — floating bubble, nothing else.

This is how a customer tastes the feature: their real site, their real domain,
their real hero video, with no deploy on their side and no exposure to their
traffic. What we hand over is a link, not an installation. Going live is
flipping `"preview"` to `true` in the dashboard — no deploy on our side either.

The preview flag must not leak into analytics as a real install: events emitted
while in preview mode carry `preview: true` and are excluded from the
`/admin/health` install signal.

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

A **fourth**, silent outcome sits before all three: a page outside
`inline.paths`. Nothing is resolved, no observer is created, and nothing is
reported — the mount was never meant to be there. This is what keeps outcome 2
a signal rather than a per-pageview stream.

The mount also refuses a target that is `<html>`, `<body>`, `<head>`, or an
ancestor of the widget's own container, whatever the selector says. `mode:
"replace"` on `body` would otherwise run `html.replaceChild(div, body)` and
delete the customer's page. A refusal reports `inline_mount_missing` with a
message that distinguishes it from a plain miss, and falls back to the bubble.

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

### The site sampler — built

Runs once, at pick time, inside the picker (`pickerSampleTheme()` in
`public/widget.js`) — not on every real visitor's page load. A real visitor's
browser never samples anything; `mountInline()` only ever applies the
`theme` object already resolved from `config.widget.inline`, whatever that
was the last time someone approved a pick.

| Token | How it's read |
| --- | --- |
| `font` | never sampled — always `'inherit'`. Inherited CSS properties cross the shadow boundary on their own, so the honest answer is to set no `font-family` at all and let the host's cascade through. |
| `ground` (`light`/`dark`) | walk from the clicked element up through its ancestors reading `getComputedStyle(node).backgroundColor`; the first non-transparent one wins. Defaults to `light` if nothing on the way up has a background — an unstyled page is white. |
| `accent` | `background-color` of the site's own call-to-action, found by scanning ordered candidate selectors (`a[class*="btn"]`, `a[class*="button"]`, `.btn`, `.button`, `button`, `[role="button"]`, `a`) inside the picked element first, then the whole document, taking the first candidate that actually has a background of its own. This is selector-likelihood order, not proximity — it exists because the first `<a>` inside a hero is usually a bare text link, and sampling that yields transparent-black. |
| `radius` | `border-top-left-radius` of that same CTA, capped at 32px so a pill-shaped button (which computes near 999px) doesn't turn a full-width surface into a stadium. |

There is no `text`/foreground-color token — an earlier version of this design
proposed sampling one; it was never built, and nothing reads a `text` field
today (`ResolvedInlineTheme` has exactly `font`/`accent`/`radius`/`ground`).

**Sampled values are proposed, never applied blind.** The picker posts them
in the `ibot:picked` message (see "The picker" below); the dashboard shows
them and only writes to `config.widget.inline.theme` once the customer saves.
A sample that cannot be read (no CTA found, everything transparent) is simply
not proposed — `theme.accent`/`radius` come back `null` rather than a guess.
A rule that flatters one account's palette can be wrong on the next one; the
same over-generalisation from a single account cost us two rollbacks on the
reel banner work.

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

## The picker — built

Runs inside `/api/widget/preview/[accountId]`, which already fetches the
customer's real site server-side, strips `X-Frame-Options` and CSP
`frame-ancestors`, and injects `widget.js` into an admin iframe
(`WidgetDraftPreview.tsx`). Picker mode rides the same `window.postMessage`
channel that already carries `ibot:preview-ready` (widget → dashboard, frame
booted) and `ibot:draft` (dashboard → widget, live-edit payload), rather than
a new attribute or channel:

- **`ibot:picker` (dashboard → widget)** — `{ type: 'ibot:picker', on: boolean }`.
  Turns picker mode on/off inside the iframe. While on, hovering highlights
  the element under the cursor and a click is captured instead of followed.
- **`ibot:picked` (widget → dashboard)** — posted once, on click:
  `{ type: 'ibot:picked', selector, label, mode: 'into', reserve: {desktop, mobile}, theme }`.
  `reserve` here is the clicked element's *own* measured height, not yet
  zeroed — `WidgetDraftPreview.tsx`'s listener is what zeroes it for
  `mode: 'into'` (appending inside the target would otherwise double the
  element) while keeping the raw number as `measured`, purely for the "this
  is 748px tall" summary. The picker itself only ever proposes `mode: 'into'`;
  `replace` and `overlay` are not offered from a click today (see "Out of
  scope" below).

**Selector rule, as actually implemented:** prefer an `id`, then the first
single class that matches exactly one element on the page, then the shortest
class chain (two classes, then three) that does. Nothing else is ever
proposed — no descendant combinators, no `:nth-child`, no attribute
selectors. The grammar this allows is exactly `#id` or
`.a[.b[.c]]` (regex: `^(#[A-Za-z_][\w-]*|\.[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*){0,2})$`),
kept as two hand-written copies — `PICKER_STORABLE` in `public/widget.js`
(gates what the picker will even attempt to emit) and `STORABLE_SELECTOR`
behind `isUnsafeSelector` in `src/lib/widget/inline.ts` (gates what
`resolveInlineMount` will store) — pinned against each other by a shared
corpus test (`picker-mode.test.ts`) so the two cannot silently drift apart.
Anything outside that shape is refused at save time, whatever produced it.

**Why an allowlist, not a blocklist.** The first version refused selectors by
pattern-matching for `html`/`body`/`head`. Two rounds of patching individual
bypasses — `body,.foo` (a selector *list* resolves to the first
document-order match across every member), `body:not(.x)` (a pseudo-class
narrows a match without retargeting it), then `*`, `:root`, `:is(body)`,
`:where(body)`, `:has(body)`, `:has(> body)`, `:is(body,.foo)`,
`body[title="a b"]` — proved a blocklist of dangerous spellings is
unwinnable: deciding what a selector *resolves to* is a parsing problem, and
`:is()`/`:where()`/`:has()`/`:not()` hide arbitrary content from any
string-level parser that isn't a real CSS engine. The fix was to stop trying
to enumerate what to refuse and instead enumerate the one shape the picker
actually needs to emit — an id or a short class chain — and refuse
everything else, including every spelling above and every one nobody has
thought of yet.

**The save-time grammar is not the safety guarantee.** `<body class="page">`
with a saved selector of `.page` passes `STORABLE_SELECTOR` — a class that
merely sits on `<body>` is indistinguishable from an ordinary content class
at the string level, and no grammar fixes that. The actual guarantee is
`inlineTargetIsSafe()` in `public/widget.js`, called from `mountInline()` on
every real page load: it compares the *resolved element* against
`document.documentElement`/`body`/`head` and against Bestie's own container,
by identity, once a DOM exists to ask — the only place that question can
honestly be answered. A selector that clears the save-time grammar but
resolves to `<body>` on some page still gets refused there, falls back to the
floating bubble, and reports `inline_mount_missing`. The grammar's job is
narrower: stop the obviously-wrong thing from ever being *stored*, not
replace the runtime check.

(`isStableSelector()` also exists in `src/lib/widget/inline.ts` — a second,
looser heuristic that flags builder-generated hash classes and deep
`:nth-child` chains as *unstable* rather than unsafe. It is exported and
unit-tested but not yet called from the save path or the picker; today
nothing acts on it.)

The dashboard shows the proposed mode, preset, sampled theme and measured
reserve, renders a live preview on the customer's own page, and saves to
`config.widget.inline` on approval (`mountFromPick` → `inlineForPost` →
`/api/influencer/settings` → `resolveInlineMount`). A pick against a
brand-new mount (no existing `config.widget.inline`) always saves with
`enabled: 'preview'`, never straight to live — going live is a separate,
deliberate toggle in the dashboard, not a side effect of picking a spot.
Re-picking a spot on an *existing* mount preserves whatever
`enabled`/`preset`/`surface`/`bubble`/`paths` it already had; only the
selector, mode, reserve and theme come from the new pick.

## Analytics

`widget_loaded` is the only signal that proves a customer installed anything,
and `/admin/health` is built on it. `widgetTrack` takes a free-form payload, so
add `surface: 'inline' | 'floating'` and `mount_preset` to the funnel events.
Without this, inline installs are indistinguishable from floating ones at
exactly the moment the distinction starts to matter.

`widget_loaded` itself always reports `surface: 'floating'`, deliberately: it
fires before mount resolution finishes and long before the 5s late-mount
deadline, so an `'inline'` claim there means only "the config carried a mount"
— which is equally true of a selector the customer's theme renamed and of every
page the mount is not scoped to. The honest signal is a separate
`widget_inline_mounted` event, emitted from `mountInline()` once the surface is
actually in the page and carrying `mount_preset`. `mount_preset` stays on
`widget_loaded` as the "a mount was configured for this pageview" dimension.

## LDRS pilot

- Preset `hero`, mode `into`, target `.content_home-c-hero`, surface `bare`,
  art `host`, bubble `after-scroll`.
- Sampled theme: font inherited (Google Sans), ground dark, accent `#4c3e5e`.
- **Blocking fix before anything is shown to them:** `config.widget.primaryColor`
  is `#6ec1e4`, a pale blue that appears nowhere on their site — it is
  Elementor's stock primary, seeded automatically and never corrected. The
  floating bubble survives it by hovering above the page; an inline hero will
  not. Correct it by hand first, then check whether the sampler would have
  reached the same answer unaided. That check is the cheapest evidence we will
  get that the sampler works, and LDRS is a safer place to find out than a
  paying account.
- Verified 2026-08-24: `widget.js` is already installed in their `<head>` with
  `data-account-id="de38eac6-d2fb-46a7-ac09-5ec860147ca0"` and `defer`;
  `config.widget.domain` is `ldrsgroup.com`; `.content_home-c-hero` is identical
  on `/he` and `/en`, so one selector covers the site. Nothing is installed on
  their side for this feature.
- Entrance must wait for their H1 blur-in to finish. Their embed sets
  `html.ldrs-h1-lock` with a 3s failsafe; mount when the class clears or after
  3.2s, whichever comes first. Bestie must not animate in against the headline.
- Legibility over moving video: a local scrim behind the pill, not a
  full-hero darkening, and honour `prefers-reduced-transparency`.
- The conversation's job is qualification and routing. The two lead lanes
  already exist (brand/agency → Itamar, Roei, Kfir; creator/job-seeker →
  Sharon); the inline surface feeds them from the first second of the visit
  instead of from a form.

## Known gaps

Two places where what shipped is thinner than the config schema suggests:

- **No "pause but keep the pick" state.** `config.widget.inline.enabled` is a
  two-value tri-state (`true` | `'preview'`) — there is no stored "off, but
  remember the selector/theme/reserve for later." An earlier draft of the
  editor UI offered an in-session `enabled: false` that looked like a pause
  button, but it lied: the summary still showed the picked spot as configured
  while the next save actually deleted `config.widget.inline` outright (same
  outcome as pressing remove, just not labelled as destructive). It was taken
  back out. Today, off means gone — the customer re-picks from scratch to turn
  a mount back on. A real pause state would need to become a third stored
  value in `ResolvedInlineMount`/`resolveInlineMount` first; nothing in the
  editor should invent one client-side again.
- **`paths` has no editor UI.** `resolveInlineMount` and every save-path
  function (`inlineForPost`, `mountFromPick`) carry an existing `paths` value
  through untouched — dropping it would silently reintroduce a document-wide
  `MutationObserver` on every pageview plus a false `inline_mount_missing`
  report on every page the selector never existed on (see "Mount resolution"
  above). But nothing in `InlineMountSection` lets a customer set or change
  it. Today it can only be set by hand in the database; the picker always
  proposes a mount with `paths: null` (every page) unless one already existed
  on the mount being re-picked.

## Testing

- Unit: mount resolution (found / missing / late), the save-time selector
  grammar (`isUnsafeSelector`) pinned against the picker's own copy
  (`picker-mode.test.ts`), `art: "host"` enforcement in `resolveBanner`, the
  mobile chip-drop rule.
- Unit: config absence produces today's behavior byte-for-byte.
- Unit: `enabled: "preview"` mounts only with `?bestie=1` / the sessionStorage
  flag, and its events carry `preview: true`.
- Unit: the whole picked-to-stored chain in one test
  (`tests/unit/widget/picker-round-trip.test.ts`) — the real `ibot:picked`
  message a booted `public/widget.js` posts for a real click, through the
  real `WidgetDraftPreview` → `mountFromPick` → `inlineForPost` →
  `resolveInlineMount`, rather than each stage's own test asserting only
  against a hand-typed fixture of the stage before it.
- Manual on the pilot: the host video still plays during and after the overlay;
  page height unchanged with the mount present; bubble appears only after the
  mount scrolls out; session continues across both mounts; keyboard on iOS
  Safari does not cover the composer.

## Out of scope

Shopify/WordPress app blocks, an npm React package, auto-detecting a site's
search input, `bar` preset go-to-market, extracting `@bestie/core`, mount
`mode` selection by the customer (the picker always proposes `into`; `replace`
and `overlay` stay operator-set), and any change to the floating widget's own
appearance. Each is a separate decision that should follow evidence from the
pilot.

## Open questions

1. Does LDRS agree to give up the two hero CTAs? Preset 1 places Bestie where
   they sit. If they want both, the hero gets crowded and we should revisit.
2. Who approves the Hebrew copy in the pilot's resting state and first turn?
   The reel-banner copy on `/chat/danielamit` shipped unapproved and is still
   Claude's writing.
3. ~~Bubble threshold.~~ Decided: the bubble appears once the mount is **fully**
   out of view, not on first pixel.
