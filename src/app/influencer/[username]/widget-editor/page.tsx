'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Save, Loader2, Check } from 'lucide-react';
import { fetchInfluencerByUsername } from '@/lib/influencer/client';
import { activeOverrides, resolveBanner, resolveInvitation } from '@/lib/widget/banner';
import { WidgetDraftPreview } from '@/components/influencer/WidgetDraftPreview';

/**
 * Widget editor — customer-facing control for `config.widget.banner`, with a
 * live preview of the real widget (not a re-implementation of it).
 *
 * Only the headline is editable here. The rest of the banner's fields
 * (eyebrow, subline, CTA, starters, invitation bubbles, reel selection,
 * scheduled promotions) are separate follow-on work — this page's job is the
 * shell: load the account, hold a draft, drive the preview iframe on every
 * change, and save through the shared /api/influencer/settings endpoint.
 */
export default function WidgetEditorPage() {
  const params = useParams();
  const username = params.username as string;

  const [accountId, setAccountId] = useState<string>('');
  const [brandName, setBrandName] = useState<string>('');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [headline, setHeadline] = useState('');
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
        // Seed the field with whatever is live today — including the generic
        // fallback headline accounts with a reel rotation get automatically —
        // so the customer edits what they're actually looking at, not a blank
        // box next to a banner that already says something else.
        const current = resolveBanner(rawConfig, 'widget', { brandName: name });
        setHeadline(current?.headline || '');
      } catch (err) {
        console.error('[widget-editor] failed to load account:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  // The banner as it will be stored: whatever is already there, headline
  // replaced with the field's current value. Preserving the rest matters —
  // /api/influencer/settings replaces `widget.banner` wholesale, so dropping
  // an existing eyebrow/subline/CTA here would silently erase it on save.
  const currentBanner = config?.widget?.banner || null;
  const bannerDraft = useMemo(
    () => ({ ...(currentBanner || {}), headline }),
    [currentBanner, headline],
  );

  // Same layering the live widget goes through — the default banner PLUS
  // whatever scheduled override is active right now — so a headline edit
  // that a live promotion is covering shows exactly what production shows:
  // the override, not the edit. That mismatch is expected and is what the
  // notice below explains.
  const previewConfig = useMemo(() => {
    if (!config) return null;
    return { ...config, widget: { ...(config.widget || {}), banner: bannerDraft } };
  }, [config, bannerDraft]);

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
          widget: { banner: bannerDraft },
        }),
      });
      if (res.ok) {
        setConfig((prev: any) => prev ? { ...prev, widget: { ...(prev.widget || {}), banner: bannerDraft } } : prev);
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
                כותרת ראשית
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="היי, אני העוזר של המותג. שאלו אותי כל דבר."
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--dash-bar)',
                  color: 'var(--dash-text)',
                  border: '1px solid var(--dash-glass-border)',
                }}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                השורה הראשונה שהמבקר רואה כשהווידג׳ט נפתח.
              </p>
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
