/**
 * The widget editor's `config.widget.inline` draft — the inline-mount
 * counterpart to `banner-draft.ts`'s `buildBannerDraft`, and for the same
 * reason: this is the seam between what the customer edits in
 * InlineMountSection and what actually gets POSTed to
 * /api/influencer/settings, and a seam like that needs a test surface that
 * doesn't require rendering a component. `widget-editor-save.test.ts`
 * already proved the failure mode this guards against — its "preserves
 * stored enabled:true and carries every untouched key through unchanged"
 * test exists because a field can be silently dropped at save time and nothing
 * before that test caught it. `inline-draft.test.ts` is this module's
 * version of that same test.
 */

import type { InlinePick } from '@/components/influencer/WidgetDraftPreview';
import { resolveInlineMount } from './inline';
import type {
  InlineEnabled,
  InlineMountMode,
  InlinePreset,
  InlineTreatment,
  InlineBubble,
  ResolvedInlineTheme,
} from './inline';

/**
 * The editable shape the widget editor holds in state and hands back through
 * `InlineMountSection`'s `onChange`.
 *
 * Mirrors `ResolvedInlineMount` (./inline.ts) field for field — including
 * `paths`, which a prior version of this module dropped: `inlineForPost`
 * omitting it meant every save silently erased a configured page scope, since
 * /api/influencer/settings replaces `widget.inline` wholesale rather than
 * merging it. See `inline.ts`'s doc comment on `ResolvedInlineMount.paths`
 * for what that costs on the customer's live site once it's gone (a
 * document-wide MutationObserver on every pageview, plus a false
 * `inline_mount_missing` diagnostic on every page the selector never existed
 * on) — this UI never lets the customer edit `paths` (out of scope), but it
 * must still carry an existing value through untouched.
 *
 * Two fields are display-only and never leave the browser as-is:
 * - `label`: the human-readable selector the picker showed ("div.hero"),
 *   carried along so the "what did I pick" summary keeps working across a
 *   preset/surface edit without re-reading it off `selector`.
 * - `measured`: the picked element's real height, for the same "so the
 *   customer can trust it chose the right thing" reason `InlinePick` carries
 *   it (see that type's doc comment in WidgetDraftPreview.tsx). NOT the same
 *   number as `reserve` — do not conflate them here either.
 *
 * `enabled` is exactly `InlineEnabled` (true | 'preview') — the same two
 * states `ResolvedInlineMount` supports. There is deliberately no third
 * "picked but off" value here: the stored schema has no such state (off IS
 * absence — the settings route deletes `widget.inline` outright once
 * `resolveInlineMount` returns null), and an earlier version of this UI
 * offered `enabled: false` as an in-session-only "keep the spot, pause it"
 * state. That control lied to the customer: the summary kept showing the
 * picked spot as if it still existed, but the next save actually deleted it
 * (same outcome as the remove button, just unlabelled as destructive). If a
 * real "keep the spot but pause it" state is wanted later, it has to become
 * a *stored* value in `ResolvedInlineMount`/`resolveInlineMount` first — that
 * is a schema change, not something this draft type should invent on its
 * own.
 */
export interface InlineMountDraft {
  enabled: InlineEnabled;
  selector: string;
  mode: InlineMountMode;
  preset: InlinePreset;
  surface: InlineTreatment;
  reserve: { desktop: number; mobile: number };
  theme: ResolvedInlineTheme;
  bubble: InlineBubble;
  /** Page-prefix scope, carried through untouched — see the file header. `null`/absent means every page. */
  paths?: string[] | null;
  label?: string;
  measured?: { desktop: number; mobile: number };
}

/**
 * What `InlineMountSection` actually needs from a pick — `InlinePick`
 * (WidgetDraftPreview.tsx) with `measured` loosened to optional.
 *
 * A real pick from the preview iframe always carries `measured` (it's
 * required on `InlinePick` itself), so this stays fully compatible with what
 * `WidgetDraftPreview`'s `onPick` actually delivers. Loosening it here is
 * about being honest about what this module depends on, not about accepting
 * a lesser pick: `measured` is display-only below, so its absence just means
 * "no height to show," never a broken pick.
 */
export type PendingInlinePick = Omit<InlinePick, 'measured'> & { measured?: InlinePick['measured'] };

/**
 * Turns a fresh pick from the preview iframe into a draft, preserving
 * whatever preset/surface/bubble/enabled/paths the customer already had set
 * on an existing mount (re-picking a spot is not the same as starting over).
 *
 * `enabled` is the one field that does NOT carry over from `base` when there
 * is no base — a brand-new mount (picking for the first time, `base` null)
 * always lands on `'preview'`. Going live is a deliberate second act, never
 * the side effect of picking a spot.
 */
export function mountFromPick(pick: PendingInlinePick, base: InlineMountDraft | null): InlineMountDraft {
  return {
    enabled: base?.enabled ?? 'preview',
    selector: pick.selector,
    mode: pick.mode,
    preset: base?.preset ?? 'hero',
    surface: base?.surface ?? 'bare',
    reserve: pick.reserve,
    theme: pick.theme,
    bubble: base?.bubble ?? 'after-scroll',
    paths: base?.paths ?? null,
    label: pick.label,
    measured: pick.measured,
  };
}

/**
 * What actually gets POSTed for `widget.inline` — the resolved field set
 * only (`enabled`/`selector`/`mode`/`preset`/`surface`/`reserve`/`theme`/
 * `bubble`/`paths`), never `label` or `measured` (display-only, see
 * `InlineMountDraft`'s doc comment above) and never a raw shape
 * /api/influencer/settings' `resolveInlineMount` might silently drop.
 *
 * A `null` draft (nothing configured, or the customer pressed "remove")
 * collapses to `null` here too, which the settings route treats as "delete
 * whatever inline mount is stored" (`resolveInlineMount` returns null for a
 * null/non-object raw value, and the route deletes the key on that result).
 *
 * `inline-draft.test.ts` pins the contract this function must never break:
 * `resolveInlineMount({ widget: { inline: inlineForPost(draft) } })` must
 * deep-equal `draft` minus `label`/`measured`. That single assertion is what
 * catches a field silently dropped here — the exact defect class `paths`
 * fell into once already.
 */
export function inlineForPost(draft: InlineMountDraft | null): Record<string, unknown> | null {
  if (!draft) return null;
  return {
    enabled: draft.enabled,
    selector: draft.selector,
    mode: draft.mode,
    preset: draft.preset,
    surface: draft.surface,
    reserve: draft.reserve,
    theme: draft.theme,
    bubble: draft.bubble,
    paths: draft.paths ?? null,
  };
}

/**
 * Does the account have a stored `widget.inline` that this editor cannot
 * represent?
 *
 * `resolveInlineMount` returns null for a mount the storable-selector
 * allowlist rejects — a hand-written combinator (`section.hero > div`), an
 * attribute selector, an over-long selector — and for `enabled: false`. The
 * editor then seeds `inlineDraft` as null and shows its empty state, which is
 * indistinguishable from an account that never had a mount at all.
 *
 * The distinction matters because the two must POST differently. Posting
 * `inline: null` for a genuinely absent mount is a no-op; posting it for an
 * unrepresentable one makes /api/influencer/settings run its
 * `else delete updatedConfig.widget.inline` branch and erase the row. And per
 * the spec's own "Known gaps", hand-set database config is the ONLY way
 * `paths`, `mode: 'replace'` and `mode: 'overlay'` exist today — so the mounts
 * this would destroy are exactly the ones nothing in the product can recreate.
 * The customer would edit a banner headline, press שמירה, see success, and
 * have silently deleted an operator-configured mount.
 *
 * Truthiness, not `'inline' in config.widget`: a stored `null`/`false`/`0`
 * carries nothing to lose, so it stays on the "absent" side where posting
 * `null` is harmless.
 */
export function storedInlineIsUnrepresentable(rawConfig: unknown): boolean {
  const raw = (rawConfig as { widget?: { inline?: unknown } } | null | undefined)?.widget?.inline;
  if (!raw) return false;
  return resolveInlineMount(rawConfig) === null;
}

/**
 * The `inline` slice of the widget editor's POST body — a spread-in fragment
 * rather than a value, because the correct thing to send is sometimes *no key
 * at all*.
 *
 * /api/influencer/settings acts on `'inline' in body.widget`, so an omitted
 * key means "leave whatever is stored alone" while `inline: null` means
 * "delete it". Those are the two states this function chooses between:
 *
 * - a draft (picked, or seeded from a representable stored mount) → post it;
 * - nothing drafted AND the account has an unrepresentable stored mount →
 *   omit the key, so an unrelated save cannot destroy it
 *   (see `storedInlineIsUnrepresentable`);
 * - nothing drafted and nothing unrepresentable stored → `inline: null`,
 *   today's behaviour, which is what the remove button relies on.
 *
 * The middle case deliberately yields to a fresh draft: a customer who picks
 * a new spot on top of an unrepresentable mount is choosing to replace it, and
 * that pick must reach the server.
 *
 * This mirrors the guard at the top of `handleSave` (widget-editor/page.tsx)
 * that refuses to post a config which never loaded over the account's real
 * one — same failure class, one level finer: a config that loaded but could
 * not be represented.
 */
export function inlineSaveSlice(
  draft: InlineMountDraft | null,
  storedUnrepresentable: boolean,
): { inline?: Record<string, unknown> | null } {
  if (!draft && storedUnrepresentable) return {};
  return { inline: inlineForPost(draft) };
}
