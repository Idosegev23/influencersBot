'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { getDashboardStrings } from '@/lib/i18n/dashboard';
import { fetchIgConnectLink } from '@/lib/instagram-graph/connect-link-client';
import {
  Bot,
  Instagram,
  MessageSquare,
  Brain,
  Map,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  ExternalLink,
  Zap,
  Hash,
  Calendar,
  FileText,
  Sparkles,
} from 'lucide-react';

/* ─── Types ─── */

interface VoiceRules {
  tone?: string | { primary?: string[] };
  avgLength?: string;
  language?: string;
  recurringPhrases?: string[];
  avoidedWords?: string[];
  responseStructure?: string;
  styleMarkers?: {
    humorAndSlang?: string[];
    formatPreferences?: string[];
  };
}

interface CoreTopic {
  name: string;
  keyPoints?: string[];
  examples?: string[];
}

interface KnowledgeDomain {
  domain: string;
  whatSheCovers?: string[];
  brandsAndLinesExplicitlyCovered?: string[];
  [key: string]: unknown;
}

interface PersonaData {
  name: string;
  tone: string;
  voice_rules: VoiceRules | null;
  knowledge_map: { coreTopics?: CoreTopic[]; domains?: KnowledgeDomain[] } | null;
  common_phrases: string[] | null;
  narrative_perspective: string | null;
  sass_level: number | null;
  storytelling_mode: string | null;
  message_structure: string | null;
  emoji_usage: string | null;
  greeting_message: string;
  bio: string;
  interests: string[];
  directives: string[];
}

interface IGConnection {
  ig_username?: string;
  connected: boolean;
}

function Badge({ children, color = 'var(--color-primary)' }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 transition-colors"
        style={{ color: 'var(--dash-text)' }}
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
          <span className="font-semibold">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--dash-text-3)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--dash-text-3)' }} />}
      </button>
      {open && <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--dash-glass-border)' }}>{children}</div>}
    </div>
  );
}

/* ─── Page ─── */

export default function MyBotPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { lang } = useDashboardLang(username);
  const isEn = lang === 'en';
  const t = getDashboardStrings(lang);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [igConnection, setIgConnection] = useState<IGConnection>({ connected: false });
  const [dmBotEnabled, setDmBotEnabled] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const [accountId, setAccountId] = useState<string>('');
  const [stats, setStats] = useState<{ totalPosts: number; topicsCount: number; lastScrape: string | null }>({
    totalPosts: 0, topicsCount: 0, lastScrape: null,
  });
  const [syncing, setSyncing] = useState(false);

  // Persona editor. Seeded from the loaded persona; `dirty` keeps the form from
  // being clobbered by a background reload while the customer is typing.
  const [form, setForm] = useState({
    tone: '', directives: '', avoidedWords: '', greeting: '', emoji: 'moderate',
  });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // loadData is a useCallback that must not re-run on every keystroke, so the
  // dirty flag is read through a ref rather than closed over.
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const setField = (k: keyof typeof form, v: string) => {
    setDirty(true);
    setSaveState('idle');
    setForm((f) => ({ ...f, [k]: v }));
  };

  const savePersona = async () => {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/influencer/chatbot/persona?username=${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tone: form.tone.trim(),
          // Directives are one rule per line in the box, and an array in the DB.
          directives: form.directives.split('\n').map((d) => d.trim()).filter(Boolean),
          avoided_words: form.avoidedWords.split(',').map((w) => w.trim()).filter(Boolean),
          greeting_message: form.greeting.trim(),
          emoji_usage: form.emoji,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaveState('saved');
      setDirty(false);
      await loadData();
    } catch {
      setSaveState('error');
    }
  };

  const restoreAiPersona = async () => {
    if (!confirm(t.chatbotPersona.restoreConfirm)) return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/influencer/chatbot/persona?username=${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDirty(false);
      dirtyRef.current = false;
      setSaveState('idle');
      await loadData();
    } catch {
      setSaveState('error');
    }
  };

  const loadData = useCallback(async () => {
    try {
      const authRes = await fetch(`/api/influencer/auth?username=${username}`);
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.push(`/influencer/${username}/login`);
        return;
      }

      // Load persona
      const personaRes = await fetch(`/api/influencer/chatbot/persona?username=${username}`);
      if (personaRes.ok) {
        const personaData = await personaRes.json();
        const p = personaData.persona || null;
        setPersona(p);
        setAccountId(personaData.accountId || '');
        if (p) {
          setForm((prev) => {
            if (dirtyRef.current) return prev; // never overwrite what is being typed
            const vr = p.voice_rules || {};
            const toneVal = typeof vr.tone === 'string' ? vr.tone : p.tone || '';
            return {
              tone: toneVal || '',
              directives: Array.isArray(p.directives) ? p.directives.join('\n') : (p.directives || ''),
              avoidedWords: Array.isArray(vr.avoidedWords) ? vr.avoidedWords.join(', ') : '',
              greeting: p.greeting_message || '',
              emoji: p.emoji_usage || 'moderate',
            };
          });
        }
      }

      // Load stats
      const statsRes = await fetch(`/api/influencer/chatbot/stats?username=${username}`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats({
          totalPosts: statsData.totalPosts || 0,
          topicsCount: statsData.topicsCount || 0,
          lastScrape: statsData.lastScrape || null,
        });
      }

      // Load DM settings
      if (authData.accountId || accountId) {
        const aid = authData.accountId || accountId;
        setAccountId(aid);
        const dmRes = await fetch(`/api/influencer/dm-settings?accountId=${aid}&username=${username}`);
        if (dmRes.ok) {
          const dmData = await dmRes.json();
          setIgConnection(dmData.ig_connection || { connected: false });
          setDmBotEnabled(dmData.dm_bot_enabled || false);
        }
      }
    } catch (error) {
      console.error('Error loading bot data:', error);
    } finally {
      setLoading(false);
    }
  }, [username, router, accountId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleDM = async () => {
    if (!accountId) return;
    setDmLoading(true);
    try {
      const res = await fetch(`/api/influencer/dm-settings?username=${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, dm_bot_enabled: !dmBotEnabled }),
      });
      if (res.ok) {
        setDmBotEnabled(!dmBotEnabled);
      }
    } catch {} finally {
      setDmLoading(false);
    }
  };

  const handleSync = async () => {
    if (!accountId) return;
    setSyncing(true);
    try {
      await fetch('/api/influencer/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
    } catch {} finally {
      setSyncing(false);
    }
  };

  const handleConnectIG = async () => {
    if (!accountId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) return;
    // The connect URL must be signed server-side — see lib/instagram-graph/connect-token.
    const url = await fetchIgConnectLink({ accountId, username });
    if (url) window.location.href = url;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'transparent' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  const voiceRules = persona?.voice_rules;
  const knowledgeMap = persona?.knowledge_map;
  const toneStr = typeof voiceRules?.tone === 'string'
    ? voiceRules.tone
    : (voiceRules?.tone as any)?.primary?.join(', ') || persona?.tone || '';

  return (
    <div className="min-h-screen" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
              {t.chatbotPersona.headerTitle}
            </h1>
            {persona?.name && (
              <p className="text-sm mt-1" style={{ color: 'var(--dash-text-2)' }}>
                {persona.name}
              </p>
            )}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm btn-primary disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {t.chatbotPersona.syncFromInstagram}
          </button>
        </div>

        {/* ═══ STATS STRIP ═══ */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t.chatbotPersona.statPostsInKb, value: stats.totalPosts, icon: FileText },
            { label: t.chatbotPersona.statTopics, value: stats.topicsCount, icon: Hash },
            { label: t.chatbotPersona.statLastScan, value: stats.lastScrape ? new Date(stats.lastScrape).toLocaleDateString(isEn ? 'en-US' : 'he-IL') : t.chatbotPersona.notYetScanned, icon: Calendar },
          ].map((s, i) => (
            <div key={i} className="metric-card">
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon className="w-3.5 h-3.5" style={{ color: 'var(--dash-text-3)' }} />
                <span className="text-xs" style={{ color: 'var(--dash-text-2)' }}>{s.label}</span>
              </div>
              <span className="text-lg font-bold">{s.value}</span>
            </div>
          ))}
        </div>

        {/* ═══ INSTAGRAM CONNECTION ═══ */}
        <div className="rounded-xl border p-5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: igConnection.connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
                <Instagram className="w-5 h-5" style={{ color: igConnection.connected ? '#22c55e' : '#ef4444' }} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{t.chatbotPersona.igConnectionTitle}</h3>
                {igConnection.connected ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-xs text-green-500">{t.chatbotPersona.igConnectedPrefix}@{igConnection.ig_username}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs text-red-400">{t.chatbotPersona.igNotConnected}</span>
                  </div>
                )}
              </div>
            </div>

            {igConnection.connected ? (
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                  {t.chatbotPersona.dmBot}
                </span>
                <button onClick={handleToggleDM} disabled={dmLoading} className="transition-colors">
                  {dmLoading ? (
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
                  ) : dmBotEnabled ? (
                    <ToggleRight className="w-8 h-8 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8" style={{ color: 'var(--dash-text-3)' }} />
                  )}
                </button>
              </div>
            ) : (
              <button onClick={handleConnectIG} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm btn-primary">
                <ExternalLink className="w-4 h-4" />
                {t.chatbotPersona.connectInstagram}
              </button>
            )}
          </div>
        </div>

        {/* ═══ PERSONA — read-only from DB ═══ */}
        {!persona ? (
          <div className="text-center py-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <Bot className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dash-text-3)' }} />
            <h3 className="text-xl font-semibold mb-2">{t.chatbotPersona.noPersonaTitle}</h3>
            <p className="mb-4" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.noPersonaHelp}</p>
          </div>
        ) : (
          <>
            {/* Editable bot rules — the only place a customer can change what the bot says */}
            <Section title={t.chatbotPersona.editorTitle} icon={Sparkles} defaultOpen>
              <div className="space-y-4 pt-4">
                <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.editorHelp}</p>

                <div>
                  <label htmlFor="persona-tone" className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>
                    {t.chatbotPersona.editTone}
                  </label>
                  <input
                    id="persona-tone"
                    type="text"
                    value={form.tone}
                    onChange={(e) => setField('tone', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-1)' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>{t.chatbotPersona.editToneHelp}</p>
                </div>

                <div>
                  <label htmlFor="persona-directives" className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>
                    {t.chatbotPersona.editDirectives}
                  </label>
                  <textarea
                    id="persona-directives"
                    rows={5}
                    value={form.directives}
                    onChange={(e) => setField('directives', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-1)' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>{t.chatbotPersona.editDirectivesHelp}</p>
                </div>

                <div>
                  <label htmlFor="persona-avoided" className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>
                    {t.chatbotPersona.editAvoided}
                  </label>
                  <input
                    id="persona-avoided"
                    type="text"
                    value={form.avoidedWords}
                    onChange={(e) => setField('avoidedWords', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-1)' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>{t.chatbotPersona.editAvoidedHelp}</p>
                </div>

                <div>
                  <label htmlFor="persona-greeting" className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>
                    {t.chatbotPersona.editGreeting}
                  </label>
                  <textarea
                    id="persona-greeting"
                    rows={2}
                    value={form.greeting}
                    onChange={(e) => setField('greeting', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-1)' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>{t.chatbotPersona.editGreetingHelp}</p>
                </div>

                <div>
                  <label htmlFor="persona-emoji" className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>
                    {t.chatbotPersona.editEmoji}
                  </label>
                  <select
                    id="persona-emoji"
                    value={form.emoji}
                    onChange={(e) => setField('emoji', e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-1)' }}
                  >
                    <option value="none">{t.chatbotPersona.emojiNone}</option>
                    <option value="light">{t.chatbotPersona.emojiLight}</option>
                    <option value="moderate">{t.chatbotPersona.emojiModerate}</option>
                    <option value="heavy">{t.chatbotPersona.emojiHeavy}</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={savePersona}
                    disabled={saveState === 'saving' || !dirty}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}
                  >
                    {saveState === 'saving' ? t.chatbotPersona.saving : t.chatbotPersona.saveChanges}
                  </button>
                  <button
                    type="button"
                    onClick={restoreAiPersona}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{ border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-2)' }}
                  >
                    {t.chatbotPersona.restoreAi}
                  </button>
                  {saveState === 'saved' && (
                    <span className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--dash-positive)' }}>
                      <CheckCircle2 className="w-4 h-4" /> {t.chatbotPersona.saved}
                    </span>
                  )}
                  {saveState === 'error' && (
                    <span className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--dash-negative)' }}>
                      <XCircle className="w-4 h-4" /> {t.chatbotPersona.saveFailed}
                    </span>
                  )}
                </div>
              </div>
            </Section>

            {/* Voice & Style */}
            <Section title={t.chatbotPersona.voiceStyleTitle} icon={MessageSquare} defaultOpen>
              <div className="space-y-4 pt-4">
                {toneStr && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.tone}</label>
                    <p className="text-sm">{toneStr}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {persona.narrative_perspective && (
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.perspective}</label>
                      <Badge>{persona.narrative_perspective}</Badge>
                    </div>
                  )}
                  {persona.emoji_usage && (
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.emojis}</label>
                      <Badge>{persona.emoji_usage}</Badge>
                    </div>
                  )}
                  {persona.storytelling_mode && (
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.storyStyle}</label>
                      <Badge>{persona.storytelling_mode}</Badge>
                    </div>
                  )}
                  {persona.message_structure && (
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.structure}</label>
                      <Badge>{persona.message_structure}</Badge>
                    </div>
                  )}
                </div>

                {persona.sass_level !== null && persona.sass_level !== undefined && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.sassLevel}</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--dash-glass-border)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(persona.sass_level / 10) * 100}%`, background: 'var(--color-primary)' }} />
                      </div>
                      <span className="text-xs font-mono" style={{ color: 'var(--dash-text-2)' }}>{persona.sass_level}/10</span>
                    </div>
                  </div>
                )}

                {voiceRules?.language && (
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.language}</label>
                    <p className="text-sm">{voiceRules.language}</p>
                  </div>
                )}

                {persona.common_phrases && persona.common_phrases.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.signaturePhrases}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {persona.common_phrases.map((phrase, i) => (
                        <Badge key={i} color="var(--color-warning)">{phrase}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {voiceRules?.recurringPhrases && voiceRules.recurringPhrases.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.recurringPhrases}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceRules.recurringPhrases.map((phrase, i) => (
                        <Badge key={i} color="var(--color-info)">{phrase}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {voiceRules?.avoidedWords && voiceRules.avoidedWords.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.avoidedWords}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceRules.avoidedWords.map((w, i) => (
                        <Badge key={i} color="var(--dash-negative)">{w}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* Knowledge Map */}
            <Section title={t.chatbotPersona.knowledgeMapTitle} icon={Map}>
              <div className="space-y-4 pt-4">
                {knowledgeMap?.coreTopics && knowledgeMap.coreTopics.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-2" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.coreTopics}</label>
                    <div className="space-y-2">
                      {knowledgeMap.coreTopics.map((topic, i) => (
                        <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--dash-glass-border)' }}>
                          <h4 className="text-sm font-semibold mb-1">{topic.name}</h4>
                          {topic.keyPoints && topic.keyPoints.length > 0 && (
                            <ul className="text-xs space-y-0.5" style={{ color: 'var(--dash-text-2)' }}>
                              {topic.keyPoints.slice(0, 4).map((kp, j) => (
                                <li key={j}>• {kp}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {knowledgeMap?.domains && knowledgeMap.domains.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-2" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.areasOfExpertise}</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {knowledgeMap.domains.map((d, i) => (
                        <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--dash-glass-border)' }}>
                          <h4 className="text-sm font-semibold mb-1">{d.domain}</h4>
                          {d.whatSheCovers && d.whatSheCovers.length > 0 && (
                            <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                              {d.whatSheCovers.slice(0, 3).join(' · ')}
                            </p>
                          )}
                          {d.brandsAndLinesExplicitlyCovered && d.brandsAndLinesExplicitlyCovered.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {d.brandsAndLinesExplicitlyCovered.slice(0, 5).map((b, j) => (
                                <Badge key={j} color="var(--color-info)">{b}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* Bio & Interests */}
            <Section title={t.chatbotPersona.aboutTitle} icon={Brain}>
              <div className="space-y-4 pt-4">
                {persona.bio && (
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.bio}</label>
                    <p className="text-sm">{persona.bio}</p>
                  </div>
                )}
                {persona.interests && persona.interests.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.interests}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {persona.interests.map((interest, i) => (
                        <Badge key={i}>{interest}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {persona.directives && persona.directives.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>{t.chatbotPersona.directives}</label>
                    <ul className="space-y-1 text-sm" style={{ color: 'var(--dash-text-2)' }}>
                      {persona.directives.map((d, i) => (
                        <li key={i}>• {d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Section>

            {/* Greeting */}
            {persona.greeting_message && (
              <Section title={t.chatbotPersona.welcomeMessageTitle} icon={Sparkles}>
                <div className="pt-4">
                  <div className="rounded-lg p-4" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid var(--dash-glass-border)' }}>
                    <p className="text-sm leading-relaxed">{persona.greeting_message}</p>
                  </div>
                </div>
              </Section>
            )}
          </>
        )}

        {/* ═══ CHAT LINK ═══ */}
        <div className="rounded-xl border p-4 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-medium">{t.chatbotPersona.chatLink}</span>
          </div>
          <a
            href={`/chat/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs btn-primary"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t.chatbotPersona.openChat}
          </a>
        </div>
      </main>
    </div>
  );
}
