'use client';

import { useEffect, useRef } from 'react';
import {
  mountFromPick,
  type InlineMountDraft,
  type PendingInlinePick,
} from '@/lib/widget/inline-draft';
import type { InlineEnabled, InlinePreset, InlineTreatment } from '@/lib/widget/inline';

// Re-exported so existing imports of these two types from this file (the
// component used to be their only source) keep working — the shapes
// themselves now live in src/lib/widget/inline-draft.ts, alongside
// `inlineForPost`, so the save-time contract has a test surface that doesn't
// require rendering a component (see inline-draft.ts's file header).
export type { InlineMountDraft, PendingInlinePick };

const enabledOptions = (t: any): { value: InlineEnabled; label: string }[] => [
  { value: 'preview', label: t.widgetEditor.im_previewLinkOnly },
  { value: true, label: t.widgetEditor.im_liveForEveryone },
];

const presetOptions = (t: any): { value: InlinePreset; label: string }[] => [
  { value: 'hero', label: t.widgetEditor.im_presetHero },
  { value: 'bar', label: t.widgetEditor.im_presetBar },
];

const surfaceOptions = (t: any): { value: InlineTreatment; label: string }[] => [
  { value: 'bare', label: t.widgetEditor.im_transparent },
  { value: 'glass', label: t.widgetEditor.im_glass },
  { value: 'solid', label: t.widgetEditor.im_solid },
];

const cardStyle = {
  background: 'rgba(255,255,255,0.03)',
  borderColor: 'var(--dash-glass-border)',
} as const;

const selectStyle = {
  background: 'var(--dash-bar)',
  color: 'var(--dash-text)',
  border: '1px solid var(--dash-glass-border)',
} as const;

/**
 * "Where does Bestie sit on the site" — the customer picks a real element on
 * their own live page (via the picker mode in `WidgetDraftPreview`) and this
 * section turns that pick into a draft, lets them adjust how it's dressed
 * (preset/surface), decide who sees it (preview-only vs. every visitor —
 * see inline-draft.ts's `InlineMountDraft` doc comment for why there is no
 * third "off but remembered" option here), and remove it entirely.
 *
 * Deliberately does not own `picking` — the page does, because it's also
 * what `WidgetDraftPreview` needs (see widget-editor/page.tsx). This
 * component only asks to start/stop via `onStartPicking` and reflects the
 * current state back.
 */
export default function InlineMountSection({
  value,
  onChange,
  onStartPicking,
  picking,
  pendingPick,
  pickFailed,
  unrepresentable,
  domain,
  t,
}: {
  /** Dashboard strings bundle, handed down by the widget editor that owns this. */
  t: any;
  value: InlineMountDraft | null;
  onChange: (next: InlineMountDraft | null) => void;
  /** Toggles picking on/off — see widget-editor/page.tsx, which owns the flag itself. */
  onStartPicking: () => void;
  picking: boolean;
  /** A fresh pick just arrived from the preview iframe and hasn't been folded into `value` yet. */
  pendingPick?: PendingInlinePick | null;
  /**
   * The last click inside the preview was refused — no id or class chain on
   * the element (or its nearest ancestors) that the save path would store.
   * The picker stays armed; this only tells the customer why nothing happened.
   */
  pickFailed?: boolean;
  /**
   * The account HAS a stored mount, but one this editor cannot represent — a
   * hand-written combinator selector, an attribute selector, `enabled: false`.
   * `value` is null in that case, so without this the section shows the same
   * empty state as an account that never configured anything, and the
   * customer has no way to know why. See `storedInlineIsUnrepresentable` in
   * lib/widget/inline-draft for what the save path does about it.
   */
  unrepresentable?: boolean;
  /** The account's registered site domain, for the `?bestie=1` preview-link hint. Optional — the hint just degrades without it. */
  domain?: string | null;
}) {
  // Read the latest value/onChange without making the effect below
  // re-subscribe (and re-fire) on every render — the same pattern
  // WidgetDraftPreview already uses for `onPick`/`draft`, for the same
  // reason: this section re-renders on every keystroke elsewhere on the
  // page, and `onChange` typically arrives as a fresh arrow each time.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Folds a new pick into the draft exactly once per pick (keyed on the
  // pick's own identity, not on every render) — the page clears
  // `pendingPick` back to null once it has consumed this call, so a pick
  // that arrives while the customer is mid-edit elsewhere doesn't get
  // reapplied on unrelated re-renders.
  useEffect(() => {
    if (!pendingPick) return;
    onChangeRef.current(mountFromPick(pendingPick, valueRef.current));
  }, [pendingPick]);

  function patch(next: Partial<InlineMountDraft>) {
    if (!value) return;
    onChange({ ...value, ...next });
  }

  // One notice, two picking branches (nothing configured yet, and re-picking
  // an existing mount) — the refusal reads the same in both.
  const pickFailedNotice = pickFailed ? (
    <p className="text-xs" style={{ color: '#dc2626' }}>{t.widgetEditor.im_cantPickElement}</p>
  ) : null;

  const previewLink = domain
    ? `${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/?bestie=1`
    : null;

  return (
    <div className="rounded-xl border p-6 space-y-4" style={cardStyle}>
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--dash-text)' }}>{t.widgetEditor.im_sectionTitle}</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--dash-text-2)' }}>
          {t.widgetEditor.im_introA}
          {t.widgetEditor.im_introB}
        </p>
      </div>

      {!value && unrepresentable ? (
        <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
          {t.widgetEditor.im_managedPlacementA}
          {t.widgetEditor.im_managedPlacementB}
        </p>
      ) : null}

      {!value ? (
        picking ? (
          <div
            className="rounded-lg border p-3 space-y-2"
            style={{ borderColor: 'var(--color-primary)', background: 'var(--dash-bar)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
              {t.widgetEditor.im_clickElementEllipsis}
            </p>
            <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
              {t.widgetEditor.im_pickHintA}
              {t.widgetEditor.im_pickHintB}
            </p>
            {pickFailedNotice}
            <button
              type="button"
              onClick={onStartPicking}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--dash-bar)', color: 'var(--dash-text)', border: '1px solid var(--dash-glass-border)' }}
            >{t.widgetEditor.im_cancel}</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartPicking}
            className="px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >{t.widgetEditor.im_choosePlace}</button>
        )
      ) : (
        <div className="space-y-4">
          <div
            className="rounded-lg border p-3 space-y-1.5"
            style={{ borderColor: 'var(--dash-glass-border)', background: 'var(--dash-bar)' }}
          >
            <p className="text-sm" style={{ color: 'var(--dash-text)' }}>{t.widgetEditor.im_chosenPlace}<span dir="ltr" className="font-mono">{value.label || value.selector}</span>
            </p>
            {value.measured ? (
              <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
                {t.widgetEditor.im_chosenHeight}{value.measured.desktop}px
                {value.measured.mobile && value.measured.mobile !== value.measured.desktop
                  ? ` (${t.widgetEditor.im_onMobile}${value.measured.mobile}px)`
                  : ''}
              </p>
            ) : null}
            {value.theme.accent ? (
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                <span
                  aria-hidden="true"
                  className="inline-block w-3.5 h-3.5 rounded-full border"
                  style={{ background: value.theme.accent, borderColor: 'var(--dash-glass-border)' }}
                />
                {t.widgetEditor.im_detectedTint}{value.theme.accent}
              </span>
            ) : null}

            {picking ? (
              <>
                {pickFailedNotice}
                <button
                  type="button"
                  onClick={onStartPicking}
                  className="mt-1 text-xs font-medium"
                  style={{ color: 'var(--dash-text)' }}
                >
                  {t.widgetEditor.im_clickElementCancel}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onStartPicking}
                className="mt-1 text-xs font-medium"
                style={{ color: 'var(--color-primary)' }}
              >{t.widgetEditor.im_chooseAnother}</button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                {t.widgetEditor.im_spreadLabel}
              </label>
              <select
                value={value.preset}
                onChange={(e) => patch({ preset: e.target.value as InlinePreset })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={selectStyle}
              >
                {presetOptions(t).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                {t.widgetEditor.im_surfaceLabel}
              </label>
              <select
                value={value.surface}
                onChange={(e) => patch({ surface: e.target.value as InlineTreatment })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={selectStyle}
              >
                {surfaceOptions(t).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div role="radiogroup" aria-label={t.widgetEditor.im_audienceLabel} className="space-y-1.5">
            <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
              {t.widgetEditor.im_noOffNeeded}
            </p>
            {enabledOptions(t).map((opt) => (
              <label key={String(opt.value)} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--dash-text)' }}>
                <input
                  type="radio"
                  name="inline-enabled"
                  checked={value.enabled === opt.value}
                  onChange={() => patch({ enabled: opt.value })}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {value.enabled === 'preview' ? (
            <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
              {t.widgetEditor.im_previewExplainA} <code dir="ltr">?bestie=1</code>
              {' '}{t.widgetEditor.im_previewExplainB}
              {previewLink ? <>: <span dir="ltr" className="font-mono">{previewLink}</span></> : '.'}
            </p>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ color: '#dc2626', border: '1px solid var(--dash-glass-border)' }}
            >
              {t.widgetEditor.remove}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
