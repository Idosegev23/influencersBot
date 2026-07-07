'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { PageHeader } from '@/components/admin/PageHeader';

export default function AgentSettingsPage() {
  const [profile, setProfile] = useState({ username: '', full_name: '', contact_email: '', whatsapp: '' });
  const [loading, setLoading] = useState(true);
  const [pBusy, setPBusy] = useState(false);
  const [pMsg, setPMsg] = useState('');
  const [pw, setPw] = useState({ a: '', b: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  // agency branding
  const [brand, setBrand] = useState({ name: '', phone: '', email: '', address: '', commission_pct: '' });
  const [hasLogo, setHasLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bBusy, setBBusy] = useState(false);
  const [bMsg, setBMsg] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/agent/settings/profile').then((r) => r.json()),
      fetch('/api/agent/settings/branding').then((r) => r.json()),
    ])
      .then(([p, b]) => {
        setProfile({ username: p.username || '', full_name: p.full_name || '', contact_email: p.contact_email || '', whatsapp: p.whatsapp || '' });
        if (b.agency) {
          setBrand({ name: b.agency.name || '', phone: b.agency.phone || '', email: b.agency.email || '', address: b.agency.address || '', commission_pct: b.agency.commission_pct ?? '' });
          setHasLogo(!!b.agency.has_logo);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setPBusy(true);
    setPMsg('');
    try {
      const res = await fetch('/api/agent/settings/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
      });
      const d = await res.json();
      setPMsg(res.ok ? '✓ נשמר' : d.error || 'שגיאה');
    } finally {
      setPBusy(false);
    }
  };

  const saveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setBBusy(true);
    setBMsg('');
    try {
      const fd = new FormData();
      fd.append('name', brand.name);
      fd.append('phone', brand.phone);
      fd.append('email', brand.email);
      fd.append('address', brand.address);
      fd.append('commission_pct', String(brand.commission_pct ?? ''));
      if (logoFile) fd.append('logo', logoFile);
      const res = await fetch('/api/agent/settings/branding', { method: 'POST', body: fd });
      const d = await res.json();
      setBMsg(res.ok ? '✓ נשמר' : d.error || 'שגיאה');
      if (res.ok) {
        if (d.has_logo) setHasLogo(true);
        setLogoFile(null);
      }
    } finally {
      setBBusy(false);
    }
  };

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    if (pw.a.length < 8) return setPwMsg('לפחות 8 תווים');
    if (pw.a !== pw.b) return setPwMsg('הסיסמאות אינן תואמות');
    setPwBusy(true);
    try {
      const res = await fetch('/api/agent/settings/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw.a }),
      });
      const d = await res.json();
      setPwMsg(res.ok ? '✓ הסיסמה עודכנה' : d.error || 'שגיאה');
      if (res.ok) setPw({ a: '', b: '' });
    } finally {
      setPwBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[color:var(--brand)]" /></div>;

  return (
    <div dir="rtl" className="max-w-xl">
      <PageHeader eyebrow="הגדרות" title="הפרופיל שלי" description="פרטי הקשר משמשים לשיוך הצעות שמגיעות במייל ובוואטסאפ" />

      <form onSubmit={saveProfile} className="grid gap-4 mb-8 p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)]">
        <Field label="שם משתמש"><input className="ui-input" dir="ltr" value={profile.username} disabled /></Field>
        <Field label="שם מלא / סוכנות"><input className="ui-input" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></Field>
        <Field label="אימייל (לשיוך הצעות)"><input className="ui-input" dir="ltr" type="email" value={profile.contact_email} onChange={(e) => setProfile({ ...profile, contact_email: e.target.value })} /></Field>
        <Field label="וואטסאפ"><input className="ui-input" dir="ltr" value={profile.whatsapp} onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} /></Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pBusy} className="ui-btn ui-btn-solid gap-1.5">{pBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}שמירה</button>
          {pMsg && <span className="text-[13px] text-[color:var(--ink-600)]">{pMsg}</span>}
        </div>
      </form>

      {/* Agency branding — appears on the quote PDF */}
      <form onSubmit={saveBranding} className="grid gap-4 mb-8 p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)]">
        <div className="text-[13px] font-semibold text-[color:var(--ink-900)]">מיתוג הסוכנות (מופיע על הצעת המחיר)</div>
        <Field label="שם הסוכנות"><input className="ui-input" value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="טלפון"><input className="ui-input" dir="ltr" value={brand.phone} onChange={(e) => setBrand({ ...brand, phone: e.target.value })} /></Field>
          <Field label="אימייל"><input className="ui-input" dir="ltr" type="email" value={brand.email} onChange={(e) => setBrand({ ...brand, email: e.target.value })} /></Field>
        </div>
        <Field label="כתובת"><input className="ui-input" value={brand.address} onChange={(e) => setBrand({ ...brand, address: e.target.value })} /></Field>
        <Field label="אחוז עמלת מכירות (%) — לחישוב עמלה בסקירה"><input className="ui-input" dir="ltr" type="number" value={brand.commission_pct} onChange={(e) => setBrand({ ...brand, commission_pct: e.target.value })} /></Field>
        <Field label="לוגו (PNG/JPG)">
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="text-[13px]" />
          <span className="block text-[12px] text-[color:var(--ink-500)] mt-1">
            {logoFile ? `נבחר: ${logoFile.name}` : hasLogo ? 'לוגו קיים — העלה קובץ חדש כדי להחליף' : 'לא הועלה לוגו'}
          </span>
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={bBusy} className="ui-btn ui-btn-solid gap-1.5">{bBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}שמירת מיתוג</button>
          {bMsg && <span className="text-[13px] text-[color:var(--ink-600)]">{bMsg}</span>}
        </div>
      </form>

      <form onSubmit={savePw} className="grid gap-4 p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)]">
        <div className="text-[13px] font-semibold text-[color:var(--ink-900)]">החלפת סיסמה</div>
        <Field label="סיסמה חדשה"><input className="ui-input" type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="אימות סיסמה"><input className="ui-input" type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} autoComplete="new-password" /></Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pwBusy} className="ui-btn ui-btn-solid">{pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'עדכון סיסמה'}</button>
          {pwMsg && <span className="text-[13px] text-[color:var(--ink-600)]">{pwMsg}</span>}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-[color:var(--ink-600)] mb-1.5">{label}</span>
      {children}
    </label>
  );
}
