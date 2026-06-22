'use client';

import { use, useEffect, useState } from 'react';

const PURPLE = '#883fe2';

export default function InvoiceUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/invoices/${token}/upload`)
      .then((r) => r.json())
      .then((d) => {
        setMeta(d);
        if (d?.uploaded) setDone(true);
      })
      .catch(() => setError('שגיאה בטעינה'))
      .finally(() => setLoading(false));
  }, [token]);

  const upload = async () => {
    if (!file) return setError('בחר/י קובץ');
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/invoices/${token}/upload`, { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) setDone(true);
      else setError(d.error || 'שגיאה');
    } catch {
      setError('שגיאה בהעלאה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="text-lg font-extrabold tracking-tight" style={{ color: PURPLE }}>Bestie</span>
        </div>
        <div className="bg-white rounded-2xl ring-1 ring-stone-200 p-7">
          {loading ? (
            <p className="text-center text-stone-400">טוען…</p>
          ) : !meta || meta.error ? (
            <p className="text-center text-stone-500">הקישור אינו תקין.</p>
          ) : done ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4" style={{ background: 'rgba(136,63,226,.1)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ color: PURPLE }}>
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 className="text-xl font-bold mb-2">החשבונית התקבלה</h1>
              <p className="text-sm text-stone-500">תודה! מעקב התשלום החל.</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold mb-1">העלאת חשבונית</h1>
              <p className="text-sm text-stone-500 mb-5">
                {meta.brand ? `עבור ${meta.brand} · ` : ''}
                {meta.amount ? `${Number(meta.amount).toLocaleString('en-US')} ${meta.currency || 'ILS'}` : ''}
              </p>
              <label className="block border-2 border-dashed border-stone-300 rounded-xl p-6 text-center cursor-pointer hover:border-[color:var(--p)] transition-colors" style={{ ['--p' as any]: PURPLE }}>
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <span className="text-sm text-stone-600">{file ? file.name : 'בחר/י קובץ PDF או תמונה'}</span>
              </label>
              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
              <button onClick={upload} disabled={busy || !file}
                className="mt-5 w-full rounded-full text-white py-3.5 text-[15px] font-semibold disabled:opacity-50"
                style={{ background: PURPLE }}>
                {busy ? 'מעלה…' : 'העלה חשבונית'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
