'use client';

import { useEffect, useRef } from 'react';
import type { InlinePick } from './WidgetDraftPreview';
import type {
  InlineEnabled,
  InlineMountMode,
  InlinePreset,
  InlineTreatment,
  InlineBubble,
  ResolvedInlineTheme,
} from '@/lib/widget/inline';

/**
 * The editable shape this section hands back through `onChange`.
 *
 * Mirrors `ResolvedInlineMount` (src/lib/widget/inline.ts) — the same
 * enabled/selector/mode/preset/surface/reserve/theme/bubble fields — plus two
 * fields that are display-only and never leave the browser as-is:
 *
 * - `label`: the human-readable selector the picker showed ("div.hero"),
 *   carried along so the "what did I pick" summary keeps working across a
 *   preset/surface edit without re-reading it off `selector`.
 * - `measured`: the picked element's real height, for the same "so the
 *   customer can trust it chose the right thing" reason `InlinePick` carries
 *   it (see that type's doc comment in WidgetDraftPreview.tsx). NOT the same
 *   number as `reserve` — do not conflate them here either.
 *
 * `enabled` also allows `false` here, which `ResolvedInlineMount` cannot:
 * the stored schema has no "picked but off" state — off IS absence (the
 * settings route deletes `widget.inline` outright once `resolveInlineMount`
 * returns null). Allowing `false` in this in-session draft lets a customer
 * flip the mount off without losing the selector/theme they just picked, so
 * turning it back on doesn't force a re-pick. widget-editor/page.tsx is
 * responsible for collapsing `enabled: false` (and `label`/`measured`) away
 * before POSTing — see `inlineForPost` there.
 */
/**
 * What this section actually needs from a pick — `InlinePick`
 * (WidgetDraftPreview.tsx) with `measured` loosened to optional.
 *
 * A real pick from the preview iframe always carries `measured` (it's
 * required on `InlinePick` itself), so this stays fully compatible with what
 * `WidgetDraftPreview`'s `onPick` actually delivers. Loosening it here is
 * about this component being honest about its own dependency, not about
 * accepting a lesser pick: `measured` is display-only in `mountFromPick`
 * below (see `InlineMountDraft`'s doc comment), so its absence just means
 * "no height to show," never a broken pick.
 */
export type PendingInlinePick = Omit<InlinePick, 'measured'> & { measured?: InlinePick['measured'] };

export interface InlineMountDraft {
  enabled: InlineEnabled | false;
  selector: string;
  mode: InlineMountMode;
  preset: InlinePreset;
  surface: InlineTreatment;
  reserve: { desktop: number; mobile: number };
  theme: ResolvedInlineTheme;
  bubble: InlineBubble;
  label?: string;
  measured?: { desktop: number; mobile: number };
}

/**
 * Turns a fresh pick from the preview iframe into a draft, preserving
 * whatever preset/surface/bubble/enabled the customer already had set on an
 * existing mount (re-picking a spot is not the same as starting over).
 *
 * `enabled` is the one field that does NOT carry over from `base` when there
 * is no base — a brand-new mount (picking for the first time, `base` null)
 * always lands on `'preview'`. Going live is a deliberate second act, never
 * the side effect of picking a spot.
 */
function mountFromPick(pick: PendingInlinePick, base: InlineMountDraft | null): InlineMountDraft {
  return {
    enabled: base?.enabled ?? 'preview',
    selector: pick.selector,
    mode: pick.mode,
    preset: base?.preset ?? 'hero',
    surface: base?.surface ?? 'bare',
    reserve: pick.reserve,
    theme: pick.theme,
    bubble: base?.bubble ?? 'after-scroll',
    label: pick.label,
    measured: pick.measured,
  };
}

const ENABLED_OPTIONS: { value: InlineEnabled | false; label: string }[] = [
  { value: false, label: 'כבוי' },
  { value: 'preview', label: 'תצוגה מקדימה (רק עם קישור)' },
  { value: true, label: 'פעיל לכל המבקרים' },
];

const PRESET_OPTIONS: { value: InlinePreset; label: string }[] = [
  { value: 'hero', label: 'מסך פתיחה מלא (Hero)' },
  { value: 'bar', label: 'רצועה קצרה (Bar)' },
];

const SURFACE_OPTIONS: { value: InlineTreatment; label: string }[] = [
  { value: 'bare', label: 'שקוף — בלי רקע משלו' },
  { value: 'glass', label: 'זכוכית — רקע מטושטש עדין' },
  { value: 'solid', label: 'מלא — רקע אחיד' },
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
 * (preset/surface), decide who sees it (the enabled tri-state), and remove
 * it entirely.
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
  domain,
}: {
  value: InlineMountDraft | null;
  onChange: (next: InlineMountDraft | null) => void;
  /** Toggles picking on/off — see widget-editor/page.tsx, which owns the flag itself. */
  onStartPicking: () => void;
  picking: boolean;
  /** A fresh pick just arrived from the preview iframe and hasn't been folded into `value` yet. */
  pendingPick?: PendingInlinePick | null;
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

  const previewLink = domain
    ? `${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/?bestie=1`
    : null;

  return (
    <div className="rounded-xl border p-6 space-y-4" style={cardStyle}>
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--dash-text)' }}>
          איפה בסטי יושב באתר
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--dash-text-2)' }}>
          היום בסטי מופיע כבועה בפינה. אפשר להושיב אותו גם בתוך הדף עצמו — בתוך
          אזור שאתם בוחרים באתר שלכם.
        </p>
      </div>

      {!value ? (
        picking ? (
          <div
            className="rounded-lg border p-3 space-y-2"
            style={{ borderColor: 'var(--color-primary)', background: 'var(--dash-bar)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
              לחצו על האלמנט באתר…
            </p>
            <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
              עברו לתצוגה המקדימה מימין ולחצו על האזור שבו בסטי צריך לשבת. אפשר
              לבטל בכל שלב.
            </p>
            <button
              type="button"
              onClick={onStartPicking}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--dash-bar)', color: 'var(--dash-text)', border: '1px solid var(--dash-glass-border)' }}
            >
              ביטול
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartPicking}
            className="px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            בחרו מקום באתר
          </button>
        )
      ) : (
        <div className="space-y-4">
          <div
            className="rounded-lg border p-3 space-y-1.5"
            style={{ borderColor: 'var(--dash-glass-border)', background: 'var(--dash-bar)' }}
          >
            <p className="text-sm" style={{ color: 'var(--dash-text)' }}>
              מקום שנבחר: <span dir="ltr" className="font-mono">{value.label || value.selector}</span>
            </p>
            {value.measured ? (
              <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
                גובה האזור שנבחר: {value.measured.desktop}px
                {value.measured.mobile && value.measured.mobile !== value.measured.desktop
                  ? ` (בנייד: ${value.measured.mobile}px)`
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
                גוון שזוהה באתר: {value.theme.accent}
              </span>
            ) : null}

            {picking ? (
              <button
                type="button"
                onClick={onStartPicking}
                className="mt-1 text-xs font-medium"
                style={{ color: 'var(--dash-text)' }}
              >
                לחצו על האלמנט באתר… (ביטול)
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartPicking}
                className="mt-1 text-xs font-medium"
                style={{ color: 'var(--color-primary)' }}
              >
                בחרו מקום אחר
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                איך בסטי מתפרס באזור
              </label>
              <select
                value={value.preset}
                onChange={(e) => patch({ preset: e.target.value as InlinePreset })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={selectStyle}
              >
                {PRESET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                עיצוב המשטח
              </label>
              <select
                value={value.surface}
                onChange={(e) => patch({ surface: e.target.value as InlineTreatment })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={selectStyle}
              >
                {SURFACE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div role="radiogroup" aria-label="למי מוצג בסטי במקום הזה" className="space-y-1.5">
            {ENABLED_OPTIONS.map((opt) => (
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
              בתצוגה מקדימה בסטי מוצג רק למי שמגיע עם קישור מיוחד — כדי לבדוק
              את זה בעצמכם, פתחו את האתר שלכם עם <code dir="ltr">?bestie=1</code>
              {' '}בסוף הכתובת
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
              הסרה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
