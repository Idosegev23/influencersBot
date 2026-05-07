'use client';

import { useState, useEffect, use } from 'react';
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  Image as ImageIcon,
  Send,
  Heart,
} from 'lucide-react';

type Context = {
  brand: string;
  order_number: string | null;
  fname: string;
  feedback_status: string | null;
  feedback_responded_at: string | null;
};

type Stage = 'loading' | 'choose' | 'issue_form' | 'thanks_positive' | 'thanks_issue' | 'already' | 'error';

export default function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [issueText, setIssueText] = useState('');
  const [issueFile, setIssueFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/feedback/${token}`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setStage('error');
          return;
        }
        const data = (await res.json()) as Context;
        if (cancelled) return;
        setCtx(data);
        if (data.feedback_status === 'positive' || data.feedback_status === 'issue') {
          setStage('already');
        } else {
          setStage('choose');
        }
      } catch {
        if (!cancelled) setStage('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handlePositive() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feedback/${token}/positive`, { method: 'POST' });
      if (res.ok) {
        setStage('thanks_positive');
      } else {
        alert('שליחה נכשלה — נסי שוב');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleIssueSubmit() {
    const txt = issueText.trim();
    if (!txt) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('body', txt);
      if (issueFile) fd.append('file', issueFile);
      const res = await fetch(`/api/feedback/${token}/issue`, {
        method: 'POST',
        body: fd,
      });
      if (res.ok) {
        setStage('thanks_issue');
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`שליחה נכשלה: ${data.message || data.error || 'שגיאה'}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === 'loading') {
    return (
      <Shell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#883fe2' }} />
        </div>
      </Shell>
    );
  }

  if (stage === 'error') {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-3 py-6">
            <AlertTriangle className="w-10 h-10 mx-auto" style={{ color: '#ef4444' }} />
            <h2 className="text-lg font-semibold">הקישור לא תקף</h2>
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              ייתכן שהוא פג תוקף או שמדובר בלינק שגוי. אם פנית לתמיכה, פני שוב או חזרי להודעות הוואטסאפ.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (stage === 'already') {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-3 py-6">
            <CheckCircle className="w-10 h-10 mx-auto" style={{ color: '#22c55e' }} />
            <h2 className="text-lg font-semibold">כבר ענית 🤍</h2>
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              תודה! הפידבק שלך נשמר ומועבר לטיפול הצוות של {ctx?.brand}.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (stage === 'thanks_positive') {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-3 py-6">
            <Heart className="w-10 h-10 mx-auto" style={{ color: '#ec4899' }} fill="#ec4899" />
            <h2 className="text-lg font-semibold">תודה רבה! 🤍</h2>
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              שמחים שאת מרוצה. אם תצטרכי משהו, אנחנו כאן.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (stage === 'thanks_issue') {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-3 py-6">
            <CheckCircle className="w-10 h-10 mx-auto" style={{ color: '#22c55e' }} />
            <h2 className="text-lg font-semibold">קיבלנו, תודה</h2>
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              הצוות של {ctx?.brand} יחזור אלייך בהקדם בוואטסאפ. שמרנו את הפרטים שמסרת.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (stage === 'issue_form') {
    return (
      <Shell>
        <Card>
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <AlertTriangle className="w-8 h-8 mx-auto" style={{ color: '#fbbf24' }} />
              <h2 className="text-lg font-semibold">ספרי לנו מה קרה</h2>
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                את יכולה לצרף תמונה אם זה עוזר.
              </p>
            </div>

            <textarea
              value={issueText}
              onChange={(e) => setIssueText(e.target.value.slice(0, 1500))}
              placeholder="מה הבעיה? פרטים יעזרו לנו לטפל מהר יותר"
              rows={6}
              className="w-full text-sm p-3 rounded-xl outline-none resize-y"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <div className="flex items-center justify-between text-[11px]" style={{ color: '#9ca3af' }}>
              <span>{issueText.length} / 1500</span>
              <label className="cursor-pointer flex items-center gap-1.5"
                style={{ color: issueFile ? '#22c55e' : '#9ca3af' }}>
                <ImageIcon className="w-4 h-4" />
                {issueFile ? `✓ ${issueFile.name}` : 'הוסיפי תמונה (לא חובה)'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 10 * 1024 * 1024) {
                      alert('הקובץ גדול מ-10MB');
                      e.target.value = '';
                      return;
                    }
                    setIssueFile(f || null);
                  }}
                />
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStage('choose')}
                disabled={submitting}
                className="px-4 py-3 rounded-xl text-sm font-medium flex-1"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
              >
                חזרה
              </button>
              <button
                onClick={handleIssueSubmit}
                disabled={!issueText.trim() || submitting}
                className="px-4 py-3 rounded-xl text-sm font-semibold flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: '#fbbf24', color: '#1f2937' }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <Send className="w-4 h-4" />
                שליחה לצוות
              </button>
            </div>
          </div>
        </Card>
      </Shell>
    );
  }

  // stage === 'choose'
  return (
    <Shell>
      <Card>
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <div className="text-3xl">📦</div>
            <h2 className="text-xl font-semibold">{ctx?.fname ? `היי ${ctx.fname}!` : 'היי 🤍'}</h2>
            <p className="text-sm" style={{ color: '#d1d5db' }}>
              המשלוח שלך מ-<span className="font-semibold">{ctx?.brand}</span> הגיע 🤍
            </p>
            {ctx?.order_number && (
              <p className="text-[11px]" style={{ color: '#6b7280' }}>
                הזמנה {ctx.order_number}
              </p>
            )}
            <p className="text-sm pt-3" style={{ color: '#fff' }}>איך זה היה?</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handlePositive}
              disabled={submitting}
              className="w-full px-4 py-4 rounded-2xl text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-transform active:scale-95"
              style={{ background: '#22c55e', color: '#fff' }}
            >
              {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
              <CheckCircle className="w-5 h-5" />
              הכל מצוין 🤍
            </button>

            <button
              onClick={() => setStage('issue_form')}
              disabled={submitting}
              className="w-full px-4 py-4 rounded-2xl text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-transform active:scale-95"
              style={{ background: '#fbbf24', color: '#1f2937' }}
            >
              <AlertTriangle className="w-5 h-5" />
              יש לי בעיה
            </button>
          </div>

          <p className="text-[11px] text-center" style={{ color: '#6b7280' }}>
            התגובה שלך נשלחת ישירות לצוות התמיכה של {ctx?.brand}
          </p>
        </div>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0b0b0f 0%, #1a0f2a 100%)', color: '#fff' }}
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-6 shadow-2xl"
      style={{
        background: 'rgba(20, 20, 28, 0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {children}
    </div>
  );
}
