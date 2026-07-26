'use client';

/**
 * Bestie inside the brand's dashboard.
 *
 * Sits bottom-LEFT on purpose: bottom-right is where the customer-facing widget
 * lives on brand sites, and a brand who sees the same bubble in both places
 * cannot tell which one their customers are talking to.
 *
 * Sends the current pathname on every turn, so the answers change as they move
 * between screens without a reload. That is what makes it feel like someone
 * looking at the screen with you rather than documentation.
 */
import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  { label: 'מה קרה השבוע?', message: 'מה קרה בחשבון שלי השבוע?' },
  { label: 'על מה הבוט לא ידע?', message: 'על אילו שאלות הבוט שלי לא ידע לענות?' },
  { label: 'יש משהו לא תקין?', message: 'יש משהו לא תקין בחשבון שלי?' },
  { label: 'איך משנים…', message: 'איך משנים את האישיות של הבוט?' },
];

export default function DashboardAssistant({ username }: { username: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;

    setInput('');
    setTurns(prev => [...prev, { role: 'user', content: text }]);
    setBusy(true);

    try {
      const res = await fetch('/api/bestie/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          message: text,
          currentPath: pathname,
          history: turns.slice(-8),
        }),
      });
      const data = await res.json();
      setTurns(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data?.reply || 'משהו השתבש. נסו שוב בעוד רגע.',
        },
      ]);
    } catch {
      setTurns(prev => [...prev, { role: 'assistant', content: 'לא הצלחתי להתחבר. נסו שוב.' }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="פתח את בסטי"
        style={{
          position: 'fixed', bottom: 20, left: 20, zIndex: 60,
          width: 56, height: 56, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
          fontSize: 24, boxShadow: '0 8px 24px rgba(99,102,241,.4)',
        }}
      >
        ✦
      </button>
    );
  }

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', bottom: 20, left: 20, zIndex: 60,
        width: 'min(380px, calc(100vw - 40px))', height: 'min(560px, calc(100vh - 100px))',
        display: 'flex', flexDirection: 'column',
        background: 'var(--dash-card, #fff)', color: 'var(--dash-text, #111)',
        borderRadius: 16, overflow: 'hidden',
        border: '1px solid var(--dash-border, rgba(0,0,0,.08))',
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>בסטי</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>שואלים אותי כל דבר על המערכת</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="סגור"
          style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}
        >
          ×
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {turns.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 14, opacity: 0.7, margin: '0 0 4px' }}>
              אני רואה את החשבון שלך ואת המסך שאתה נמצא בו. אפשר להתחיל מכאן:
            </p>
            {STARTERS.map(s => (
              <button
                key={s.label}
                onClick={() => send(s.message)}
                style={{
                  textAlign: 'right', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  border: '1px solid var(--dash-border, rgba(0,0,0,.1))',
                  background: 'var(--dash-bg-soft, rgba(0,0,0,.02))',
                  color: 'inherit', fontSize: 14,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div
            key={i}
            style={{
              margin: '8px 0', padding: '10px 12px', borderRadius: 12, fontSize: 14,
              whiteSpace: 'pre-wrap', lineHeight: 1.5,
              background: t.role === 'user'
                ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                : 'var(--dash-bg-soft, rgba(0,0,0,.04))',
              color: t.role === 'user' ? '#fff' : 'inherit',
              marginInlineStart: t.role === 'user' ? 40 : 0,
              marginInlineEnd: t.role === 'user' ? 0 : 40,
            }}
          >
            {t.content}
          </div>
        ))}

        {busy && <div style={{ fontSize: 13, opacity: 0.6, padding: '8px 4px' }}>בסטי כותבת…</div>}
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send(input); }}
        style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--dash-border, rgba(0,0,0,.08))' }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="שאלו משהו…"
          disabled={busy}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 14,
            border: '1px solid var(--dash-border, rgba(0,0,0,.12))',
            background: 'transparent', color: 'inherit', outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
            opacity: busy || !input.trim() ? 0.5 : 1, fontWeight: 600,
          }}
        >
          שלח
        </button>
      </form>
    </div>
  );
}
