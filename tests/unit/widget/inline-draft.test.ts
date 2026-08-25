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
  const draft: InlineMountDraft = {
    enabled: 'preview',
    selector: '.hero',
    mode: 'into',
    preset: 'hero',
    surface: 'bare',
    reserve: { desktop: 0, mobile: 0 },
    theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'dark' },
    bubble: 'after-scroll',
    paths: ['/'],
    // Display-only — must not affect the posted (or resolved) shape.
    label: 'div.hero',
    measured: { desktop: 748, mobile: 512 },
  };

  it('round-trips through resolveInlineMount exactly — the seam the settings route itself exercises', () => {
    // This is the assertion that makes the seam un-silenceable: it fails the
    // moment a field is added to InlineMountDraft/ResolvedInlineMount and not
    // carried through inlineForPost, or is posted in a shape the resolver
    // rejects. It is what would have caught `paths` being dropped.
    const resolved = resolveInlineMount({ widget: { inline: inlineForPost(draft) } });
    const { label, measured, ...persisted } = draft;
    void label;
    void measured;
    expect(resolved).toEqual(persisted);
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
