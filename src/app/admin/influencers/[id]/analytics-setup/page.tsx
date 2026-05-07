'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

interface Provisioning {
  account_id: string;
  gsc_site_url: string | null;
  gsc_status: string;
  gsc_last_fetch: string | null;
  retention_days: number;
}

const SERVICE_ACCOUNT_HINT =
  'הוסיפו את כתובת המייל של ה-Service Account של bestieAI כ-Verified User בנכס שלכם ב-Google Search Console. הכתובת מופיעה ב-GOOGLE_SERVICE_ACCOUNT_KEY (השדה client_email).';

export default function AnalyticsSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Provisioning | null>(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/admin/analytics/provisioning?accountId=${id}`);
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j?.error || 'failed');
        setData(j.provisioning);
        setSiteUrl(j.provisioning?.gsc_site_url || '');
      } catch (e: any) {
        if (alive) setError(e?.message || 'failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/analytics/provisioning', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id, gscSiteUrl: siteUrl.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'failed');
      setSavedAt(new Date().toLocaleTimeString('he-IL'));
      const refresh = await fetch(`/api/admin/analytics/provisioning?accountId=${id}`);
      const rj = await refresh.json();
      setData(rj.provisioning);
    } catch (e: any) {
      setError(e?.message || 'failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6 bg-gray-50" dir="rtl">
        <p>טוען…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-gray-50" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Link href={`/admin/influencers/${id}`} className="text-sm text-blue-600 hover:underline">
            ← חזרה לפרופיל החשבון
          </Link>
          <h1 className="text-2xl font-bold mt-2">הגדרת אנליטיקס</h1>
          <p className="text-sm text-gray-600 mt-1">
            חבר את החשבון ל-Google Search Console כדי לראות בדשבורד את שאילתות החיפוש שדרכן משתמשים מגיעים לאתר.
          </p>
        </div>

        <section className="bg-white rounded-2xl border p-5 space-y-4">
          <h2 className="font-semibold">Google Search Console</h2>

          <div>
            <label htmlFor="gsc-site" className="block text-sm font-medium text-gray-700">
              GSC Site URL
            </label>
            <input
              id="gsc-site"
              type="text"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="sc-domain:example.co.il"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              dir="ltr"
            />
            <p className="mt-2 text-xs text-gray-500">
              דוגמאות: <code>sc-domain:argania-oil.co.il</code> (Domain property) או{' '}
              <code>https://www.example.com/</code> (URL-prefix property).
            </p>
          </div>

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            {SERVICE_ACCOUNT_HINT}
          </div>

          {data && (
            <dl className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <dt>סטטוס</dt>
              <dd>
                <span className={statusColor(data.gsc_status)}>{statusLabel(data.gsc_status)}</span>
              </dd>
              <dt>שאיבה אחרונה</dt>
              <dd>{data.gsc_last_fetch ? new Date(data.gsc_last_fetch).toLocaleString('he-IL') : 'אף פעם'}</dd>
              <dt>שמירת נתונים</dt>
              <dd>{data.retention_days} ימים</dd>
            </dl>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
          {savedAt && !error && <div className="text-sm text-green-600">נשמר ב-{savedAt}. הסנכרון הראשון יקרה ב-cron הבא (04:00 UTC).</div>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-black text-white text-sm font-medium py-2 rounded-md disabled:opacity-50"
          >
            {saving ? 'שומר…' : 'שמור'}
          </button>
        </section>
      </div>
    </main>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case 'connected':
      return 'מחובר ✓';
    case 'pending':
      return 'ממתין לסנכרון';
    case 'permission_denied':
      return 'אין הרשאה — הוסיפו את ה-service account';
    case 'auth_failed':
      return 'שגיאת אימות';
    case 'error':
      return 'שגיאה';
    case 'disabled':
      return 'כבוי';
    default:
      return s;
  }
}

function statusColor(s: string): string {
  switch (s) {
    case 'connected':
      return 'text-green-700 font-medium';
    case 'permission_denied':
    case 'auth_failed':
    case 'error':
      return 'text-red-700 font-medium';
    case 'pending':
      return 'text-amber-700 font-medium';
    default:
      return 'text-gray-700';
  }
}
