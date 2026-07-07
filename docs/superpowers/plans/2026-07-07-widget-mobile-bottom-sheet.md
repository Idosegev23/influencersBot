# Widget Mobile Bottom-Sheet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the widget's full-screen mobile takeover with a modern bottom-sheet (dimmed backdrop, slim header, keyboard-safe input, scroll-aware bubble) — mobile only, desktop untouched.

**Architecture:** All mobile behavior is gated on `window.innerWidth < 640`. The mobile panel becomes a `position:fixed;bottom:0` rounded-top sheet (~88dvh) sitting over a dimmed backdrop; a single `attachSheetBehaviors()` post-render hook wires backdrop-tap-close, drag-to-dismiss, and `visualViewport` keyboard resizing. The 6–7 duplicated `panelStyle` mobile branches collapse into one `mobilePanelStyle()` helper. The closed bubble shrinks away on scroll-down so it never covers host-site UI.

**Tech Stack:** vanilla JS in `public/widget.js` (IIFE, `var`, inline styles). No unit-test harness for widget.js — verify with `node --check public/widget.js` per task + manual device testing (iOS Safari + Android Chrome).

## Global Constraints

- **Mobile only:** every change gated on `var isMobile = window.innerWidth < 640`. Desktop rendering (the 400px card + the `#ibot-close` pill) MUST be byte-identical after each task — do not alter any desktop branch.
- **Sheet:** `position:fixed;left:0;right:0;bottom:0;top:auto;width:100%;height:88dvh;max-height:92dvh;border-radius:20px 20px 0 0;` (replaces `top:0;...;height:100%;border-radius:0`). Enter animation reuses the existing `ibot-slide-up`.
- **Backdrop:** a `position:fixed;inset:0;background:rgba(0,0,0,0.45);` element with id `ibot-backdrop`, z-index below the panel; tap closes the widget.
- **No cover on mobile:** the welcome header's 112px cover image + 84px overlapping logo is NOT rendered on mobile; a slim ~56px header (small logo + brand name + "זמין" status + `×`) is used for both welcome and chat states.
- **Keyboard:** use `window.visualViewport` (feature-detected) to keep the sheet sized to the visible viewport so the input stays above the keyboard; fallback = leave as-is.
- **Scroll-lock:** while the sheet is open on mobile, lock host-page scroll (the existing `render()` scroll-lock stays and is extended to cover the backdrop).
- **Style idiom:** match the file — string-concatenated inline styles, `var`, `function`, inline `onclick`/`ontouchstart`. No ES modules/`const`/arrow if the surrounding code doesn't use them (the file mixes both; follow the local block).
- **Git:** commit each task straight to `main`, stage ONLY `public/widget.js`. A parallel session may be committing other files — never `git add -A`/`.`. Co-author line: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Verify every task:** `node --check public/widget.js` must pass, and `git show --stat <sha>` must show only `public/widget.js`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `public/widget.js` | Entire widget UI | Modify (helpers + 7 render sites + closed bubble) |

All work is in `public/widget.js`. New helpers (`mobilePanelStyle`, `mobileBackdropHtml`, `attachSheetBehaviors`) live near the existing render helpers (~line 985). The 7 render functions each carry a mobile `panelStyle` branch (renderOpen ~1167, renderSupportForm ~1913, renderSupportSuccess ~2043, renderLeadForm/GenericSuccess ~2326, renderBookDemoForm, renderOrderForm ~2646, renderOrderResult ~2695 — confirm exact lines with `grep -n "position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:0;" public/widget.js`).

---

## Task 1: Bottom-sheet panel style + slim mobile header

**Files:** Modify `public/widget.js`

**Interfaces:**
- Produces: `mobilePanelStyle(): string` — the bottom-sheet inline style. Consumed by every render site's mobile branch.
- `headerHtml(pc, isMobile)` renders a slim header (no cover) when `isMobile`.

- [ ] **Step 1: Add the `mobilePanelStyle` helper** near `updateContainerPosition` (~line 888):
```javascript
  // Mobile open-state = a bottom sheet, not a full-screen takeover. Rounded top,
  // ~88% of the dynamic viewport height so a strip of the (dimmed) site shows above.
  function mobilePanelStyle() {
    return 'position:fixed;left:0;right:0;bottom:0;top:auto;width:100%;height:88dvh;' +
      'max-height:92dvh;border-radius:20px 20px 0 0;';
  }
```

- [ ] **Step 2: Swap every mobile panelStyle branch.** For EACH of the render sites, replace the exact mobile-branch string
```
'position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:0;'
```
with
```
mobilePanelStyle()
```
Run `grep -n "position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:0;" public/widget.js` first to list all occurrences; replace each. Leave the desktop branch of each ternary untouched.

- [ ] **Step 3: Slim mobile header.** In `headerHtml(pc, isMobile)` (~line 985), add a mobile branch that returns the slim header for BOTH states (place it at the top of the function, before the `if (!hasUser)`):
```javascript
    if (isMobile) {
      // Slim mobile header (no cover image — it wastes half the sheet). Small
      // logo + brand + status + drag handle + close. The handle is the drag
      // target wired in a later task (data-ibot-drag).
      return '<div data-ibot-drag="1" style="flex-shrink:0;position:relative;z-index:2;background:var(--ibot-surface);border-bottom:1px solid var(--ibot-border);border-radius:20px 20px 0 0;">' +
        '<div style="display:flex;justify-content:center;padding:8px 0 2px;"><div style="width:40px;height:4px;border-radius:999px;background:var(--ibot-border);"></div></div>' +
        '<div style="display:flex;align-items:center;gap:10px;padding:2px 12px 10px;">' +
        '<div style="width:34px;height:34px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + avatarHtml(34) + '</div>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:15px;color:var(--ibot-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(config.brandName) + '</div>' +
        '<div style="display:flex;align-items:center;gap:4px;margin-top:1px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span><span style="font-size:11px;color:#15803d;">' + escapeHtml(locale.status) + '</span></div>' +
        '</div>' +
        '<button onclick="window.__ibotNewChat()" title="' + escapeHtml(wlbl('שיחה חדשה','New chat')) + '" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;width:32px;height:32px;flex-shrink:0;">' + newChatIconSvg(16) + '</button>' +
        (modules.support.enabled ? '<button id="ibot-open-support" title="' + escapeHtml(locale.support.openLink) + '" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;width:32px;height:32px;flex-shrink:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button>' : '') +
        '<button id="ibot-close-mobile" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;width:32px;height:32px;font-size:22px;flex-shrink:0;line-height:1;">&times;</button>' +
        '</div></div>';
    }
```
This makes the existing `(isMobile ? ...close-mobile... : '')` snippets in the desktop-oriented branches unreachable on mobile (they now only run on desktop, where `isMobile` is false, so they render nothing) — leave them; they are harmless and keep the desktop diff empty.

- [ ] **Step 4: Verify + commit**
```bash
node --check public/widget.js && echo OK
git add public/widget.js
git commit -m "feat(widget-mobile): bottom-sheet panel style + slim mobile header (no cover)"
```
Manual check (controller/owner, post-deploy): on a phone the open widget is a rounded bottom sheet with a drag handle and a slim header, not a full-screen takeover; desktop unchanged.

---

## Task 2: Dimmed backdrop + tap-to-close + scroll-lock

**Files:** Modify `public/widget.js`

**Interfaces:**
- Produces: `mobileBackdropHtml(): string` (an `#ibot-backdrop` element); every render site prepends it on mobile; `attachSheetBehaviors()` wires the backdrop tap. Consumed by Task 3/4 (same hook).

- [ ] **Step 1: Add the backdrop helper** near `mobilePanelStyle`:
```javascript
  function mobileBackdropHtml() {
    return '<div id="ibot-backdrop" style="position:fixed;inset:0;z-index:2147483646;' +
      'background:rgba(0,0,0,0.45);animation:ibot-fade-in 0.28s ease-out;"></div>';
  }
```

- [ ] **Step 2: Prepend the backdrop on mobile at every render site.** Each render function builds `container.innerHTML = '<div id="ibot-panel" ...'`. Change each to prepend the backdrop on mobile:
```javascript
    container.innerHTML =
      (isMobile ? mobileBackdropHtml() : '') +
      '<div id="ibot-panel" style="' + panelStyle + ...
```
(The panel already carries `box-shadow` + `z-index` via being painted after the backdrop; ensure the panel's own style has no lower z-index — the sheet sits above `#ibot-backdrop` naturally because the container's `z-index:2147483647` wraps both, and the backdrop uses `2147483646`.) Apply to all 7 render sites.

- [ ] **Step 3: Add `attachSheetBehaviors()` and call it from `render()`.** Add the function near the render helpers:
```javascript
  // Wires mobile-sheet interactions after each open render: tap-backdrop closes.
  // (Drag + keyboard are added in later tasks to this same function.)
  function attachSheetBehaviors() {
    if (window.innerWidth >= 640 || !isOpen) return;
    var bd = document.getElementById('ibot-backdrop');
    if (bd) bd.onclick = function () { closeWidget(); };
  }
```
Add a shared close helper if one doesn't exist (the render sites currently inline `isOpen=false; widgetTrack('widget_closed',...); render();`). Add:
```javascript
  function closeWidget() {
    isOpen = false;
    widgetTrack('widget_closed', { msg_count: messages.length });
    render();
  }
```
Then, at the very end of `render()` (after the dispatch to the view renderers), call `attachSheetBehaviors();`. Note `render()` re-runs the view renderer synchronously (they set `container.innerHTML`), so the elements exist when `attachSheetBehaviors` runs.

- [ ] **Step 4: Confirm scroll-lock already covers this.** `render()` already sets `document.body.style.overflow` / `documentElement` based on `isOpen && innerWidth<640`. Leave it. (The backdrop covering the site + scroll-lock together make the sheet a clean takeover.)

- [ ] **Step 5: Verify + commit**
```bash
node --check public/widget.js && echo OK
git add public/widget.js
git commit -m "feat(widget-mobile): dimmed backdrop + tap-to-close over the sheet"
```

---

## Task 3: Drag handle → swipe-down to dismiss

**Files:** Modify `public/widget.js`

**Interfaces:** extends `attachSheetBehaviors()`; uses the `data-ibot-drag="1"` header element from Task 1.

- [ ] **Step 1: Add drag handling inside `attachSheetBehaviors()`** (after the backdrop wiring):
```javascript
    var panel = document.getElementById('ibot-panel');
    var handle = document.querySelector('#ibot-widget-container [data-ibot-drag="1"]');
    if (panel && handle) {
      var startY = 0, dy = 0, dragging = false;
      handle.ontouchstart = function (e) {
        dragging = true; dy = 0;
        startY = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
        panel.style.transition = 'none';
      };
      handle.ontouchmove = function (e) {
        if (!dragging) return;
        var y = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
        dy = Math.max(0, y - startY);           // only downward
        panel.style.transform = 'translateY(' + dy + 'px)';
      };
      handle.ontouchend = function () {
        if (!dragging) return;
        dragging = false;
        panel.style.transition = 'transform 0.25s ease-out';
        if (dy > 120) { closeWidget(); }         // dragged far enough → dismiss
        else { panel.style.transform = 'translateY(0)'; }  // snap back
      };
    }
```

- [ ] **Step 2: Verify + commit**
```bash
node --check public/widget.js && echo OK
git add public/widget.js
git commit -m "feat(widget-mobile): drag the handle down to dismiss the sheet"
```
Manual check: dragging the handle/header down past ~120px closes the sheet; a small drag snaps back; scrolling the messages list still works (drag is bound to the header only, not the messages area).

---

## Task 4: Keyboard-safe input via visualViewport

**Files:** Modify `public/widget.js`

**Interfaces:** a single `visualViewport` listener registered once (not per render); resizes the open mobile sheet to the visible viewport.

- [ ] **Step 1: Register the listener once, near boot** (after the container is created, ~line 900 area — guard so it registers a single time):
```javascript
  // Keyboard handling: when the on-screen keyboard opens, visualViewport shrinks.
  // Resize the open mobile sheet to the visible height so the input bar stays
  // above the keyboard instead of being covered. Registered once.
  if (window.visualViewport && !window.__ibotVVBound) {
    window.__ibotVVBound = true;
    var applyVV = function () {
      var panel = document.getElementById('ibot-panel');
      if (!panel || !isOpen || window.innerWidth >= 640) return;
      var vh = window.visualViewport.height;
      // Cap at 92% of the visible viewport; anchor to the bottom of it.
      panel.style.height = Math.round(vh * 0.92) + 'px';
      panel.style.bottom = Math.round(window.innerHeight - vh - window.visualViewport.offsetTop) + 'px';
      var msgs = document.getElementById('ibot-messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    };
    window.visualViewport.addEventListener('resize', applyVV);
    window.visualViewport.addEventListener('scroll', applyVV);
  }
```

- [ ] **Step 2: Reset the inline height/bottom when the keyboard closes.** The `applyVV` handler already recomputes on every resize; when the keyboard closes, `visualViewport.height` returns to full and `bottom` recomputes to ~0 and height to ~92%. To avoid a stale inline height fighting `mobilePanelStyle()` after a re-render, clear the inline overrides at the start of `attachSheetBehaviors()`:
```javascript
    var p0 = document.getElementById('ibot-panel');
    if (p0) { p0.style.height = ''; p0.style.bottom = ''; }
```
(so each fresh render starts from the CSS `88dvh` and `visualViewport` only overrides while the keyboard is up).

- [ ] **Step 3: Verify + commit**
```bash
node --check public/widget.js && echo OK
git add public/widget.js
git commit -m "feat(widget-mobile): keyboard-safe input via visualViewport resizing"
```
Manual check (iOS Safari + Android Chrome): tapping the input raises the keyboard and the input bar + last messages stay visible above it; closing the keyboard restores the sheet.

---

## Task 5: Scroll-aware closed bubble

**Files:** Modify `public/widget.js`

**Interfaces:** `renderClosed()` gives the trigger an id; a window scroll listener hides/shows it.

- [ ] **Step 1: In `renderClosed()`** (~line 1068), the trigger already has `id="ibot-trigger"`. Add a transition to its style so hide/show animates: ensure the inline style includes `transition:transform 0.25s ease, opacity 0.25s ease;` (it currently has `transition:transform 0.3s ease;` — replace that with `transition:transform 0.25s ease, opacity 0.25s ease;`).

- [ ] **Step 2: Register a scroll-aware hide once** (near the visualViewport block):
```javascript
  // Scroll-aware bubble: on mobile, hide the closed bubble while the visitor
  // scrolls DOWN (so it never covers the site's own bottom bar / cart), and
  // bring it back when they scroll up or stop. No-op when the widget is open.
  if (!window.__ibotScrollBound) {
    window.__ibotScrollBound = true;
    var lastY = 0, hideTimer = null;
    window.addEventListener('scroll', function () {
      if (isOpen || window.innerWidth >= 640) return;
      var t = document.getElementById('ibot-trigger');
      if (!t) return;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (y > lastY + 8) { t.style.transform = 'translateY(140%)'; t.style.opacity = '0'; }
      else if (y < lastY - 8) { t.style.transform = ''; t.style.opacity = '1'; }
      lastY = y;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { if (t) { t.style.transform = ''; t.style.opacity = '1'; } }, 900);
    }, { passive: true });
  }
```

- [ ] **Step 3: Verify + commit**
```bash
node --check public/widget.js && echo OK
git add public/widget.js
git commit -m "feat(widget-mobile): scroll-aware closed bubble (hide on scroll-down)"
```
Manual check: on a phone, scrolling the host page down tucks the bubble away; scrolling up or pausing brings it back; it never overlaps the site's bottom UI while reading.

---

## Self-Review

**Spec coverage (2026-07-06-widget-mobile-ux-design.md):**
- §3.2 open sheet (88dvh, rounded top, slide-up) → Task 1; backdrop + tap/X close → Task 2; drag handle + swipe-down → Task 3.
- §3.3 slim header, no cover → Task 1.
- §3.4 visualViewport keyboard → Task 4.
- §3.5 scroll-lock → existing `render()` (confirmed Task 2 Step 4); overscroll containment is inherited from the existing `#ibot-messages` scroll container.
- §3.6 scroll-aware closed bubble + safe-area → Task 5 (safe-area on the bubble already shipped earlier in `updateContainerPosition`).
- §3.1 centralization of the 6–7 duplicated panelStyle branches → Task 1 Step 2.

**Placeholder scan:** none. The "confirm exact lines with grep" directions are concrete verification actions, not placeholders; the code to insert is given verbatim.

**Type/name consistency:** `mobilePanelStyle()`, `mobileBackdropHtml()`, `attachSheetBehaviors()`, `closeWidget()` defined in Tasks 1–2 and reused in 3–4. `#ibot-panel`, `#ibot-backdrop`, `#ibot-trigger`, `[data-ibot-drag]`, `#ibot-close-mobile` ids are consistent across tasks.

**Reality note:** widget.js has no unit-test harness; each task's real gate is `node --check` + on-device manual testing by the owner. The reviewer for each task verifies code correctness + desktop-branch-untouched by inspection; final acceptance is the owner's phone test. Desktop must stay byte-identical — the reviewer should confirm no desktop branch changed.

**Out of scope:** Phase C (cart popup); any desktop change.
