'use client';

import { useEffect, useState } from 'react';

interface Sources {
  instagram: string;
  website: string;
  youtube: string;
  tiktok: string;
}
interface Counts {
  instagramPosts: number;
  youtubePosts: number;
  tiktokPosts: number;
  transcriptions: number;
  websitePages: number;
  products: number;
}

const FIELDS: { key: keyof Sources; label: string; icon: string; placeholder: string }[] = [
  { key: 'instagram', label: 'אינסטגרם', icon: 'photo_camera', placeholder: 'שם משתמש או קישור פרופיל' },
  { key: 'website', label: 'אתר', icon: 'language', placeholder: 'https://example.com' },
  { key: 'youtube', label: 'יוטיוב', icon: 'smart_display', placeholder: '@handle או קישור ערוץ' },
  { key: 'tiktok', label: 'טיקטוק', icon: 'music_note', placeholder: '@handle או קישור פרופיל' },
];

/**
 * Sources & re-scan card for the account detail page: shows the links everything
 * was scraped from + what each produced, lets the admin add/edit links, and
 * re-scans off them (demo → light recent-items scan, real → full scan).
 */
export default function SourcesPanel({ accountId }: { accountId: string }) {
  const [sources, setSources] = useState<Sources>({ instagram: '', website: '', youtube: '', tiktok: '' });
  const [counts, setCounts] = useState<Counts | null>(null);
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/accounts/${accountId}/sources`);
        if (res.ok) {
          const data = await res.json();
          setSources(data.sources);
          setCounts(data.counts);
          setIsDemo(data.isDemo);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [accountId]);

  const set = (key: keyof Sources, v: string) => setSources((s) => ({ ...s, [key]: v }));
  const hasAny = Object.values(sources).some((v) => v.trim());

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/sources`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sources),
      });
      setMsg(res.ok ? { text: 'המקורות נשמרו', ok: true } : { text: 'שגיאה בשמירה', ok: false });
    } catch {
      setMsg({ text: 'שגיאה בשמירה', ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function rescan() {
    const modeLabel = isDemo ? 'סריקת דמו (פריטים אחרונים בלבד)' : 'סריקה מלאה של הכל';
    if (!confirm(`להתחיל ${modeLabel} על בסיס המקורות שהוזנו?`)) return;
    setScanning(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sources),
      });
      const data = await res.json();
      if (res.ok && data.jobId) {
        window.location.href = `/admin/scan/${data.jobId}`;
      } else {
        setMsg({ text: data.error || 'שגיאה בהפעלת סריקה', ok: false });
        setScanning(false);
      }
    } catch {
      setMsg({ text: 'שגיאה בהפעלת סריקה', ok: false });
      setScanning(false);
    }
  }

  const countChips: { label: string; value: number }[] = counts
    ? [
        { label: 'פוסטים IG', value: counts.instagramPosts },
        { label: 'סרטוני יוטיוב', value: counts.youtubePosts },
        { label: 'סרטוני טיקטוק', value: counts.tiktokPosts },
        { label: 'תמלולים', value: counts.transcriptions },
        { label: 'עמודי אתר', value: counts.websitePages },
        { label: 'מוצרים', value: counts.products },
      ]
    : [];

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-extrabold text-[#474747]">מקורות וסריקה מחדש</h2>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={
            isDemo
              ? { color: '#9334EB', backgroundColor: 'rgba(147, 52, 235, 0.1)' }
              : { color: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.1)' }
          }
        >
          {isDemo ? 'דמו · סריקה קלה' : 'חשבון אמיתי · סריקה מלאה'}
        </span>
      </div>
      <p className="text-sm text-[#8a8a8a] mb-4">
        הקישורים שמהם נשאב התוכן. הוסף/ערוך ואז סרוק מחדש — {isDemo ? 'דמו סורק את הפריטים האחרונים בלבד' : 'חשבון אמיתי סורק הכל'}.
      </p>

      {/* What each source produced */}
      {counts && (
        <div className="flex flex-wrap gap-2 mb-5">
          {countChips.map((c) => (
            <span
              key={c.label}
              className="text-xs text-[#4b5563] bg-[#f3f4f6] rounded-full px-3 py-1"
            >
              {c.label}: <b className="text-[#474747]">{c.value}</b>
            </span>
          ))}
        </div>
      )}

      {/* Editable source links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="flex items-center gap-1.5 text-sm font-medium text-[#474747] mb-1">
              <span className="material-symbols-outlined text-[18px] text-[#9334EB]">{f.icon}</span>
              {f.label}
            </span>
            <input
              value={sources[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={loading}
              dir="ltr"
              className="w-full px-3 py-2 rounded-xl text-sm text-[#474747] bg-[#fafafa] outline-none focus:bg-white transition-colors"
              style={{ border: '1px solid rgba(186, 177, 161, 0.3)' }}
            />
          </label>
        ))}
      </div>

      {msg && (
        <div className="text-sm mb-3" style={{ color: msg.ok ? '#059669' : '#DC2627' }}>
          {msg.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={rescan}
          disabled={scanning || loading || !hasAny}
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50"
          style={{ backgroundColor: '#9334EB' }}
        >
          {scanning ? 'מפעיל סריקה…' : 'סרוק מחדש'}
        </button>
        <button
          onClick={save}
          disabled={saving || loading}
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#474747] bg-white shadow-sm transition-all disabled:opacity-50"
          style={{ border: '1px solid rgba(186, 177, 161, 0.3)' }}
        >
          {saving ? 'שומר…' : 'שמור מקורות'}
        </button>
      </div>
    </div>
  );
}
