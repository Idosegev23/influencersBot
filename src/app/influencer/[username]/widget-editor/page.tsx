'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Save, Loader2, Check } from 'lucide-react';
import { fetchInfluencerByUsername } from '@/lib/influencer/client';
import {
  activeOverrides,
  resolveBanner,
  resolveInvitation,
  MAX_INVITATION,
  type ResolvedBanner,
} from '@/lib/widget/banner';
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
  // What a visitor sees RIGHT NOW — the resolved banner/invitation, including
  // any live scheduled override. Used only for placeholder text, never to
  // seed an input's value (see the load effect below for why).
  const [resolvedBanner, setResolvedBanner] = useState<ResolvedBanner | null>(null);
  const [resolvedInvitation, setResolvedInvitation] = useState<{ teaser: string | null; tooltip: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 'open' (default, unchanged banner preview) shows the chat panel, the
  // only way to see banner copy. 'teaser'/'tooltip' show the launcher
  // instead and ask widget.js to render exactly one bubble — the widget's
  // own mutual-exclusion logic means the teaser always wins if both were
  // asked to render at once (it has no empty-text bail and unconditionally
  // clears the tooltip), so each field gets its own view rather than
  // sharing a single "closed" state.
  const [previewView, setPreviewView] = useState<'open' | 'teaser' | 'tooltip'>('open');

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
        // Seed every field from the STORED base — never from a resolver's
        // merged output. resolveBanner/resolveInvitation layer any currently
        // active scheduled override on top of the base before returning, so
        // seeding from them would bake a temporary promotion's copy into the
        // permanent config the moment the customer saves an unrelated field
        // (and it would keep showing after the promotion's `until` date
        // passes — the config no longer reflects "no promotion", it reflects
        // "promotion, forever"). The base is what these inputs edit; the
        // resolved values below are used only as placeholders, so an empty
        // field still shows what a visitor sees right now.
        const rawBanner = rawConfig?.widget?.banner || null;
        setEyebrow(rawBanner?.eyebrow || '');
        setHeadline(rawBanner?.headline || '');
        setSubline(rawBanner?.subline || '');
        setCtaLabel(rawBanner?.cta?.label || '');
        setCtaValue(rawBanner?.cta?.value || '');
        setStartersLabel(rawBanner?.starters?.label || '');
        setStarterItems(rawBanner?.starters?.items || []);
        setTeaser(rawConfig?.widget?.teaser || '');
        setTooltip(rawConfig?.widget?.tooltip || '');

        setResolvedBanner(resolveBanner(rawConfig, 'widget', { brandName: name }));
        setResolvedInvitation(resolveInvitation(rawConfig, 'widget'));
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
      // Accounts with reels but no stored banner get one automatically —
      // resolveBanner's fallback fires only while `widget.banner` is
      // undefined/null. The moment this editor writes ANY object there
      // (which it always does, even with every field left blank), that
      // fallback stops applying unless `enabled` says so explicitly. Default
      // true so a reel-only account's banner keeps resolving after its first
      // save here; preserve an existing explicit `false` so a banner someone
      // deliberately turned off does not get silently resurrected.
      enabled: currentBanner?.enabled !== false,
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
            כרגע פעיל מבצע מתוזמן ({liveOverride.from || 'ללא תאריך התחלה'} – {liveOverride.until || 'ללא תאריך סיום'}) שמכסה חלק מהשדות למטה בתצוגה המקדימה ובווידג׳ט החי.
            השדות כאן עורכים את הבסיס — מה שיחזור להיות פעיל ברגע שהמבצע יסתיים. שמירה כאן לא משנה את המבצע עצמו.
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
                placeholder={resolvedBanner?.eyebrow || 'לדוגמה: חדש'}
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
                placeholder={resolvedBanner?.headline || 'היי, אני העוזר של המותג. שאלו אותי כל דבר.'}
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
                placeholder={resolvedBanner?.subline || 'משפט קצר שמסביר מה אפשר לשאול'}
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
                  placeholder={resolvedBanner?.cta?.label || 'לדוגמה: דברו איתי'}
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
                  placeholder={resolvedBanner?.cta?.value || 'הטקסט שיוזן אוטומטית לתיבת הצ׳אט'}
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
                placeholder={resolvedBanner?.starters?.label || 'לדוגמה: שאלות נפוצות'}
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
                  placeholder={resolvedInvitation?.teaser || 'לדוגמה: יש לי הנחה בשבילך 👋'}
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
                  placeholder={resolvedInvitation?.tooltip || 'לדוגמה: שאלו אותי כל דבר'}
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {tooltip.length}/{MAX_INVITATION} תווים. שדה ריק יציג טקסט ברירת מחדל כללי.
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
            <div className="flex justify-end gap-2 mb-2">
              <button
                type="button"
                onClick={() => setPreviewView('open')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: previewView === 'open' ? 'var(--color-primary)' : 'var(--dash-bar)',
                  color: previewView === 'open' ? '#fff' : 'var(--dash-text)',
                  border: '1px solid var(--dash-glass-border)',
                }}
              >
                צ׳אט פתוח
              </button>
              <button
                type="button"
                onClick={() => setPreviewView('teaser')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: previewView === 'teaser' ? 'var(--color-primary)' : 'var(--dash-bar)',
                  color: previewView === 'teaser' ? '#fff' : 'var(--dash-text)',
                  border: '1px solid var(--dash-glass-border)',
                }}
              >
                בועת הזמנה
              </button>
              <button
                type="button"
                onClick={() => setPreviewView('tooltip')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: previewView === 'tooltip' ? 'var(--color-primary)' : 'var(--dash-bar)',
                  color: previewView === 'tooltip' ? '#fff' : 'var(--dash-text)',
                  border: '1px solid var(--dash-glass-border)',
                }}
              >
                טולטיפ
              </button>
            </div>
            {accountId && previewDraft ? (
              <WidgetDraftPreview accountId={accountId} draft={previewDraft} view={previewView} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
