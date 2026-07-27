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
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

// Bestie's actual brand (brand-book/bestie-brand-book-source.html), not a
// generic indigo: a brand-facing assistant that does not look like the product
// reads as something bolted on.
const BRAND = {
  purple: '#883FE2',
  purpleLight: '#B497EF',
  ink: '#17092E',
  gradient: 'linear-gradient(135deg,#883FE2,#B497EF)',
  // Shipped in public/brand/ since April and referenced by nothing until now.
  icon: '/brand/bestie-icon.svg',
  wordmark: '/brand/bestie-wordmark.svg',
};

/**
 * Render a reply with real links.
 *
 * The model is told to emit [label](/influencer/...) — but it will sometimes
 * just paste the bare path, and a customer who has to copy a path out of a chat
 * bubble has been given homework, not an answer. So both forms are linkified.
 */
const MD_LINK = /\[([^\]]+)\]\((\/[^\s)]+)\)/g;
const BARE_PATH = /(?<![\w([])(\/influencer\/[\w[\]._-]+(?:\/[\w[\]._-]+)*)/g;

function renderRich(text: string, onNavigate: () => void): ReactNode[] {
  const out: ReactNode[] = [];
  let key = 0;

  const linkStyle: React.CSSProperties = {
    color: BRAND.purple, fontWeight: 600, textDecoration: 'underline',
    textUnderlineOffset: 3, cursor: 'pointer',
  };

  const pushLinkified = (chunk: string) => {
    let last = 0;
    for (const m of chunk.matchAll(BARE_PATH)) {
      const at = m.index ?? 0;
      if (at > last) out.push(chunk.slice(last, at));
      out.push(
        <a key={`b${key++}`} href={m[1]} onClick={onNavigate} style={linkStyle}>
          {m[1]}
        </a>
      );
      last = at + m[1].length;
    }
    if (last < chunk.length) out.push(chunk.slice(last));
  };

  let cursor = 0;
  for (const m of text.matchAll(MD_LINK)) {
    const at = m.index ?? 0;
    if (at > cursor) pushLinkified(text.slice(cursor, at));
    out.push(
      <a key={`m${key++}`} href={m[2]} onClick={onNavigate} style={linkStyle}>
        {m[1]}
      </a>
    );
    cursor = at + m[0].length;
  }
  if (cursor < text.length) pushLinkified(text.slice(cursor));

  return out;
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
      // username goes in the QUERY STRING, not the body: requireInfluencerAuth
      // reads it via extractUsername(), which only looks at searchParams.
      const res = await fetch(`/api/bestie/dashboard?username=${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          width: 60, height: 60, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: '#fff', padding: 8,
          boxShadow: '0 8px 28px rgba(136,63,226,.42), 0 0 0 1px rgba(136,63,226,.14)',
          display: 'grid', placeItems: 'center',
        }}
      >
        {/* The mark carries its own gradient, so it sits on white rather than
            on the brand gradient — layering both muddies it. */}
        <img src={BRAND.icon} alt="בסטי" style={{ width: '100%', height: '100%' }} />
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
        boxShadow: '0 20px 60px rgba(23,9,46,.28)',
        fontFamily: 'Heebo, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: BRAND.gradient, color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 36, height: 36, borderRadius: 999, background: '#fff',
              display: 'grid', placeItems: 'center', padding: 5, flexShrink: 0,
            }}
          >
            <img src={BRAND.icon} alt="" style={{ width: '100%', height: '100%' }} />
          </span>
          <span>
            <span style={{ display: 'block', fontWeight: 700, lineHeight: 1.2 }}>בסטי</span>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.85 }}>
              שואלים אותי כל דבר על המערכת
            </span>
          </span>
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
            <img
              src={BRAND.wordmark}
              alt="Bestie"
              style={{ height: 26, width: 'auto', alignSelf: 'center', margin: '4px 0 10px', opacity: 0.9 }}
            />
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
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '10px 0' }}>
            {t.role === 'assistant' && (
              <span
                style={{
                  width: 26, height: 26, borderRadius: 999, background: '#fff', flexShrink: 0,
                  display: 'grid', placeItems: 'center', padding: 3, marginTop: 2,
                  boxShadow: '0 0 0 1px rgba(136,63,226,.16)',
                }}
              >
                <img src={BRAND.icon} alt="" style={{ width: '100%', height: '100%' }} />
              </span>
            )}
          <div
            style={{
              padding: '10px 12px', borderRadius: 12, fontSize: 14,
              whiteSpace: 'pre-wrap', lineHeight: 1.5,
              background: t.role === 'user' ? BRAND.gradient : 'var(--dash-bg-soft, rgba(0,0,0,.04))',
              color: t.role === 'user' ? '#fff' : 'inherit',
              flex: 1,
              marginInlineStart: t.role === 'user' ? 40 : 0,
              marginInlineEnd: t.role === 'user' ? 0 : 20,
            }}
          >
            {t.role === 'assistant' ? renderRich(t.content, () => setOpen(false)) : t.content}
          </div>
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
            background: BRAND.gradient, color: '#fff',
            opacity: busy || !input.trim() ? 0.5 : 1, fontWeight: 600,
          }}
        >
          שלח
        </button>
      </form>
    </div>
  );
}
