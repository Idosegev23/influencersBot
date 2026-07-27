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
import { usePathname, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

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

const BARE_PATH = /(?<!\]\()(?<![\w([])(\/influencer\/[\w[\]._-]+(?:\/[\w[\]._-]+)*)/g;

/**
 * The model is told to emit [label](/influencer/...) but sometimes pastes a bare
 * path, and react-markdown will not linkify one. Wrapping it here means the
 * renderer only ever has to deal with real markdown links.
 *
 * The lookbehind skips paths already inside a link so they are not wrapped twice.
 */
export function linkifyBarePaths(text: string): string {
  return text.replace(BARE_PATH, '[$1]($1)');
}

const STARTERS = [
  { label: 'מה קרה השבוע?', message: 'מה קרה בחשבון שלי השבוע?' },
  { label: 'על מה הבוט לא ידע?', message: 'על אילו שאלות הבוט שלי לא ידע לענות?' },
  { label: 'יש משהו לא תקין?', message: 'יש משהו לא תקין בחשבון שלי?' },
  { label: 'איך משנים…', message: 'איך משנים את האישיות של הבוט?' },
];

/**
 * Conversation state survives two different things, and they need two different
 * mechanisms.
 *
 * Moving between screens is handled by the layout: this component is mounted in
 * layout.tsx, which App Router keeps alive across client-side navigation — so
 * React state simply persists, provided nothing triggers a full page load.
 *
 * A manual refresh, a back button, or closing and reopening the tab is not
 * covered by that, and losing a conversation to one F5 is the kind of thing
 * people only forgive once. Hence sessionStorage — scoped per account so two
 * brands open in two tabs never see each other's chat, and session-scoped
 * because this is a working conversation, not history worth keeping forever.
 */
const storeKey = (username: string) => `bestie_dash_chat_${username}`;

function loadSaved(username: string): { turns: Turn[]; open: boolean } {
  try {
    const raw = sessionStorage.getItem(storeKey(username));
    if (!raw) return { turns: [], open: false };
    const parsed = JSON.parse(raw);
    return {
      turns: Array.isArray(parsed?.turns) ? parsed.turns : [],
      open: Boolean(parsed?.open),
    };
  } catch {
    return { turns: [], open: false };
  }
}

export default function DashboardAssistant({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore after mount, never during render: sessionStorage does not exist on
  // the server and reading it in the initial state would break hydration.
  useEffect(() => {
    const saved = loadSaved(username);
    setTurns(saved.turns);
    setOpen(saved.open);
    setRestored(true);
  }, [username]);

  // Persist only after the restore has run, or the first write would clobber
  // the saved conversation with the empty initial state.
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(storeKey(username), JSON.stringify({ turns: turns.slice(-40), open }));
    } catch { /* private mode — the conversation just will not survive a reload */ }
  }, [turns, open, restored, username]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  /** Client-side navigation, so the layout — and this conversation — survives. */
  function go(href: string) {
    router.push(href);
  }

  function clearChat() {
    setTurns([]);
    try { sessionStorage.removeItem(storeKey(username)); } catch { /* ignore */ }
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {turns.length > 0 && (
            <button
              onClick={clearChat}
              aria-label="שיחה חדשה"
              title="שיחה חדשה"
              style={{
                background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff',
                fontSize: 12, cursor: 'pointer', borderRadius: 8, padding: '4px 8px',
              }}
            >
              שיחה חדשה
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            aria-label="סגור"
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
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
              lineHeight: 1.6,
              whiteSpace: t.role === 'user' ? 'pre-wrap' : 'normal',
              background: t.role === 'user' ? BRAND.gradient : 'var(--dash-bg-soft, rgba(0,0,0,.04))',
              color: t.role === 'user' ? '#fff' : 'inherit',
              flex: 1,
              marginInlineStart: t.role === 'user' ? 40 : 0,
              marginInlineEnd: t.role === 'user' ? 0 : 20,
            }}
          >
            {t.role === 'assistant' ? (
              <ReactMarkdown
                components={{
                  // Client-side navigation, so following a link never remounts
                  // the layout and throws away this conversation.
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      onClick={e => {
                        if (href?.startsWith('/')) { e.preventDefault(); go(href); }
                      }}
                      style={{
                        color: BRAND.purple, fontWeight: 600, textDecoration: 'underline',
                        textUnderlineOffset: 3, cursor: 'pointer',
                      }}
                    >
                      {children}
                    </a>
                  ),
                  p: ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
                  strong: ({ children }) => (
                    <strong style={{ fontWeight: 700, color: BRAND.ink }}>{children}</strong>
                  ),
                  ol: ({ children }) => (
                    <ol style={{ margin: '4px 0 8px', paddingInlineStart: 20, display: 'grid', gap: 6 }}>
                      {children}
                    </ol>
                  ),
                  ul: ({ children }) => (
                    <ul style={{ margin: '4px 0 8px', paddingInlineStart: 18, display: 'grid', gap: 4 }}>
                      {children}
                    </ul>
                  ),
                  li: ({ children }) => <li style={{ lineHeight: 1.5 }}>{children}</li>,
                  code: ({ children }) => (
                    <code
                      style={{
                        background: 'rgba(136,63,226,.10)', borderRadius: 5,
                        padding: '1px 5px', fontSize: 13, fontFamily: 'ui-monospace, monospace',
                      }}
                    >
                      {children}
                    </code>
                  ),
                  h1: ({ children }) => <div style={{ fontWeight: 700, margin: '6px 0 4px' }}>{children}</div>,
                  h2: ({ children }) => <div style={{ fontWeight: 700, margin: '6px 0 4px' }}>{children}</div>,
                  h3: ({ children }) => <div style={{ fontWeight: 700, margin: '6px 0 4px' }}>{children}</div>,
                  hr: () => (
                    <hr style={{ border: 0, borderTop: '1px solid rgba(136,63,226,.18)', margin: '10px 0' }} />
                  ),
                }}
              >
                {linkifyBarePaths(t.content)}
              </ReactMarkdown>
            ) : (
              t.content
            )}
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
