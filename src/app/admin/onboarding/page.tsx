'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Copy, Check, ExternalLink } from 'lucide-react';

const BRAND = '#9334EB';

export default function OnboardingLinkPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [clientName, setClientName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/admin')
      .then((r) => r.json())
      .then((d) => { if (d.authenticated) setAuthed(true); else router.push('/admin'); })
      .catch(() => router.push('/admin'));
  }, [router]);

  async function create() {
    if (!clientName.trim() || creating) return;
    setCreating(true); setErr(''); setLink('');
    try {
      const res = await fetch('/api/admin/onboarding/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, email, mobile }),
      });
      const json = await res.json();
      if (!res.ok || !json.link) { setErr('יצירת הקישור נכשלה'); return; }
      setLink(json.link);
    } catch {
      setErr('יצירת הקישור נכשלה');
    } finally {
      setCreating(false);
    }
  }

  function copy() {
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }

  function reset() {
    setLink(''); setClientName(''); setEmail(''); setMobile(''); setErr('');
  }

  if (!authed) return <div className="p-8 text-gray-400">טוען…</div>;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="w-6 h-6" style={{ color: BRAND }} />
        <h1 className="text-2xl font-extrabold text-[#1f2937]">אונבורדינג — יצירת קישור ללקוח</h1>
      </div>
      <p className="text-sm text-[#6b7280] mb-6">
        מלא/י שם, מייל ונייד של הלקוח → קבל/י קישור לשליחה. הלקוח ימלא את שאר הפרטים ויחבר אינסטגרם בעצמו,
        ובסיום הסריקה הוא (וגם הצוות) מקבלים הודעה.
      </p>

      {!link ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <Field label="שם הלקוח" value={clientName} onChange={setClientName} placeholder="למשל: דנה כהן / המותג" required />
          <Field label="אימייל" value={email} onChange={setEmail} placeholder="client@email.com" type="email" />
          <Field label="נייד (וואטסאפ)" value={mobile} onChange={setMobile} placeholder="05x-xxxxxxx" type="tel" />
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button
            onClick={create}
            disabled={!clientName.trim() || creating}
            className="w-full py-3 rounded-xl text-white font-bold disabled:opacity-40"
            style={{ background: BRAND }}
          >
            {creating ? 'יוצר…' : 'צור קישור'}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-green-600 font-semibold mb-3">
            <Check className="w-5 h-5" /> הקישור מוכן — שלח/י אותו ללקוח
          </div>
          <div className="flex items-center gap-2">
            <input readOnly value={link} className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono bg-gray-50" />
            <button onClick={copy} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5 shrink-0" style={{ background: BRAND }}>
              {copied ? <><Check className="w-4 h-4" />הועתק</> : <><Copy className="w-4 h-4" />העתק</>}
            </button>
          </div>
          <div className="flex items-center justify-between mt-4">
            <a href={link} target="_blank" rel="noreferrer" className="text-sm font-medium flex items-center gap-1" style={{ color: BRAND }}>
              <ExternalLink className="w-4 h-4" /> תצוגה מקדימה
            </a>
            <button onClick={reset} className="text-sm text-gray-500 font-medium">צור קישור נוסף</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type, required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-[#374151]">{label}{required && <span className="text-red-500"> *</span>}</span>
      <input
        type={type || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
      />
    </label>
  );
}
