'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, X, Loader2, CheckCircle2 } from 'lucide-react';

interface AskItamarButtonProps {
  sessionId: string | null;
  /** Optional context shown to Itamar in the WhatsApp template body. */
  visitorName?: string | null;
  visitorMeta?: string | null;
  /** Pass-through tag identifying the visitor's source (must be 'conf'). */
  source?: 'conf';
  /** Called after a successful submit so the parent can refresh messages.
   *  The API may have minted a fresh session — that id is passed through
   *  so the parent can store it and start polling. */
  onSubmitted?: (info: { sessionId: string | null; refCode?: string }) => void;
}

/**
 * Floating CTA in the Bestie chat — opens a small composer that bridges
 * the visitor's question to Itamar's personal WhatsApp via the
 * bestie_handoff_lead template. Visitors can use this any number of times
 * per session (no rate-limit yet).
 */
export function AskItamarButton({
  sessionId,
  visitorName,
  visitorMeta,
  source,
  onSubmitted,
}: AskItamarButtonProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setText('');
    setSubmitting(false);
    setDone(false);
    setError(null);
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 250);
  };

  async function submit() {
    if (text.trim().length < 4) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/chat/handoff/itamar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId || undefined,
          question: text.trim(),
          source,
          visitorName: visitorName || undefined,
          visitorMeta: visitorMeta || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setDone(true);
      onSubmitted?.({
        sessionId: data.sessionId || sessionId,
        refCode: data.refCode,
      });
      // Auto-close after a short success state
      setTimeout(() => close(), 1800);
    } catch (e: any) {
      setError(e?.message || 'failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ask-itamar-btn flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-all active:scale-[0.97] hover:shadow-md"
        style={{
          background: 'linear-gradient(135deg,#0c1013 0%,#1a2030 100%)',
          color: '#ffffff',
          border: '1px solid #243454',
          boxShadow: '0 2px 12px rgba(12,16,19,0.18)',
        }}
        aria-label="שלח שאלה אישית לאיתמר"
      >
        <Mail className="w-4 h-4" style={{ color: '#5FD4F5' }} strokeWidth={2} />
        <span>שלח לאיתמר אישית</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ direction: 'rtl' }}
            onClick={(e) => e.target === e.currentTarget && close()}
          >
            <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />

            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
              style={{
                boxShadow: '0 20px 60px -10px rgba(12,16,19,0.25)',
                maxHeight: '88vh',
              }}
            >
              {/* Header */}
              <div
                className="px-6 pt-5 pb-4 text-right relative"
                style={{
                  background: 'linear-gradient(135deg,#0c1013 0%,#1a2030 70%,#243454 100%)',
                  color: '#fff',
                }}
              >
                <button
                  onClick={close}
                  className="absolute top-3 left-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                  aria-label="סגור"
                >
                  <X className="w-4 h-4 text-white/80" />
                </button>
                <div
                  className="text-[10.5px] font-bold tracking-[2.5px] uppercase mb-1.5"
                  style={{ color: '#5FD4F5' }}
                >
                  Personal · Itamar Gonsherovitz
                </div>
                <h3 className="text-[18px] font-bold leading-tight">
                  שאלה ישירה לאיתמר
                </h3>
                <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: '#9BA8C4' }}>
                  ההודעה תגיע לוואטסאפ של איתמר. הוא קורא ועונה כאן בצ׳אט בדרך כלל תוך כמה שעות.
                </p>
              </div>

              {/* Body */}
              <div className="px-6 py-5 flex-1 overflow-y-auto">
                {done ? (
                  <div className="text-center py-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 14 }}
                    >
                      <CheckCircle2
                        className="w-12 h-12 mx-auto mb-3"
                        style={{ color: '#16a34a' }}
                        strokeWidth={1.5}
                      />
                    </motion.div>
                    <h4 className="text-[16px] font-bold mb-1" style={{ color: '#0c1013' }}>
                      ההודעה הועברה לאיתמר
                    </h4>
                    <p className="text-[13px]" style={{ color: '#676767' }}>
                      התשובה שלו תופיע כאן בצ׳אט.
                    </p>
                  </div>
                ) : (
                  <>
                    <label
                      className="block text-[12px] font-semibold mb-2"
                      style={{ color: '#52525b' }}
                    >
                      מה תרצה לשאול את איתמר?
                    </label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="היי איתמר, אני רוצה לשאול אותך על..."
                      rows={5}
                      maxLength={500}
                      autoFocus
                      className="w-full px-4 py-3 rounded-xl text-[14px] outline-none transition-all focus:ring-2 focus:ring-zinc-900/10 resize-none"
                      style={{
                        backgroundColor: '#fafafa',
                        color: '#09090b',
                        border: '1px solid #e4e4e7',
                      }}
                    />
                    <div
                      className="text-[11px] mt-1.5 text-left tabular-nums"
                      style={{ color: '#a1a1aa' }}
                    >
                      {text.length} / 500
                    </div>

                    {error && (
                      <div
                        className="mt-3 px-3 py-2.5 rounded-lg text-[12.5px]"
                        style={{
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          color: '#991b1b',
                        }}
                      >
                        {error}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer / actions */}
              {!done && (
                <div
                  className="flex gap-2 px-6 py-3"
                  style={{ borderTop: '1px solid #f4f4f5', background: '#ffffff' }}
                >
                  <button
                    onClick={close}
                    disabled={submitting}
                    className="px-5 h-[44px] rounded-xl text-[14px] font-medium transition-colors hover:bg-zinc-50 disabled:opacity-50"
                    style={{ border: '1px solid #e4e4e7', color: '#52525b' }}
                  >
                    ביטול
                  </button>
                  <button
                    onClick={submit}
                    disabled={submitting || text.trim().length < 4}
                    className="flex-1 h-[44px] rounded-xl text-[14px] font-semibold text-white transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      background:
                        'linear-gradient(135deg,#0c1013 0%,#1a2030 70%,#243454 100%)',
                    }}
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        <span>שלח לאיתמר</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
