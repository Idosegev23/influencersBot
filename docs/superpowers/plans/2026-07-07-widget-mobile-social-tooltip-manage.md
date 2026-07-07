# Widget Mobile Full-Screen + Social/Tooltip + Manage Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Redesign the embedded widget's MOBILE experience as a clean full-screen surface with the rich cover→logo→social→chat header, add a brand-personalized tooltip, wire social links (auto-from-scrape + editable + UTM-tagged), and redesign the manage panel into a clean 3-zone layout with a live widget preview.

**Architecture:** All widget UX changes are `public/widget.js` (vanilla-JS IIFE, inline styles) and **mobile-only** (desktop paths untouched). Config passthrough in `src/app/api/widget/config/route.ts`. Save reuses the existing `PATCH /api/manage/settings` (deep-merges `...otherWidgetFields` into `config.widget`) and `POST/DELETE /api/manage/upload-cover`. Social auto-population hooks the scan orchestrators. Manage redesign is `src/app/manage/[token]/page.tsx`.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind (manage panel); vanilla JS (widget). No new deps.

## Global Constraints

- **Widget runs on customers' live sites — it MUST NEVER throw into the host page.** Every new host-facing code path (tooltip timer, social clicks, keyboard handlers) wrapped in try/catch.
- **Mobile-only for UX changes.** All widget changes gate on the existing `isMobile` branch. Desktop rendering must be byte-identical after these changes.
- **HELD FROM PUSH.** Commit every task; do NOT `git push`. The whole feature ships after the owner's on-device test.
- **Reuse, don't rebuild:** `bestieTag(url, content)` for UTM; `socialRowHtml()` for social buttons; the desktop welcome header branch of `headerHtml()` as the model for the mobile rich header; `PATCH /api/manage/settings` for saving (no new save endpoint); `upload-cover` for the cover (already built).
- **Tooltip copy is brand-personalized** via `config.widget.tooltip` (string, nullable). If unset/empty → NO tooltip renders (never a hardcoded default like "בסטי").
- **Social UTM:** outbound social hrefs tagged `utm_source=bestie`, `utm_medium=social`, `utm_content=<platform>`.
- **Never break existing manage-panel save.** The redesign reorganizes UI + adds fields; the existing PATCH contract (widget fields, prompt, theme, modules, integrations, supportEmail) must keep working.

---

## PHASE 1 — Widget + backend (buildable + verifiable now; held from push)

### Task 1: Config passthrough for `tooltip` + widget default

**Files:**
- Modify: `src/app/api/widget/config/route.ts` (next to the `cartWatcher`/`coverImage` lines)
- Modify: `public/widget.js` (config defaults ~line 330-335)

**Interfaces:**
- Produces: `config.tooltip` in the `/api/widget/config` response — `{ text: string } | null` from `config.widget.tooltip`. Widget reads `config.tooltip`.

- [ ] **Step 1:** In `src/app/api/widget/config/route.ts`, next to the existing `cartWatcher:`/`coverImage:` fields in the `NextResponse.json({...})` object, add:
```typescript
        tooltip: (widgetConfig.tooltip && typeof widgetConfig.tooltip === 'string' && widgetConfig.tooltip.trim())
          ? { text: String(widgetConfig.tooltip).trim().slice(0, 140) }
          : null,
```
- [ ] **Step 2:** In `public/widget.js`, in the `var config = {...}` defaults block (~line 327-338, where `coverImage: null, socialLinks: []` live), add `tooltip: null,`.
- [ ] **Step 3:** In the config-load `.then(function (data) {...})` (~line 810-895, where `if (data.coverImage) config.coverImage = data.coverImage;`), add: `if (data.tooltip && data.tooltip.text) config.tooltip = data.tooltip;`.
- [ ] **Step 4:** Verify: `npm run type-check 2>&1 | grep -i "widget/config"` clean; `node --check public/widget.js`; `grep -c "config.tooltip = data.tooltip" public/widget.js` = 1.
- [ ] **Step 5:** Commit: `feat(widget): config passthrough for brand tooltip text`.

---

### Task 2: Mobile full-screen panel (replace bottom-sheet)

**Files:** Modify `public/widget.js` — `mobilePanelStyle()` (~1012), `mobileBackdropHtml()` (~1020), `attachSheetBehaviors()` (~1227).

**Interfaces:** `mobilePanelStyle()` returns a full-screen style string; `mobileBackdropHtml()` returns `''` (no backdrop on full-screen).

- [ ] **Step 1:** Replace `mobilePanelStyle()` body:
```javascript
  // Mobile open-state = clean full-screen (not a bottom sheet). Full dynamic
  // viewport, safe-area aware, slides up. z-index:1 keeps it under the backdrop-less stack.
  function mobilePanelStyle() {
    return 'position:fixed;inset:0;width:100%;height:100dvh;max-height:100dvh;' +
      'border-radius:0;z-index:1;animation:ibot-slide-up 0.28s ease-out;';
  }
```
- [ ] **Step 2:** Replace `mobileBackdropHtml()` body to return no backdrop (full-screen covers everything):
```javascript
  // Full-screen mobile has no backdrop — the panel fills the viewport.
  function mobileBackdropHtml() { return ''; }
```
- [ ] **Step 3:** In `attachSheetBehaviors()` (~1227), the drag-to-dismiss handle logic is now obsolete for full-screen. KEEP the function callable (other code calls it) but make the drag portion a no-op if the drag handle is absent (the new header, Task 3, has no `data-ibot-drag`). Confirm it still calls `applyVV()` (keyboard handling) and the backdrop-tap guard tolerates a missing backdrop (no `#ibot-backdrop` → skip). Wrap any `querySelector(...).addEventListener` in a null-check.
- [ ] **Step 4:** Verify: `node --check public/widget.js`; `grep -c "100dvh" public/widget.js` ≥1; `grep -c "function mobileBackdropHtml" public/widget.js` =1. Confirm desktop `panelStyle` (non-mobile) is untouched.
- [ ] **Step 5:** Commit: `feat(widget-mobile): full-screen panel replaces bottom-sheet`.

---

### Task 3: Rich mobile header (cover→logo→social; compact when chatting)

**Files:** Modify `public/widget.js` — the `isMobile` branch of `headerHtml(pc, isMobile)` (~1114-1135).

**Interfaces:** On the welcome screen (no user message) the mobile header renders cover + logo + brand + `socialRowHtml()` + close; once the visitor has sent a message it renders a compact bar (logo + brand + status + new-chat + close). Mirrors the desktop welcome/chatting split.

- [ ] **Step 1:** Replace the mobile-slim branch. Instead of a separate slim layout, make mobile use the SAME welcome/compact split as desktop, with mobile sizing and the mobile close button. Concretely, delete the `if (isMobile) { return slim... }` early-return and let mobile fall through to the shared welcome/compact code (which already renders cover+logo+`socialRowHtml()` on welcome and a compact bar when `hasUser`). Verify the shared code's `isMobile` conditionals (close button placement, radius) still apply. The welcome cover height on mobile should be a touch taller — set cover height to `isMobile ? '132px' : '112px'` and the avatar `margin-top` accordingly.
- [ ] **Step 2:** Ensure the compact bar (the `hasUser` branch, ~line 1160+) already includes the `isMobile` close button — it does (`(isMobile ? '<button id="ibot-close-mobile"...' : '')`). Confirm no `data-ibot-drag` is required.
- [ ] **Step 3:** Because the welcome header now shows on mobile full-screen and collapses to the compact bar once the user types, the keyboard-open case is handled (chatting = compact bar, small header, max room for input). No cover shown while typing.
- [ ] **Step 4:** Verify: `node --check public/widget.js`; grep confirms the slim mobile branch (`data-ibot-drag="1"` in headerHtml) is gone: `grep -c 'data-ibot-drag' public/widget.js` reflects removal from headerHtml (may still exist in attachSheetBehaviors null-guarded). Desktop header output unchanged.
- [ ] **Step 5:** Commit: `feat(widget-mobile): rich cover+logo+social header on full-screen`.

---

### Task 4: Branded input bar + prominent mobile chips

**Files:** Modify `public/widget.js` — the input/composer render + chips render (locate via `id="ibot-input"` and the `chips` render block).

**Interfaces:** Mobile input bar uses brand color accent; quick-reply chips render prominently above the input on mobile.

- [ ] **Step 1:** Locate the input composer render (search `ibot-input`). Add a brand-colored accent to the mobile input bar (e.g. a 1.5px `border` in `config.primaryColor` on focus, and the send button already uses brand color — confirm). Keep desktop unchanged (gate any new style on `isMobile`).
- [ ] **Step 2:** Locate the chips render block (search where `chips` array maps to buttons, near `__ibotChipClick`). On mobile, make chips more prominent: larger tap targets (`min-height:36px`, `font-size:13.5px`), horizontal scroll row if they overflow (`overflow-x:auto;white-space:nowrap`), sitting directly above the input. Gate mobile-specific sizing on `isMobile`.
- [ ] **Step 3:** Verify: `node --check public/widget.js`; visually confirm in code the chips + input mobile branch. Desktop chips/input unchanged.
- [ ] **Step 4:** Commit: `feat(widget-mobile): branded input bar + prominent quick-reply chips`.

---

### Task 5: Brand tooltip from the bubble (once per visitor)

**Files:** Modify `public/widget.js` — add a tooltip renderer near the bubble render + a boot trigger.

**Interfaces:** `showBubbleTooltip()` renders a speech bubble anchored to the closed bubble with `config.tooltip.text`; shown once per visitor (localStorage `ibot_tip_<ACCOUNT_ID>`), after ~2.5s, auto-dismiss ~6s, with an X. Never shows if the widget is already open, on desktop is optional (gate mobile-first but harmless on desktop — spec says mobile; gate on `isMobile`).

- [ ] **Step 1:** Add near the bubble helpers:
```javascript
  var TIP_KEY = 'ibot_tip_' + ACCOUNT_ID;
  function tooltipSeen() { try { return localStorage.getItem(TIP_KEY) === '1'; } catch (e) { return true; } }
  function markTooltipSeen() { try { localStorage.setItem(TIP_KEY, '1'); } catch (e) { /* */ } }
  window.__ibotTipDismiss = function () {
    markTooltipSeen();
    var el = document.getElementById('ibot-tip'); if (el && el.parentNode) el.parentNode.removeChild(el);
  };
  function showBubbleTooltip() {
    try {
      if (!isMobile) return;                         // mobile-only per spec
      if (!config.tooltip || !config.tooltip.text) return;
      if (isOpen || tooltipSeen()) return;
      if (document.getElementById('ibot-tip')) return;
      var side = (config.position === 'bottom-left') ? 'left:20px;' : 'right:20px;';
      var el = document.createElement('div');
      el.id = 'ibot-tip';
      el.style.cssText = 'position:fixed;z-index:2147483646;bottom:calc(84px + env(safe-area-inset-bottom));' + side +
        'max-width:min(72vw,260px);background:var(--ibot-panel-bg,#fff);color:var(--ibot-text-primary,#111);' +
        'border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,0.18);padding:10px 12px;font-size:13.5px;line-height:1.35;' +
        'direction:' + locale.dir + ';animation:ibot-slide-up 0.3s ease-out;display:flex;gap:8px;align-items:flex-start;';
      el.innerHTML = '<span style="flex:1;min-width:0;">' + escapeHtml(config.tooltip.text) + '</span>' +
        '<button onclick="window.__ibotTipDismiss()" aria-label="close" style="background:transparent;border:none;color:var(--ibot-text-muted,#888);cursor:pointer;font-size:16px;line-height:1;flex-shrink:0;">&times;</button>';
      document.body.appendChild(el);
      widgetTrack('widget_tooltip_shown', {});
      setTimeout(function () { try { window.__ibotTipDismiss(); } catch (e) {} }, 6000);
    } catch (e) { /* never break host page */ }
  }
```
- [ ] **Step 2:** Trigger it after config loads. In the config `.then` (after `render()` / after the widget boots), add: `setTimeout(function () { try { showBubbleTooltip(); } catch (e) {} }, 2500);`. Also call `markTooltipSeen()` inside the open handler so opening the widget before the tip fires suppresses it.
- [ ] **Step 3:** Register `widget_tooltip_shown` in the event catalog `src/lib/analytics/event-catalog.ts` if it validates event names (add next to `widget_action_proposed`).
- [ ] **Step 4:** Verify: `node --check public/widget.js`; `grep -c "showBubbleTooltip" public/widget.js` =2 (def + call); `grep -c "widget_tooltip_shown" src/lib/analytics/event-catalog.ts` ≥1.
- [ ] **Step 5:** Commit: `feat(widget-mobile): brand-personalized bubble tooltip (once per visitor)`.

---

### Task 6: UTM-tag outbound social links

**Files:** Modify `public/widget.js` — `socialRowHtml()` (~1062) + `__ibotSocialClick` (~1084).

**Interfaces:** Social `<a href>` carries `bestieTag(url, 'social_<platform>')` with `utm_medium=social`.

- [ ] **Step 1:** `bestieTag` currently hardcodes `utm_medium=chat`. Add an optional medium param without breaking existing callers:
```javascript
  function bestieTag(url, content, medium) {
    if (!url) return url;
    try {
      var u = new URL(url, document.baseURI);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return url;
      if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'bestie');
      if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', medium || 'chat');
      if (content && !u.searchParams.has('utm_content')) u.searchParams.set('utm_content', content);
      return u.href;
    } catch (e) { return url; }
  }
```
(Existing 2-arg callers keep `utm_medium=chat`.)
- [ ] **Step 2:** In `socialRowHtml()`, change the href from `escapeHtml(l.url)` to `escapeHtml(bestieTag(l.url, 'social_' + plat, 'social'))`.
- [ ] **Step 3:** Verify: `node --check public/widget.js`; `grep -c "bestieTag(l.url" public/widget.js` =1; existing product `bestieTag(...,'card')`/`'complementary'` calls unaffected (still 2-arg → medium chat).
- [ ] **Step 4:** Commit: `feat(widget): UTM-tag social link clicks (utm_medium=social)`.

---

### Task 7: Auto-populate `config.widget.socialLinks` from the scan

**Files:** Modify the scan finalization path. Locate where the orchestrator writes profile/bio data (`src/lib/scraping/newScanOrchestrator.ts` ~line 170-210 handles `bio_links`/`external_url`) and add a step that derives platform links and writes `config.widget.socialLinks` (merge, do not clobber manually-edited links).

**Interfaces:** Produces `deriveSocialLinks(profile): {platform, url}[]` and persists to `config.widget.socialLinks` only when the field is empty/unset (never overwrite an owner's manual edits).

- [ ] **Step 1:** Write a pure helper `src/lib/scraping/derive-social-links.ts`:
```typescript
export interface SocialLink { platform: string; url: string; }
const PATTERNS: { platform: string; re: RegExp }[] = [
  { platform: 'instagram', re: /instagram\.com\//i },
  { platform: 'facebook', re: /(facebook|fb)\.com\//i },
  { platform: 'tiktok', re: /tiktok\.com\//i },
  { platform: 'youtube', re: /(youtube\.com|youtu\.be)\//i },
];
export function deriveSocialLinks(urls: (string | null | undefined)[], instagramUsername?: string | null): SocialLink[] {
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    for (const p of PATTERNS) {
      if (p.re.test(url) && !seen.has(p.platform)) { seen.add(p.platform); out.push({ platform: p.platform, url }); }
    }
  }
  // Always ensure the IG profile itself is present if we have a username.
  if (instagramUsername && !seen.has('instagram')) {
    out.unshift({ platform: 'instagram', url: 'https://instagram.com/' + String(instagramUsername).replace(/^@/, '') });
  }
  return out;
}
```
- [ ] **Step 2:** Unit test `tests/unit/scraping/derive-social-links.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { deriveSocialLinks } from '@/lib/scraping/derive-social-links';
describe('deriveSocialLinks', () => {
  it('maps known platforms, dedupes, ignores non-http', () => {
    const r = deriveSocialLinks(['https://instagram.com/x', 'https://tiktok.com/@x', 'ftp://no', 'https://instagram.com/y']);
    expect(r).toEqual([{ platform: 'instagram', url: 'https://instagram.com/x' }, { platform: 'tiktok', url: 'https://tiktok.com/@x' }]);
  });
  it('injects IG profile from username when absent', () => {
    const r = deriveSocialLinks([], 'burgerkingisrael');
    expect(r[0]).toEqual({ platform: 'instagram', url: 'https://instagram.com/burgerkingisrael' });
  });
});
```
- [ ] **Step 3:** In the orchestrator finalization (after profile + bio links are known, near where `config` is updated / `instagram_bio_websites` is written), read the account `config`, and IF `config.widget?.socialLinks` is empty/absent, set it:
```typescript
const derived = deriveSocialLinks([profile.external_url, ...(profile.bio_links || [])], profile.username);
if (derived.length && !(cfg.widget?.socialLinks?.length)) {
  cfg.widget = { ...(cfg.widget || {}), socialLinks: derived };
  // persist cfg back to accounts.config (use the orchestrator's existing config-write path — do NOT full-overwrite config)
}
```
Use the orchestrator's existing safe config-merge helper (the repo has had config-wipe races — reuse `repair-account-config`/the existing merge, never a blind `update({config})`).
- [ ] **Step 4:** Verify: `npx vitest run tests/unit/scraping/derive-social-links.test.ts` (2/2); `npm run type-check` clean for the new file.
- [ ] **Step 5:** Commit: `feat(scan): auto-populate widget social links from scraped profile`.

---

## PHASE 2 — Manage panel redesign (3 zones + live preview + new fields)

### Task 8: Restructure manage panel into 3 zones

**Files:** Modify `src/app/manage/[token]/page.tsx` (1963 lines, 56 useState). Optionally extract zone components into `src/components/manage/`.

**Interfaces:** The existing 7 flat sections regroup under 3 top-level zones: **מראה (Appearance)**, **תוכן (Content)**, **מתקדם (Advanced)**. Nav switches zones. No field logic/state removed — only regrouped.

- [ ] **Step 1:** Map current sections → zones:
  - **מראה:** widget appearance (color, mode, welcome, cover, input text, brand name, position) + **NEW** tooltip (Task 10) + **NEW** social editor (Task 11) + bot instructions/tone (הנחיות לבוט, טון) — the brand-voice + look.
  - **תוכן:** שאלות נפוצות, בסיס ידע, קטלוג מוצרים, דפים סרוקים, לידים ובריפים.
  - **מתקדם:** מודולים, קיצורי ניווט, אינטגרציה Shopify, קוד הטמעה.
- [ ] **Step 2:** Introduce a `zone` state (`'appearance' | 'content' | 'advanced'`) replacing/wrapping the current section nav. Render the existing section JSX under the appropriate zone conditional. Keep all existing state + handlers intact.
- [ ] **Step 3:** Clean visual hierarchy: each zone is a vertical stack of cards (existing sections become cards), generous spacing, one clear heading per card. Advanced zone cards collapsed by default (expand-on-click).
- [ ] **Step 4:** Verify: `npm run type-check` clean for the file; `npm run build` (or `next lint`) passes; manually confirm every original section still reachable under a zone.
- [ ] **Step 5:** Commit: `refactor(manage): regroup panel into Appearance/Content/Advanced zones`.

---

### Task 9: Live widget preview in the Appearance zone

**Files:** Modify `src/app/manage/[token]/page.tsx`; add `src/components/manage/WidgetPreview.tsx`.

**Interfaces:** `<WidgetPreview config={{primaryColor, coverImage, brandName, welcomeMessage, tooltip, socialLinks, position}} />` renders a faithful, non-interactive mock of the widget's welcome header (cover→logo→brand→social) + a sample greeting + the tooltip, updating live as the Appearance fields change.

- [ ] **Step 1:** Build `WidgetPreview.tsx` — a static React mock mirroring the widget welcome header layout (cover image band, overlapping round logo, brand name, social icon row, greeting bubble, and the tooltip pill). Pure presentational; reads the live Appearance state values. Mobile-frame styled (a phone-ish rounded container) so the owner sees the mobile result.
- [ ] **Step 2:** Place it in the Appearance zone beside (desktop) / above (narrow) the edit fields, bound to the live state (`primaryColor`, `coverImage`, `brandName`, `welcomeMessage`, `tooltip`, `socialLinks`, `position`).
- [ ] **Step 3:** Verify: `npm run type-check` clean; render the manage page locally (or reason through) — changing color/cover/greeting/tooltip updates the preview.
- [ ] **Step 4:** Commit: `feat(manage): live widget preview in Appearance zone`.

---

### Task 10: Tooltip field in manage (Appearance)

**Files:** Modify `src/app/manage/[token]/page.tsx`.

**Interfaces:** A text input (maxlength 140) bound to `tooltip` state; loaded from `widget.tooltip` on GET; saved via the existing `PATCH /api/manage/settings` by including `tooltip` in the body (it flows through `...otherWidgetFields` into `config.widget.tooltip`).

- [ ] **Step 1:** Add `const [tooltip, setTooltip] = useState('')`; in the settings-load effect (where `w.coverImage` etc. are read), add `setTooltip(w.tooltip || '')`.
- [ ] **Step 2:** Add the field to the Appearance zone: label "טולטיפ (בועית ליד הכפתור)", input with placeholder e.g. "היי 👋 יש שאלה? אני כאן", helper text "מוצג פעם אחת למבקר במובייל". Bind to `tooltip`/`setTooltip`, feed into `<WidgetPreview>`.
- [ ] **Step 3:** Include `tooltip` in the PATCH save body (wherever the appearance save fires): `{ ...existing, tooltip: tooltip.trim() }`.
- [ ] **Step 4:** Verify: `npm run type-check` clean; confirm save body includes `tooltip`.
- [ ] **Step 5:** Commit: `feat(manage): brand tooltip text field (Appearance)`.

---

### Task 11: Social links editor in manage (Appearance)

**Files:** Modify `src/app/manage/[token]/page.tsx`; add `src/components/manage/SocialLinksEditor.tsx`.

**Interfaces:** `<SocialLinksEditor value={socialLinks} onChange={setSocialLinks} />` — add/edit/remove `{platform, url}` rows (platform from a fixed select: instagram/facebook/tiktok/youtube/website); loaded from `widget.socialLinks`; saved via PATCH `socialLinks` field (flows into `config.widget.socialLinks`).

- [ ] **Step 1:** Build `SocialLinksEditor.tsx`: a list of rows (platform `<select>` + url `<input>` + remove button) and an "add" button. Validates URL is http(s). Emits the array via `onChange`.
- [ ] **Step 2:** Wire in the Appearance zone: `const [socialLinks, setSocialLinks] = useState<{platform:string;url:string}[]>([])`; load `setSocialLinks(Array.isArray(w.socialLinks) ? w.socialLinks : [])`; feed into `<WidgetPreview>`.
- [ ] **Step 3:** Include `socialLinks` in the PATCH save body (filter empties/invalid): `socialLinks: socialLinks.filter(s => s.platform && /^https?:\/\//i.test(s.url))`.
- [ ] **Step 4:** Verify: `npm run type-check` clean; confirm save body includes `socialLinks`; editor add/remove works in code review.
- [ ] **Step 5:** Commit: `feat(manage): social links editor (Appearance) — auto-filled from scan, owner-editable`.

---

## Self-Review

**Spec coverage:** Full-screen mobile → T2; rich cover→logo→social→chat header → T3; native keyboard + branded input + chips → T4 (keyboard geometry already built via applyVV, kept in T2/T3); brand-personalized tooltip → T1+T5 (+ manage T10); social auto-from-scan → T7; social editable → T11; social UTM → T6; manage redesign (3 zones + live preview) → T8+T9; cover editable → already exists (upload-cover). ✓

**Placeholder scan:** Widget tasks have concrete code. Manage tasks (T8/T9) are larger creative UI — specified by architecture + component contracts rather than every line, because a 1963-line regroup + a new preview component can't be fully pre-written; implementers build within the stated structure and reuse existing field JSX.

**Type consistency:** `config.tooltip = {text}` (T1) ↔ `config.tooltip.text` (T5). `socialLinks: {platform,url}[]` consistent across T6 (widget read), T7 (scan write), T11 (manage edit). `bestieTag(url, content, medium?)` back-compatible (T6). Save via existing PATCH `...otherWidgetFields` — `tooltip` and `socialLinks` are plain widget fields, no route change needed (verified in settings/route.ts).

**Device-dependent (hold push):** All widget UX (T2-T6) needs on-device verification on a real phone (full-screen render, keyboard geometry, tooltip timing, social UTM navigation). Manage redesign (T8-T11) needs the owner's visual review. Nothing pushed until then.

**Out of scope:** Desktop widget changes (unchanged); rebuilding Content/Advanced zone field internals (only regrouped); non-IG social platform scraping beyond bio/external_url patterns.
