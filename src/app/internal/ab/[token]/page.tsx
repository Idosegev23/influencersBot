'use client';

import { use, useEffect, useRef, useState } from 'react';
import { notFound } from 'next/navigation';

type Engine = 'openai' | 'gemini';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Meta {
  model?: string;
  note?: string;
  ttftMs?: number | null;
  streamMs?: number | null;
  archetype?: string | null;
  confidence?: number | null;
}

interface EngineState {
  messages: Message[];
  streaming: boolean;
  currentText: string;
  startedAt: number | null;
  finishedAt: number | null;
  meta: Meta | null;
  totalMs: number | null;
  ttftMs: number | null;
  streamMs: number | null;
  archetype: string | null;
  confidence: number | null;
  error: string | null;
  elapsedMs: number; // live clock
}

const PUBLIC_TOKEN = '7pxsOdI8QSNl80TIx5sVVf-NUS_INnZk';

function freshEngineState(): EngineState {
  return {
    messages: [],
    streaming: false,
    currentText: '',
    startedAt: null,
    finishedAt: null,
    meta: null,
    totalMs: null,
    ttftMs: null,
    streamMs: null,
    archetype: null,
    confidence: null,
    error: null,
    elapsedMs: 0,
  };
}

export default function AbTestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  if (token !== PUBLIC_TOKEN) notFound();

  const [openai, setOpenai] = useState<EngineState>(freshEngineState());
  const [gemini, setGemini] = useState<EngineState>(freshEngineState());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const openaiPaneRef = useRef<HTMLDivElement>(null);
  const geminiPaneRef = useRef<HTMLDivElement>(null);

  // Live ticking clock — updates every 50ms while either side is streaming
  useEffect(() => {
    if (!openai.streaming && !gemini.streaming) return;
    const id = setInterval(() => {
      setOpenai(s => s.streaming && s.startedAt ? { ...s, elapsedMs: Date.now() - s.startedAt } : s);
      setGemini(s => s.streaming && s.startedAt ? { ...s, elapsedMs: Date.now() - s.startedAt } : s);
    }, 50);
    return () => clearInterval(id);
  }, [openai.streaming, gemini.streaming]);

  // Autoscroll panes during streaming
  useEffect(() => { openaiPaneRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }); }, [openai.currentText, openai.messages]);
  useEffect(() => { geminiPaneRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }); }, [gemini.currentText, gemini.messages]);

  async function streamOne(engine: Engine, query: string, history: Message[]) {
    const setState = engine === 'openai' ? setOpenai : setGemini;
    const startedAt = Date.now();
    setState(s => ({
      ...s,
      streaming: true,
      currentText: '',
      startedAt,
      finishedAt: null,
      meta: null,
      totalMs: null,
      ttftMs: null,
      streamMs: null,
      archetype: null,
      confidence: null,
      error: null,
      elapsedMs: 0,
    }));

    try {
      const res = await fetch('/api/internal/ab-chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: PUBLIC_TOKEN, engine, message: query, history }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Parse SSE blocks split by blank line
        const blocks = buf.split('\n\n');
        buf = blocks.pop() || '';
        for (const block of blocks) {
          const eventMatch = block.match(/event: (\w+)/);
          const dataMatch = block.match(/data: (.+)/);
          if (!eventMatch || !dataMatch) continue;
          const event = eventMatch[1];
          let data: any;
          try { data = JSON.parse(dataMatch[1]); } catch { continue; }

          if (event === 'meta') {
            setState(s => ({ ...s, meta: data }));
          } else if (event === 'token') {
            acc += data.text;
            const snapshot = acc;
            setState(s => ({ ...s, currentText: snapshot }));
          } else if (event === 'done') {
            const finishedAt = Date.now();
            const finalText = acc;
            setState(s => ({
              ...s,
              streaming: false,
              currentText: '',
              finishedAt,
              totalMs: data.totalMs,
              ttftMs: data.ttftMs ?? null,
              streamMs: data.streamMs ?? null,
              archetype: data.archetype ?? null,
              confidence: data.confidence ?? null,
              elapsedMs: data.totalMs ?? (finishedAt - startedAt),
              messages: [...s.messages, { role: 'user', content: query }, { role: 'assistant', content: finalText }],
            }));
          } else if (event === 'error') {
            setState(s => ({ ...s, streaming: false, error: data.message || 'stream error' }));
          }
        }
      }
    } catch (err: any) {
      setState(s => ({ ...s, streaming: false, error: err?.message || 'request failed' }));
    }
  }

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    try {
      // Send the same query to both engines simultaneously with the same history
      const sharedHistory = openai.messages; // pick one — both panes track separately but start identical
      await Promise.all([
        streamOne('openai', q, sharedHistory),
        streamOne('gemini', q, sharedHistory),
      ]);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setOpenai(freshEngineState());
    setGemini(freshEngineState());
    setInput('');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b0d12', color: '#e7e9ee', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
      <meta name="robots" content="noindex,nofollow" />
      <header style={{ borderBottom: '1px solid #1f242d', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f131b' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>LDRS · A/B Retrieval Bench</div>
          <div style={{ fontSize: 12, color: '#8a92a4', marginTop: 2 }}>Full SandwichBot pipeline — OpenAI (2000d) vs Gemini Embedding 2 (3072d) · GPT-5.4 generator משותף · זמני production אמיתיים</div>
        </div>
        <button onClick={reset} disabled={busy} style={btnGhost}>נקה שיחה</button>
      </header>

      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 14, overflow: 'hidden' }}>
        <Pane engine="openai" label="OpenAI · text-embedding-3-large" state={openai} paneRef={openaiPaneRef} />
        <Pane engine="gemini" label="Gemini · gemini-embedding-2" state={gemini} paneRef={geminiPaneRef} />
      </main>

      <footer style={{ borderTop: '1px solid #1f242d', padding: 14, background: '#0f131b' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="כתוב שאלה כאן… Enter לשליחה ל-2 המנועים במקביל. Shift+Enter ירידת שורה."
            disabled={busy}
            rows={2}
            style={inputStyle}
          />
          <button onClick={send} disabled={busy || !input.trim()} style={busy || !input.trim() ? btnDisabled : btnPrimary}>
            {busy ? '...' : 'שלח לשניהם'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function Pane({ engine, label, state, paneRef }: { engine: Engine; label: string; state: EngineState; paneRef: React.RefObject<HTMLDivElement | null> }) {
  const live = state.streaming ? state.elapsedMs : null;
  const finalMs = state.totalMs;

  return (
    <section style={paneStyle}>
      <div style={paneHeader}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: engine === 'openai' ? '#74e3a9' : '#a89cff' }}>{label}</div>
          <MetaLine state={state} />
        </div>
        <ClockBadge live={live} finalMs={finalMs} streaming={state.streaming} />
      </div>

      <div ref={paneRef} style={messagesStyle}>
        {state.messages.length === 0 && !state.streaming && (
          <div style={{ color: '#5a6479', fontSize: 13, padding: 12 }}>אין הודעות עדיין.</div>
        )}
        {state.messages.map((m, i) => (
          <Bubble key={i} role={m.role}>{m.content}</Bubble>
        ))}
        {state.streaming && state.currentText && <Bubble role="assistant" streaming>{state.currentText}</Bubble>}
        {state.error && <div style={{ color: '#ff7676', fontSize: 13, padding: 12 }}>שגיאה: {state.error}</div>}
      </div>
    </section>
  );
}

function MetaLine({ state }: { state: EngineState }) {
  const m = state.meta;
  if (!m && !state.archetype) return <div style={{ fontSize: 11, color: '#5a6479', marginTop: 4 }}>—</div>;
  const parts: string[] = [];
  if (state.ttftMs != null) parts.push(`TTFT ${state.ttftMs}ms`);
  if (state.streamMs != null) parts.push(`stream ${state.streamMs}ms`);
  if (state.archetype) parts.push(`archetype: ${state.archetype}`);
  if (state.confidence != null) parts.push(`conf ${state.confidence.toFixed(2)}`);
  return (
    <div style={{ fontSize: 11, color: '#8a92a4', marginTop: 4 }}>
      {parts.length > 0 ? parts.join(' · ') : 'full SandwichBot pipeline'}
    </div>
  );
}

function ClockBadge({ live, finalMs, streaming }: { live: number | null; finalMs: number | null; streaming: boolean }) {
  const display = streaming
    ? (live != null ? `${(live / 1000).toFixed(2)}s` : '0.00s')
    : finalMs != null
      ? `${(finalMs / 1000).toFixed(2)}s`
      : '—';
  return (
    <div style={{
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 24,
      fontWeight: 700,
      color: streaming ? '#74e3a9' : finalMs != null ? '#e7e9ee' : '#5a6479',
      letterSpacing: '0.02em',
    }}>{display}</div>
  );
}

function Bubble({ role, children, streaming }: { role: 'user' | 'assistant'; children: React.ReactNode; streaming?: boolean }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div style={{
        background: isUser ? '#2a3756' : '#1a2030',
        color: '#e7e9ee',
        padding: '10px 14px',
        borderRadius: 14,
        borderBottomRightRadius: isUser ? 4 : 14,
        borderBottomLeftRadius: isUser ? 14 : 4,
        maxWidth: '85%',
        whiteSpace: 'pre-wrap',
        fontSize: 14,
        lineHeight: 1.55,
        border: streaming ? '1px solid #3a4566' : '1px solid transparent',
      }}>{children}{streaming && <span style={{ opacity: 0.5 }}> ▌</span>}</div>
    </div>
  );
}

// ─── styles ───
const paneStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: '#0f131b',
  border: '1px solid #1f242d',
  borderRadius: 12,
  overflow: 'hidden',
};
const paneHeader: React.CSSProperties = {
  padding: '12px 14px',
  borderBottom: '1px solid #1f242d',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
};
const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 14,
};
const inputStyle: React.CSSProperties = {
  flex: 1,
  background: '#0b0d12',
  color: '#e7e9ee',
  border: '1px solid #2a3142',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'none',
  outline: 'none',
};
const btnPrimary: React.CSSProperties = {
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 22px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
const btnDisabled: React.CSSProperties = {
  ...btnPrimary,
  background: '#1f2937',
  color: '#5a6479',
  cursor: 'not-allowed',
};
const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: '#8a92a4',
  border: '1px solid #2a3142',
  borderRadius: 8,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
};
