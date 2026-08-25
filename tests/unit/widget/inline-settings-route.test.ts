import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { inlineSaveSlice, storedInlineIsUnrepresentable, inlineForPost } from '@/lib/widget/inline-draft';
import { resolveInlineMount } from '@/lib/widget/inline';

/**
 * The three-way merge nothing tested: what the widget editor POSTs, what
 * /api/influencer/settings does with it, and what is left in
 * `accounts.config.widget.inline` afterwards.
 *
 * Every earlier suite stops one hop short. `inline-draft.test.ts` proves the
 * POST body's shape; the route's own `'inline' in body.widget` branch — the
 * thing that decides between "leave it alone" and "delete it" — had no test at
 * all. That is the gap the finding calls out: an editor that seeds its draft
 * from `resolveInlineMount` sees null for BOTH "no mount" and "a mount the
 * allowlist refuses", and posting `inline: null` for the second one erases a
 * row only an operator can recreate (per the spec's own Known gaps, `paths`,
 * `mode: 'replace'` and `mode: 'overlay'` exist nowhere but hand-set config).
 *
 * The route is imported and run for real here — the merge is asserted against
 * what it actually writes, not against a restatement of its logic.
 */

const { cookieGet, maybeSingleMock, updateMock, verifyMock } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  maybeSingleMock: vi.fn(),
  updateMock: vi.fn(),
  verifyMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock('@/lib/auth/session-token', () => ({
  verifySessionToken: (...a: unknown[]) => verifyMock(...a),
  influencerSubject: (u: string) => `influencer:${u}`,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      }),
      update: (patch: unknown) => {
        updateMock(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import { POST } from '@/app/api/influencer/settings/route';

/** The hand-set mount only an operator can produce — and only they can restore. */
const OPERATOR_MOUNT = {
  enabled: true,
  selector: 'section.hero > div',
  mode: 'replace',
  preset: 'bar',
  surface: 'solid',
  reserve: { desktop: 320, mobile: 120 },
  theme: { font: 'Poppins, sans-serif', accent: '#4c3e5e', radius: 12, ground: 'dark' },
  bubble: 'never',
  paths: ['/he', '/en'],
};

/** A stored mount the editor CAN represent — round-trips through the resolver. */
const EDITABLE_MOUNT = resolveInlineMount({
  widget: { inline: { enabled: 'preview', selector: '.content_home-c-hero' } },
})!;

function storedConfig(inline: unknown) {
  return {
    username: 'ldrs',
    widget: {
      domain: 'ldrsgroup.com',
      banner: { headline: 'לפני' },
      ...(inline === undefined ? {} : { inline }),
    },
  };
}

async function post(body: unknown) {
  return POST(new NextRequest('https://x/api/influencer/settings', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }));
}

/** The exact `widget` object the editor builds for an unrelated save. */
function editorWidgetBody(rawConfig: unknown) {
  const draft = resolveInlineMount(rawConfig);
  return {
    banner: { headline: 'אחרי' },
    ...inlineSaveSlice(draft, storedInlineIsUnrepresentable(rawConfig)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieGet.mockReturnValue({ value: 'token' });
  verifyMock.mockReturnValue(true);
});

async function saveAndRead(rawConfig: unknown, widget: unknown) {
  maybeSingleMock.mockResolvedValue({ data: { id: 'acc-1', config: rawConfig }, error: null });
  const res = await post({ username: 'ldrs', widget });
  expect(res.status).toBe(200);
  const written = (updateMock.mock.calls[0]?.[0] as { config: any })?.config;
  // Fixture guard: an assertion about `written.widget.inline` means nothing if
  // the route never wrote anything at all.
  expect(written).toBeTruthy();
  return written;
}

describe('POST /api/influencer/settings — the widget.inline merge', () => {
  it('keeps an operator-configured mount the editor cannot represent through an unrelated save', () => {
    const rawConfig = storedConfig(OPERATOR_MOUNT);
    // The premise, pinned: this really is a mount the editor cannot show.
    expect(resolveInlineMount(rawConfig)).toBeNull();
    expect(storedInlineIsUnrepresentable(rawConfig)).toBe(true);

    return saveAndRead(rawConfig, editorWidgetBody(rawConfig)).then((written) => {
      expect(written.widget.inline).toEqual(OPERATOR_MOUNT);
      // The save itself must still have happened — otherwise "the mount
      // survived" is just "the route did nothing".
      expect(written.widget.banner.headline).toBe('אחרי');
    });
  });

  it('deletes that same mount when the editor posts inline: null — the behaviour the omission exists to avoid', async () => {
    // This is the defect, kept executable. If `inlineSaveSlice` ever stops
    // omitting the key, the test above goes red and this one explains why.
    const rawConfig = storedConfig(OPERATOR_MOUNT);
    const written = await saveAndRead(rawConfig, { banner: { headline: 'אחרי' }, inline: null });
    expect('inline' in written.widget).toBe(false);
  });

  it('still deletes a representable mount when the customer presses remove', async () => {
    // The remove button posts a null draft with nothing unrepresentable
    // stored, and that must keep meaning "delete".
    const rawConfig = storedConfig(EDITABLE_MOUNT);
    expect(storedInlineIsUnrepresentable(rawConfig)).toBe(false);
    const widget = { banner: { headline: 'אחרי' }, ...inlineSaveSlice(null, false) };
    const written = await saveAndRead(rawConfig, widget);
    expect('inline' in written.widget).toBe(false);
  });

  it('leaves an account with no mount at all with no mount at all', async () => {
    const rawConfig = storedConfig(undefined);
    const written = await saveAndRead(rawConfig, editorWidgetBody(rawConfig));
    expect('inline' in written.widget).toBe(false);
    expect(written.widget.banner.headline).toBe('אחרי');
  });

  it('lets a fresh pick replace an operator-configured mount, because that is the customer choosing to', async () => {
    const rawConfig = storedConfig(OPERATOR_MOUNT);
    const picked = {
      enabled: 'preview' as const,
      selector: '.content_home-c-hero',
      mode: 'into' as const,
      preset: 'hero' as const,
      surface: 'bare' as const,
      reserve: { desktop: 0, mobile: 0 },
      theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'light' as const },
      bubble: 'after-scroll' as const,
      paths: null,
    };
    const widget = { banner: { headline: 'אחרי' }, ...inlineSaveSlice(picked, true) };
    const written = await saveAndRead(rawConfig, widget);
    expect(written.widget.inline).toEqual(resolveInlineMount({ widget: { inline: inlineForPost(picked) } }));
    expect(written.widget.inline.selector).toBe('.content_home-c-hero');
  });

  it('round-trips a representable mount through an unrelated save unchanged', async () => {
    const rawConfig = storedConfig(EDITABLE_MOUNT);
    const written = await saveAndRead(rawConfig, editorWidgetBody(rawConfig));
    expect(written.widget.inline).toEqual(EDITABLE_MOUNT);
  });
});
