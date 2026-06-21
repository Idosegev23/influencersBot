'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserCircle } from 'lucide-react';

export default function AgentProfileOnboarding() {
  const [fullName, setFullName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!contactEmail.trim() || !whatsapp.trim()) {
      setError('אימייל ומספר וואטסאפ הם שדות חובה');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/agent/onboarding/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, contact_email: contactEmail, whatsapp }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(data.redirect || '/agent');
      } else {
        setError(data.error || 'שגיאה');
      }
    } catch {
      setError('שגיאה בשמירה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen admin-panel flex items-center justify-center p-4" dir="rtl">
      <div className="relative w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(147, 52, 235, 0.12)', border: '1px solid rgba(147, 52, 235, 0.18)' }}
          >
            <UserCircle className="w-10 h-10" style={{ color: '#9334EB' }} />
          </div>
        </div>

        <div className="admin-card p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold mb-1" style={{ color: '#ede9f8' }}>פרטי הסוכן</h1>
            <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.45)' }}>
              נדרשים כדי לשייך הצעות שמגיעות אליך במייל ובוואטסאפ
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="admin-input"
              placeholder="שם מלא / שם הסוכנות"
              autoFocus
            />
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="admin-input"
              placeholder="אימייל (שממנו תשלח הצעות)"
              dir="ltr"
              required
            />
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="admin-input"
              placeholder="מספר וואטסאפ (054-0000000)"
              dir="ltr"
              required
            />

            {error && (
              <div className="pill pill-red px-4 py-3 text-sm text-center w-full justify-center">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn-solid w-full py-3.5 font-medium text-base disabled:opacity-50">
              {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'סיום והתחלה'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
