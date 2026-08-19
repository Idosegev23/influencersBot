'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Save, Loader2, Check } from 'lucide-react';
import { fetchInfluencerByUsername } from '@/lib/influencer/client';
import { activeOverrides, resolveBanner, resolveInvitation, MAX_INVITATION } from '@/lib/widget/banner';
import { WidgetDraftPreview } from '@/components/influencer/WidgetDraftPreview';

// Caps mirrored from src/lib/widget/banner.ts (not exported there, so kept in
// sync with resolveBanner's own MAX_EYEBROW/MAX_HEADLINE/MAX_SUBLINE/CTA/label
// constants by hand). MAX_INVITATION *is* exported and imported above — the
// two invitation fields go through resolveInvitation, which is shared code,
// so that cap must never drift from banner.ts.
const MAX_EYEBROW = 32;
const MAX_HEADLINE = 70;
const MAX_SUBLINE = 110;
const MAX_CTA_LABEL = 32;
const MAX_CTA_VALUE = 200;
const MAX_STARTERS_LABEL = 40;
const MAX_STARTER_ITEM = 80;
const MAX_STARTER_ITEMS = 4;

/**
 * Widget editor — customer-facing control for `config.widget.banner` and the
 * launcher's invitation bubbles, with a live preview of the real widget (not
 * a re-implementation of it).
 *
 * Covers the banner's copy fields (eyebrow, headline, subline, CTA, starter
 * questions) and the two invitation bubbles (`config.widget.teaser`/
 * `tooltip`). Reel selection and scheduled promotions remain separate
 * follow-on work. This page's job is: load the account, hold a draft, drive
 * the preview iframe on every change, and save through the shared
 * /api/influencer/settings endpoint.
 */
// Shared appearance for every text input on this page — pulled out once
// rather than repeated per field, matching the object Task 5 wrote inline
// for the headline input.
const inputStyle = {
  background: 'var(--dash-bar)',
  color: 'var(--dash-text)',
  border: '1px solid var(--dash-glass-border)',
} as const;

export default function WidgetEditorPage() {
  const params = useParams();
  const username = params.username as string;

  const [accountId, setAccountId] = useState<string>('');
  const [brandName, setBrandName] = useState<string>('');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [eyebrow, setEyebrow] = useState('');
  const [headline, setHeadline] = useState('');
  const [subline, setSubline] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaValue, setCtaValue] = useState('');
  const [startersLabel, setStartersLabel] = useState('');
  const [starterItems, setStarterItems] = useState<string[]>([]);
  const [teaser, setTeaser] = useState('');
  const [tooltip, setTooltip] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const influencer = await fetchInfluencerByUsername(username);
        if (!influencer || cancelled) return;
        const rawConfig = (influencer as any)._rawConfig || {};
        const name = influencer.display_name || influencer.username || '';
        setAccountId(influencer.id);
        setBrandName(name);
        setConfig(rawConfig);
        // Seed every field with whatever is live today — including the
        // generic fallback headline accounts with a reel rotation get
        // automatically — so the customer edits what they're actually
        // looking at, not a blank box next to a banner that already says
        // something else.
        const current = resolveBanner(rawConfig, 'widget', { brandName: name });
        const invitation = resolveInvitation(rawConfig, 'widget');
        setEyebrow(current?.eyebrow || '');
        setHeadline(current?.headline || '');
        setSubline(current?.subline || '');
        setCtaLabel(current?.cta?.label || '');
        setCtaValue(current?.cta?.value || '');
        setStartersLabel(current?.starters?.label || '');
        setStarterItems(current?.starters?.items || []);
        setTeaser(invitation.teaser || '');
        setTooltip(invitation.tooltip || '');
      } catch (err) {
        console.error('[widget-editor] failed to load account:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  // The list of starter questions the customer actually typed, trimmed and
  // emptied of blank rows. An empty result must be saved as `null`, never
  // `[]` — a present-but-empty list at the boundary reads as "the customer
  // wants zero starters" and suppresses the dynamic defaults, while `null`
  // means "unset, fall back to /api/widget/chips". Clearing every row must
  // restore the dynamic chips, not blank the section.
  const filledStarterItems = useMemo(
    () => starterItems.map((s) => s.trim()).filter(Boolean),
    [starterItems],
  );

  // The banner as it will be stored: whatever is already there, with every
  // editable field replaced by its current draft value. Preserving the rest
  // matters — /api/influencer/settings replaces `widget.banner` wholesale, so
  // dropping an existing field here (art, valueLine, anything this page
  // doesn't expose yet) would silently erase it on save.
  const currentBanner = config?.widget?.banner || null;
  const bannerDraft = useMemo(
    () => ({
      ...(currentBanner || {}),
      eyebrow,
      headline,
      subline,
      cta: { ...(currentBanner?.cta || {}), label: ctaLabel, value: ctaValue },
      starters: {
        ...(currentBanner?.starters || {}),
        label: startersLabel.trim() || null,
        items: filledStarterItems.length ? filledStarterItems : null,
      },
    }),
    [currentBanner, eyebrow, headline, subline, ctaLabel, ctaValue, startersLabel, filledStarterItems],
  );

  // Same layering the live widget goes through — the default banner PLUS
  // whatever scheduled override is active right now — so a headline edit
  // that a live promotion is covering shows exactly what production shows:
  // the override, not the edit. That mismatch is expected and is what the
  // notice below explains. `teaser`/`tooltip` live one level up from the
  // banner (`config.widget.teaser`/`tooltip`), which is why they're spread in
  // here rather than folded into bannerDraft.
  const previewConfig = useMemo(() => {
    if (!config) return null;
    return {
      ...config,
      widget: { ...(config.widget || {}), banner: bannerDraft, teaser, tooltip },
    };
  }, [config, bannerDraft, teaser, tooltip]);

  const previewDraft = useMemo(() => {
    if (!previewConfig) return null;
    return {
      banner: resolveBanner(previewConfig, 'widget', { brandName }),
      invitation: resolveInvitation(previewConfig, 'widget'),
      primaryColor: config?.widget?.primaryColor || config?.theme?.colors?.primary || null,
    };
  }, [previewConfig, brandName, config]);

  const liveOverride = useMemo(() => {
    if (!config) return null;
    return activeOverrides(config, 'widget')[0] || null;
  }, [config]);

  function addStarterItem() {
    setStarterItems((items) => (items.length >= MAX_STARTER_ITEMS ? items : [...items, '']));
  }
  function updateStarterItem(index: number, value: string) {
    setStarterItems((items) => items.map((it, i) => (i === index ? value : it)));
  }
  function removeStarterItem(index: number) {
    setStarterItems((items) => items.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/influencer/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          widget: { banner: bannerDraft, teaser, tooltip },
        }),
      });
      if (res.ok) {
        setConfig((prev: any) => prev
          ? { ...prev, widget: { ...(prev.widget || {}), banner: bannerDraft, teaser, tooltip } }
          : prev);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'שמירה נכשלה');
      }
    } catch (err) {
      console.error('[widget-editor] save failed:', err);
      setError('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-slide-up" style={{ background: 'transparent' }}>
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 animate-slide-up"
          style={{ borderColor: 'var(--color-primary)' }}
        ></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 animate-slide-up" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <div className="max-w-6xl mx-auto space-y-6 animate-slide-up">
        <div>
          <h1 className="text-4xl font-bold" style={{ color: 'var(--dash-text)' }}>עורך הווידג׳ט</h1>
          <p className="mt-2" style={{ color: 'var(--dash-text-2)' }}>
            ערכו את מה שהווידג׳ט מציג ברגע הראשון, עם תצוגה מקדימה חיה של הווידג׳ט האמיתי.
          </p>
        </div>

        {liveOverride ? (
          <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: '#FFF4E5', color: '#7a4b00' }}>
            כרגע פעיל מבצע מתוזמן ({liveOverride.from || 'ללא תאריך התחלה'} – {liveOverride.until || 'ללא תאריך סיום'}) שדורס חלק מהשדות למטה.
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── Form ── */}
          <div
            className="rounded-xl border p-6 space-y-4"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}
          >
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                תגית עילית
              </label>
              <input
                type="text"
                value={eyebrow}
                onChange={(e) => setEyebrow(e.target.value)}
                maxLength={MAX_EYEBROW}
                placeholder="לדוגמה: חדש"
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                שורה קצרה מעל הכותרת. {eyebrow.length}/{MAX_EYEBROW} תווים.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                כותרת ראשית
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={MAX_HEADLINE}
                placeholder="היי, אני העוזר של המותג. שאלו אותי כל דבר."
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                השורה הראשונה שהמבקר רואה כשהווידג׳ט נפתח. {headline.length}/{MAX_HEADLINE} תווים.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                שורת משנה
              </label>
              <input
                type="text"
                value={subline}
                onChange={(e) => setSubline(e.target.value)}
                maxLength={MAX_SUBLINE}
                placeholder="משפט קצר שמסביר מה אפשר לשאול"
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                {subline.length}/{MAX_SUBLINE} תווים.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                  טקסט כפתור
                </label>
                <input
                  type="text"
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  maxLength={MAX_CTA_LABEL}
                  placeholder="לדוגמה: דברו איתי"
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {ctaLabel.length}/{MAX_CTA_LABEL} תווים.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                  מה הכפתור עושה
                </label>
                <input
                  type="text"
                  value={ctaValue}
                  onChange={(e) => setCtaValue(e.target.value)}
                  maxLength={MAX_CTA_VALUE}
                  placeholder="הטקסט שיוזן אוטומטית לתיבת הצ׳אט"
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {ctaValue.length}/{MAX_CTA_VALUE} תווים.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                כותרת לרשימת השאלות
              </label>
              <input
                type="text"
                value={startersLabel}
                onChange={(e) => setStartersLabel(e.target.value)}
                maxLength={MAX_STARTERS_LABEL}
                placeholder="לדוגמה: שאלות נפוצות"
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                {startersLabel.length}/{MAX_STARTERS_LABEL} תווים.
              </p>
            </div>

            <div>
              <p className="text-xs text-[#655e51]">
                בלי שאלות משלכם, הוויג׳ט מציע שאלות שמתעדכנות לבד לפי התוכן שלכם.
                ברגע שתכתבו שאלות כאן, הן יוצגו כמו שהן ולא יתעדכנו.
              </p>
              <div className="space-y-2 mt-2">
                {starterItems.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => updateStarterItem(index, e.target.value)}
                      maxLength={MAX_STARTER_ITEM}
                      placeholder={`שאלה ${index + 1}`}
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => removeStarterItem(index)}
                      className="px-3 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--dash-bar)', color: '#dc2626', border: '1px solid var(--dash-glass-border)' }}
                    >
                      הסרה
                    </button>
                  </div>
                ))}
              </div>
              {starterItems.length < MAX_STARTER_ITEMS ? (
                <button
                  type="button"
                  onClick={addStarterItem}
                  className="mt-2 text-xs font-medium"
                  style={{ color: 'var(--color-primary)' }}
                >
                  + הוספת שאלה
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                  בועה שמופיעה מעצמה
                </label>
                <input
                  type="text"
                  value={teaser}
                  onChange={(e) => setTeaser(e.target.value)}
                  maxLength={MAX_INVITATION}
                  placeholder="לדוגמה: יש לי הנחה בשבילך 👋"
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {teaser.length}/{MAX_INVITATION} תווים.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                  בועה ליד הכפתור הסגור
                </label>
                <input
                  type="text"
                  value={tooltip}
                  onChange={(e) => setTooltip(e.target.value)}
                  maxLength={MAX_INVITATION}
                  placeholder="לדוגמה: שאלו אותי כל דבר"
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {tooltip.length}/{MAX_INVITATION} תווים.
                </p>
              </div>
            </div>

            {error ? (
              <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>
            ) : null}

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 shadow-lg hover:shadow-xl"
                style={{ background: saved ? '#17A34A' : 'var(--color-primary)', color: '#fff' }}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saved ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saved ? 'נשמר!' : 'שמירה'}
              </button>
            </div>
          </div>

          {/* ── Live preview ── */}
          <div className="lg:sticky lg:top-6">
            {accountId && previewDraft ? (
              <WidgetDraftPreview accountId={accountId} draft={previewDraft} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
