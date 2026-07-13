'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Instagram, Flag, Send, MessageCircle } from 'lucide-react';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { getDashboardStrings, dashboardDir } from '@/lib/i18n/dashboard';

interface Msg { role: string; content: string; createdAt: string; by?: string }
interface Thread {
  sessionId: string;
  threadId: string;
  recipientId: string | null;
  recipientHandle: string | null;
  lastMessage: string;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  within24h: boolean;
  flagged: boolean;
  messages: Msg[];
}
interface Analytics { conversations: number; botReplies: number; humanReplies: number; flagged: number }

export default function InstagramPage() {
  const params = useParams();
  const username = params.username as string;
  const { lang } = useDashboardLang(username);
  const t = getDashboardStrings(lang).instagram;
  const dir = dashboardDir(lang);

  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [conn, setConn] = useState<{ connected: boolean; ig_username?: string }>({ connected: false });
  const [dmBotEnabled, setDmBotEnabled] = useState<boolean>(true);
  const [botToggling, setBotToggling] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({ conversations: 0, botReplies: 0, humanReplies: 0, flagged: 0 });
  const [selectedId, setSelectedId] = useState<string>('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');

  useEffect(() => {
    if (!username) return;
    (async () => {
      setLoading(true);
      try {
        const profileRes = await fetch(`/api/influencer/profile?username=${username}`);
        const accId = profileRes.ok ? (await profileRes.json())?.account?.id || '' : '';
        setAccountId(accId);
        if (accId) {
          const dmRes = await fetch(`/api/influencer/dm-settings?accountId=${accId}`);
          if (dmRes.ok) {
            const d = await dmRes.json();
            setDmBotEnabled(d.dm_bot_enabled ?? true);
            setConn(d.ig_connection || { connected: false });
          }
        }
        const convRes = await fetch(`/api/influencer/dm/conversations?username=${username}`);
        if (convRes.ok) {
          const c = await convRes.json();
          setThreads(c.threads || []);
          setAnalytics(c.analytics || { conversations: 0, botReplies: 0, humanReplies: 0, flagged: 0 });
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [username]);

  const selected = useMemo(() => threads.find((th) => th.sessionId === selectedId) || null, [threads, selectedId]);

  async function toggleBot() {
    if (!accountId || botToggling) return;
    setBotToggling(true);
    try {
      const next = !dmBotEnabled;
      const res = await fetch('/api/influencer/dm-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, dm_bot_enabled: next }),
      });
      if (res.ok) setDmBotEnabled(next);
    } finally { setBotToggling(false); }
  }

  async function toggleFlag(th: Thread) {
    const next = !th.flagged;
    setThreads((prev) => prev.map((x) => (x.sessionId === th.sessionId ? { ...x, flagged: next } : x)));
    try {
      await fetch(`/api/influencer/dm/flag?username=${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: th.sessionId, flagged: next }),
      });
    } catch {
      setThreads((prev) => prev.map((x) => (x.sessionId === th.sessionId ? { ...x, flagged: th.flagged } : x)));
    }
  }

  async function sendReply() {
    if (!selected || !replyText.trim() || sending) return;
    setSending(true);
    setSendErr('');
    try {
      const res = await fetch(`/api/influencer/dm/send?username=${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, threadId: selected.threadId, text: replyText }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 422) { setSendErr(t.outside24h); return; }
      if (!res.ok || !json.ok) { setSendErr(t.sendError); return; }
      const sent: Msg = { role: 'assistant', content: replyText, createdAt: new Date().toISOString(), by: 'human' };
      setThreads((prev) => prev.map((x) =>
        x.sessionId === selected.sessionId ? { ...x, messages: [...x.messages, sent], lastMessage: replyText } : x));
      setReplyText('');
      setAnalytics((a) => ({ ...a, humanReplies: a.humanReplies + 1 }));
    } catch {
      setSendErr(t.sendError);
    } finally { setSending(false); }
  }

  const stat = (label: string, value: number) => (
    <div className="rounded-xl p-3 text-center" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}>
      <div className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{label}</div>
    </div>
  );

  return (
    <div dir={dir} style={{ direction: dir }} className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Instagram className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
        <h1 className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>{t.pageTitle}</h1>
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--dash-text-3)' }}>{t.pageSubtitle}</p>

      {loading ? (
        <div className="text-sm" style={{ color: 'var(--dash-text-3)' }}>{t.loading}</div>
      ) : (
        <>
          {/* Connection + bot toggle */}
          <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm" style={{ color: 'var(--dash-text)' }}>
                {conn.connected
                  ? <>{t.connectedAs} <strong>@{conn.ig_username}</strong></>
                  : <span style={{ color: 'var(--dash-text-3)' }}>{t.notConnected}</span>}
              </div>
              <button
                onClick={toggleBot}
                disabled={botToggling || !conn.connected}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{
                  background: dmBotEnabled ? 'var(--color-primary)' : 'var(--dash-surface-hover)',
                  color: dmBotEnabled ? '#fff' : 'var(--dash-text-2)',
                }}
                title={t.botToggleHint}
              >
                {t.botSectionTitle}: {dmBotEnabled ? t.botOn : t.botOff}
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--dash-text-3)' }}>{t.botToggleHint}</p>
          </div>

          {/* Analytics */}
          <div className="mb-5">
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--dash-text-3)' }}>{t.analyticsTitle}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {stat(t.statConversations, analytics.conversations)}
              {stat(t.statBotReplies, analytics.botReplies)}
              {stat(t.statHumanReplies, analytics.humanReplies)}
              {stat(t.statFlagged, analytics.flagged)}
            </div>
          </div>

          {/* Inbox */}
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--dash-text-3)' }}>{t.inboxTitle}</div>
          {threads.length === 0 ? (
            <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-3)' }}>
              {t.threadsEmpty}
            </div>
          ) : (
            <div className="grid md:grid-cols-[300px_1fr] gap-4">
              {/* Thread list */}
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}>
                {threads.map((th) => (
                  <button
                    key={th.sessionId}
                    onClick={() => { setSelectedId(th.sessionId); setSendErr(''); }}
                    className="w-full text-start px-4 py-3 flex items-center gap-2 transition-colors"
                    style={{
                      borderBottom: '1px solid var(--dash-glass-border)',
                      background: selectedId === th.sessionId ? 'var(--dash-surface-hover)' : 'transparent',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--dash-text)' }}>
                        @{th.recipientHandle || th.recipientId || 'unknown'}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--dash-text-3)' }}>{th.lastMessage}</div>
                    </div>
                    {th.flagged && <Flag className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f59e0b', fill: '#f59e0b' }} />}
                  </button>
                ))}
              </div>

              {/* Thread detail */}
              <div className="rounded-2xl flex flex-col min-h-[420px]" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}>
                {!selected ? (
                  <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--dash-text-3)' }}>
                    <MessageCircle className="w-4 h-4 me-2" /> {t.selectThread}
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--dash-glass-border)' }}>
                      <div className="text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>@{selected.recipientHandle || selected.recipientId}</div>
                      <button onClick={() => toggleFlag(selected)} className="text-xs flex items-center gap-1" style={{ color: selected.flagged ? '#f59e0b' : 'var(--dash-text-3)' }}>
                        <Flag className="w-3.5 h-3.5" style={selected.flagged ? { fill: '#f59e0b' } : undefined} />
                        {selected.flagged ? t.unflag : t.flag}
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                      {selected.messages.map((m, i) => {
                        const outbound = m.role === 'assistant';
                        return (
                          <div key={i} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                            <div className="max-w-[80%] rounded-2xl px-3 py-2 text-sm" style={{
                              background: outbound ? 'var(--color-primary)' : 'var(--dash-surface-hover)',
                              color: outbound ? '#fff' : 'var(--dash-text)',
                            }}>
                              <div className="text-[10px] opacity-70 mb-0.5">{outbound ? (m.by === 'human' ? t.you : t.bot) : ''}</div>
                              {m.content}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reply box */}
                    <div className="p-3" style={{ borderTop: '1px solid var(--dash-glass-border)' }}>
                      {!selected.within24h && (
                        <div className="text-xs mb-2 px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309' }}>{t.outside24h}</div>
                      )}
                      {sendErr && <div className="text-xs mb-2" style={{ color: '#dc2626' }}>{sendErr}</div>}
                      <div className="flex items-center gap-2">
                        <input
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') sendReply(); }}
                          disabled={!selected.within24h || sending}
                          placeholder={t.replyPlaceholder}
                          className="flex-1 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                          style={{ background: 'var(--dash-bg)', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }}
                        />
                        <button
                          onClick={sendReply}
                          disabled={!selected.within24h || sending || !replyText.trim()}
                          className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
                          style={{ background: 'var(--color-primary)' }}
                        >
                          <Send className="w-3.5 h-3.5" />{sending ? t.sending : t.sendReply}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
