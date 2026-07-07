'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  token: string;
  title: string;
  status: 'pending' | 'opened' | 'signed' | 'expired' | 'cancelled';
  signerName: string | null;
  signerEmail: string | null;
  signedAt: string | null;
  documentUrl: string;
  signedUrl: string | null;
};

const PURPLE = '#883fe2';

export default function SignClient(props: Props) {
  const [signerName, setSignerName] = useState(props.signerName ?? '');
  const [signerEmail, setSignerEmail] = useState(props.signerEmail ?? '');
  const [signerRole, setSignerRole] = useState('');
  const [signerNotes, setSignerNotes] = useState('');
  const [signerIdNumber, setSignerIdNumber] = useState('');
  const [signerCompany, setSignerCompany] = useState('');
  const [signerCompanyHp, setSignerCompanyHp] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ signed_at: string; signed_url: string } | null>(null);
  const [showReq, setShowReq] = useState(false);
  const [changeNotes, setChangeNotes] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqDone, setReqDone] = useState(false);

  if (props.status === 'signed') return <AlreadySigned {...props} />;
  if (props.status === 'expired' || props.status === 'cancelled') return <Expired status={props.status} />;
  if (done) return <ThankYou title={props.title} signedAt={done.signed_at} signedUrl={done.signed_url} />;
  if (reqDone) return <ChangeRequested title={props.title} />;

  const submit = async () => {
    setError(null);
    if (!signerName.trim()) return setError('יש להזין שם מלא');
    if (!agreed) return setError('יש לאשר את ההצעה ואת תנאיה לפני החתימה');

    let signatureImage: string | null = null;
    let typed: string | null = null;
    if (mode === 'draw') {
      signatureImage = canvasGetDataUrl();
      if (!signatureImage) return setError('יש לחתום בתיבה לפני השליחה');
    } else {
      typed = typedName.trim();
      if (!typed) return setError('יש להקליד את השם בכתב יד');
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/signatures/${props.token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signer_name: signerName.trim(),
          signer_email: signerEmail.trim() || null,
          signer_role: signerRole.trim() || null,
          signer_notes: signerNotes.trim() || null,
          signer_id_number: signerIdNumber.trim() || null,
          signer_company: signerCompany.trim() || null,
          signer_company_hp: signerCompanyHp.trim() || null,
          signature_image: signatureImage,
          typed_name: typed,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setDone(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const requestChange = async () => {
    setError(null);
    if (!changeNotes.trim()) return setError('פרט/י מה תרצה/י לשנות בהצעה');
    setReqSubmitting(true);
    try {
      const res = await fetch(`/api/signatures/${props.token}/request-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: changeNotes.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setReqDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReqSubmitting(false);
    }
  };

  const inputCls =
    'w-full bg-white ring-1 ring-stone-300 focus:ring-2 focus:ring-[color:var(--p)] rounded-lg px-4 py-3 text-[15px] text-stone-800 outline-none transition-all';

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 text-stone-900" style={{ ['--p' as any]: PURPLE }}>
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-extrabold tracking-tight" style={{ color: PURPLE }}>Bestie</span>
          <span className="text-[10px] tracking-[0.3em] uppercase text-stone-400 font-medium">מסמך לחתימה</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 md:py-12">
        <p className="text-[11px] tracking-[0.3em] uppercase text-stone-400 mb-3 font-medium">חתימת לקוח</p>
        <h1 className="text-[28px] md:text-[36px] leading-[1.1] font-bold tracking-tight">{props.title}</h1>
        <p className="mt-3 text-[14px] text-stone-500 max-w-xl leading-relaxed">
          לאחר אישורך, עותק חתום יישמר במערכת והסוכן יקבל הודעה. חתימה מהווה אישור ההצעה והסכמה לתנאיה.
        </p>

        {/* PDF preview */}
        <section className="mt-8 rounded-xl ring-1 ring-stone-200 bg-white overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between border-b border-stone-100">
            <span className="text-[10px] tracking-[0.28em] uppercase text-stone-400 font-medium">צפייה במסמך</span>
            <a href={props.documentUrl} target="_blank" rel="noopener noreferrer"
               className="text-[12px] text-stone-500 hover:text-[color:var(--p)] transition-colors font-medium">
              פתח בכרטיסייה ↗
            </a>
          </div>
          <iframe src={props.documentUrl} className="w-full h-[52vh] bg-white" title={props.title} />
        </section>

        {/* Form */}
        <section className="mt-8 grid gap-4">
          <Field label="שם מלא · כפי שיופיע על המסמך החתום *">
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="מייל">
              <input type="email" dir="ltr" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field label="תפקיד">
              <input value={signerRole} onChange={(e) => setSignerRole(e.target.value)} placeholder="מנכ״ל / מנהלת שיווק" className={inputCls} />
            </Field>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="ת.ז.">
              <input dir="ltr" inputMode="numeric" value={signerIdNumber} onChange={(e) => setSignerIdNumber(e.target.value)} className={inputCls} />
            </Field>
            <Field label="שם החברה">
              <input value={signerCompany} onChange={(e) => setSignerCompany(e.target.value)} className={inputCls} />
            </Field>
            <Field label="ח.פ.">
              <input dir="ltr" inputMode="numeric" value={signerCompanyHp} onChange={(e) => setSignerCompanyHp(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="הערות (לא חובה)">
            <textarea rows={2} value={signerNotes} onChange={(e) => setSignerNotes(e.target.value)} className={inputCls} />
          </Field>

          {/* Signature box */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] tracking-[0.28em] uppercase text-stone-400 font-medium">חתימה *</span>
              <div className="flex items-center gap-2 text-[12px] font-medium">
                {(['draw', 'type'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className="px-3 py-1 rounded-full ring-1 transition-colors"
                    style={mode === m
                      ? { background: PURPLE, color: '#fff', borderColor: PURPLE }
                      : { background: '#fff', color: '#78716c' }}>
                    {m === 'draw' ? 'ציור' : 'הקלדה'}
                  </button>
                ))}
              </div>
            </div>
            {mode === 'draw' ? (
              <SignaturePad />
            ) : (
              <input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="הקלד את שמך כאן"
                className="w-full bg-white text-stone-800 rounded-lg px-5 py-6 text-[26px] font-medium text-center outline-none ring-1 ring-stone-300" />
            )}
          </div>

          <label className="flex items-start gap-3 mt-1 cursor-pointer select-none">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4" style={{ accentColor: PURPLE }} />
            <span className="text-[14px] text-stone-700 leading-relaxed">
              אני מאשר/ת את ההצעה ואת תנאיה ומסכים/ה שהחתימה תופיע במסמך החתום.
            </span>
          </label>

          {error && <div className="rounded-lg ring-1 ring-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}

          <button type="button" disabled={submitting} onClick={submit}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-full text-white py-4 text-[15px] font-semibold transition-all disabled:opacity-50"
            style={{ background: PURPLE }}>
            {submitting ? 'שולח חתימה…' : 'חתום ושלח ←'}
          </button>

          {/* Return the quote for edits instead of signing */}
          <div className="mt-2 border-t border-stone-200 pt-4">
            {!showReq ? (
              <button type="button" onClick={() => setShowReq(true)}
                className="text-[13px] text-stone-500 hover:text-[color:var(--p)] font-medium underline underline-offset-2">
                לא מסכים/ה על משהו? בקש/י שינוי בהצעה
              </button>
            ) : (
              <div className="grid gap-2">
                <span className="text-[10px] tracking-[0.28em] uppercase text-stone-400 font-medium">בקשת שינוי</span>
                <textarea rows={3} value={changeNotes} onChange={(e) => setChangeNotes(e.target.value)}
                  placeholder="למשל: נא להוריד סטורי אחד / המחיר גבוה מדי, אפשר להוזיל?"
                  className={inputCls} />
                <div className="flex items-center gap-3">
                  <button type="button" disabled={reqSubmitting} onClick={requestChange}
                    className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-[14px] font-semibold ring-1 ring-stone-300 text-stone-700 hover:bg-stone-100 disabled:opacity-50">
                    {reqSubmitting ? 'שולח…' : 'שלח בקשת שינוי'}
                  </button>
                  <button type="button" onClick={() => setShowReq(false)} className="text-[13px] text-stone-400 hover:text-stone-600">ביטול</button>
                </div>
              </div>
            )}
          </div>
        </section>

        <footer className="text-center py-10 text-[10px] tracking-[0.28em] uppercase text-stone-300 font-medium">
          Bestie · חתימה דיגיטלית
        </footer>
      </main>
    </div>
  );
}

function SignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.4;
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pos(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    const last = lastRef.current ?? p;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  };
  const end = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };
  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  };

  return (
    <div className="relative">
      <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        className="block w-full h-44 md:h-52 bg-white rounded-lg ring-1 ring-stone-300 cursor-crosshair touch-none" />
      <button type="button" onClick={clear}
        className="absolute top-3 left-3 text-[10px] tracking-[0.2em] uppercase text-stone-400 hover:text-stone-700 font-medium">
        נקה
      </button>
    </div>
  );
}

function canvasGetDataUrl(): string | null {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let hasInk = false;
  for (let i = 0; i < data.length; i += 40 * 4) {
    if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) { hasInk = true; break; }
  }
  if (!hasInk) return null;
  return canvas.toDataURL('image/png');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.28em] uppercase text-stone-400 mb-2 font-medium">{label}</span>
      {children}
    </label>
  );
}

function ThankYou({ title, signedAt, signedUrl }: { title: string; signedAt: string; signedUrl: string | null }) {
  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6" style={{ background: 'rgba(136,63,226,.1)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: PURPLE }}>
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-[32px] font-bold tracking-tight mb-3">החתימה התקבלה.</h1>
        <p className="text-[14px] text-stone-500 leading-relaxed">עותק חתום של "{title}" נשמר במערכת והסוכן קיבל הודעה.</p>
        {signedUrl && (
          <a href={signedUrl} target="_blank" rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full text-white px-8 py-3 text-[14px] font-semibold" style={{ background: PURPLE }}>
            צפה במסמך החתום ←
          </a>
        )}
        <p className="mt-8 text-[10px] tracking-[0.2em] uppercase text-stone-400">נחתם: {new Date(signedAt).toLocaleString('he-IL')}</p>
      </div>
    </div>
  );
}

function AlreadySigned(props: Props) {
  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <h1 className="text-[30px] font-bold tracking-tight mb-3">המסמך כבר נחתם.</h1>
        <p className="text-[14px] text-stone-500 leading-relaxed">
          {props.signerName ?? 'המסמך'} נחתם{props.signedAt ? ` ב־${new Date(props.signedAt).toLocaleString('he-IL')}` : ''}.
        </p>
        {props.signedUrl && (
          <a href={props.signedUrl} target="_blank" rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full text-white px-8 py-3 text-[14px] font-semibold" style={{ background: PURPLE }}>
            צפה בעותק החתום ←
          </a>
        )}
      </div>
    </div>
  );
}

function ChangeRequested({ title }: { title: string }) {
  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <h1 className="text-[30px] font-bold tracking-tight mb-3">בקשת השינוי נשלחה.</h1>
        <p className="text-[14px] text-stone-500 leading-relaxed">
          הסוכן קיבל את הערותיך על "{title}" ויחזור אליך עם הצעה מעודכנת.
        </p>
      </div>
    </div>
  );
}

function Expired({ status }: { status: 'expired' | 'cancelled' }) {
  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-[26px] font-bold tracking-tight mb-3">{status === 'expired' ? 'בקשת החתימה פגה תוקף.' : 'בקשת החתימה בוטלה.'}</h1>
        <p className="text-[13px] text-stone-500">פנה/י לסוכן לקבלת קישור חדש.</p>
      </div>
    </div>
  );
}
