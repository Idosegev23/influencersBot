import { describe, it, expect } from 'vitest';
import { resolveInlineMount } from '@/lib/widget/inline';
import { inlineForPost, mountFromPick, type InlineMountDraft } from '@/lib/widget/inline-draft';

/**
 * The widget editor's save-time `widget.inline` construction — the seam
 * between InlineMountSection's draft state and what actually reaches
 * /api/influencer/settings. A prior version of `inlineForPost` omitted
 * `paths` from the posted shape, which silently erased a configured page
 * scope on every unrelated save (the settings route replaces `widget.inline`
 * wholesale rather than merging it — see src/lib/widget/inline.ts's doc
 * comment on `ResolvedInlineMount.paths` for what that costs on the
 * customer's live site). This suite pins the contract that catches that
 * defect class mechanically instead of by review, the same way
 * widget-editor-save.test.ts's "carries every untouched key through
 * unchanged" test does for the banner.
 */
describe('inlineForPost', () => {
  // Every field below is set to a value that DIFFERS from
  // resolveInlineMount's own fallback default for that field (see
  // src/lib/widget/inline.ts: mode->'into', preset->'hero', surface->'bare',
  // bubble->'after-scroll', reserve->{0,0}, theme.font->'inherit',
  // theme.ground->'dark', theme.accent->null, paths->null). A fixture that
  // happened to match a default would make the round-trip assertion below
  // pass even if inlineForPost silently dropped that field — the resolver's
  // own fallback would quietly stand in for it and the comparison would
  // still hold. That is exactly how `paths` went missing from this function
  // once already without any test catching it (see the file header).
  //
  // This is deliberately NOT a realistic pick — the picker only ever emits
  // `mode: 'into'` / `preset: 'hero'` (see WidgetDraftPreview.tsx's
  // InlinePick doc comment). Do not "fix" these back toward what a real
  // pick looks like; realism is not this fixture's job, distinguishability
  // from the defaults is.
  const draft: InlineMountDraft = {
    enabled: 'preview',
    selector: '.hero',
    mode: 'overlay',
    preset: 'bar',
    surface: 'glass',
    reserve: { desktop: 240, mobile: 80 },
    theme: { font: 'Poppins, sans-serif', accent: '#4c3e5e', radius: 8, ground: 'light' },
    bubble: 'always',
    paths: ['/vip'],
    // Display-only — must not affect the posted (or resolved) shape.
    label: 'div.hero',
    measured: { desktop: 748, mobile: 512 },
  };

  it('round-trips through resolveInlineMount exactly — the seam the settings route itself exercises', () => {
    // This is the assertion that makes the seam un-silenceable: with a
    // fixture where every field differs from the resolver's fallback
    // default (see the comment on `draft` above), dropping ANY of the nine
    // fields from inlineForPost's output makes this comparison fail, because
    // the resolver would fill the gap with its own default instead of the
    // fixture's value. Verified per-field in task-4-report.md — a table of
    // nine rows, one per field, each confirmed to turn this assertion red
    // when that field is deleted from inlineForPost's return value.
    const resolved = resolveInlineMount({ widget: { inline: inlineForPost(draft) } });
    const { label, measured, ...persisted } = draft;
    void label;
    void measured;
    expect(resolved).toEqual(persisted);
  });

  // The assertion above is only as strong as the fixture's distance from
  // resolveInlineMount's own fallback defaults — a fixture value that
  // happened to MATCH a default would let that field be silently dropped by
  // inlineForPost and the round-trip test would stay green anyway, because
  // the resolver's fallback would stand in unnoticed (this is exactly how
  // `paths` fell through once already). This is the permanent, automated
  // version of the nine-row manual check reported in task-4-report.md: one
  // subtest per field of `ResolvedInlineMount`, each proving that deleting
  // that field from `inlineForPost`'s output actually changes what
  // `resolveInlineMount` resolves to. If a future field is added here and
  // this list isn't updated, that's a gap this suite can't self-detect —
  // but for the nine fields that exist today, every one is covered.
  const RESOLVED_FIELDS = [
    'enabled', 'selector', 'mode', 'preset', 'surface',
    'reserve', 'theme', 'bubble', 'paths',
  ] as const;

  it.each(RESOLVED_FIELDS)('dropping "%s" from the posted shape is detected by the round-trip assertion', (field) => {
    const posted = inlineForPost(draft) as Record<string, unknown>;
    delete posted[field];
    const resolved = resolveInlineMount({ widget: { inline: posted } });
    const { label, measured, ...persisted } = draft;
    void label;
    void measured;
    // NOT toEqual: dropping the field must produce something different from
    // the fixture (the resolver's default filling the gap), never the same
    // object by coincidence.
    expect(resolved).not.toEqual(persisted);
  });

  it('never posts label or measured — display-only, must not leave the browser', () => {
    const posted = inlineForPost(draft) as Record<string, unknown>;
    expect(posted).not.toHaveProperty('label');
    expect(posted).not.toHaveProperty('measured');
  });

  it('carries paths through untouched — dropping it silently reintroduces the document-wide MutationObserver + false inline_mount_missing diagnostic inline.ts exists to prevent', () => {
    const posted = inlineForPost({ ...draft, paths: ['/', '/shop'] }) as Record<string, unknown>;
    expect(posted.paths).toEqual(['/', '/shop']);
  });

  it('defaults an unset paths to null (every page) rather than dropping the key entirely', () => {
    const { paths, ...withoutPaths } = draft;
    void paths;
    const posted = inlineForPost(withoutPaths as InlineMountDraft) as Record<string, unknown>;
    expect('paths' in posted).toBe(true);
    expect(posted.paths).toBeNull();
  });

  it('collapses a null draft (nothing configured, or the customer removed it) to no mount at all', () => {
    expect(inlineForPost(null)).toBeNull();
  });
});

/**
 * `mountFromPick` — turns a fresh pick from the preview iframe into a draft.
 * Covers the one thing InlineMountSection's own component tests don't touch
 * directly: that re-picking an EXISTING mount preserves fields the customer
 * already set (including `paths`, which this component never exposes UI
 * for), while a brand-new mount always lands on preview.
 */
describe('mountFromPick', () => {
  const pick = {
    selector: '.hero',
    label: 'div.hero',
    mode: 'into' as const,
    reserve: { desktop: 0, mobile: 0 },
    measured: { desktop: 480, mobile: 0 },
    theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'dark' as const },
  };

  it('a brand-new mount always defaults to preview, never straight to live', () => {
    expect(mountFromPick(pick, null).enabled).toBe('preview');
  });

  it('re-picking an existing mount preserves its enabled/preset/surface/bubble/paths, and takes the new selector', () => {
    const base: InlineMountDraft = {
      enabled: true,
      selector: '.old-spot',
      mode: 'into',
      preset: 'bar',
      surface: 'glass',
      reserve: { desktop: 0, mobile: 0 },
      theme: pick.theme,
      bubble: 'always',
      paths: ['/shop'],
    };
    const next = mountFromPick(pick, base);
    expect(next.enabled).toBe(true);
    expect(next.preset).toBe('bar');
    expect(next.surface).toBe('glass');
    expect(next.bubble).toBe('always');
    expect(next.paths).toEqual(['/shop']);
    expect(next.selector).toBe('.hero');
  });
});
