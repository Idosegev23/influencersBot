'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
        setPersona(personaData.persona || null);
        setAccountId(personaData.accountId || '');
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
        const dmRes = await fetch(`/api/influencer/dm-settings?accountId=${aid}`);
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
      const res = await fetch('/api/influencer/dm-settings', {
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

  const handleConnectIG = () => {
    if (!accountId) return;
    window.location.href = `/api/auth/instagram/connect?accountId=${accountId}`;
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
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
              הבוט שלי
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
            סנכרון מאינסטגרם
          </button>
        </div>

        {/* ═══ STATS STRIP ═══ */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'פוסטים בבסיס', value: stats.totalPosts, icon: FileText },
            { label: 'נושאים', value: stats.topicsCount, icon: Hash },
            { label: 'סריקה אחרונה', value: stats.lastScrape ? new Date(stats.lastScrape).toLocaleDateString('he-IL') : 'טרם נסרק', icon: Calendar },
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
                <h3 className="font-semibold text-sm">חיבור אינסטגרם</h3>
                {igConnection.connected ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-xs text-green-500">מחובר — @{igConnection.ig_username}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs text-red-400">לא מחובר</span>
                  </div>
                )}
              </div>
            </div>

            {igConnection.connected ? (
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                  בוט DM
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
                חבר אינסטגרם
              </button>
            )}
          </div>
        </div>

        {/* ═══ PERSONA — read-only from DB ═══ */}
        {!persona ? (
          <div className="text-center py-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <Bot className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dash-text-3)' }} />
            <h3 className="text-xl font-semibold mb-2">אין פרסונה עדיין</h3>
            <p className="mb-4" style={{ color: 'var(--dash-text-2)' }}>סנכרנו מאינסטגרם כדי לבנות את הפרסונה</p>
          </div>
        ) : (
          <>
            {/* Voice & Style */}
            <Section title="קול וסגנון" icon={MessageSquare} defaultOpen>
              <div className="space-y-4 pt-4">
                {toneStr && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>טון</label>
                    <p className="text-sm">{toneStr}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {persona.narrative_perspective && (
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>פרספקטיבה</label>
                      <Badge>{persona.narrative_perspective}</Badge>
                    </div>
                  )}
                  {persona.emoji_usage && (
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>אימוג׳ים</label>
                      <Badge>{persona.emoji_usage}</Badge>
                    </div>
                  )}
                  {persona.storytelling_mode && (
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>סיפור</label>
                      <Badge>{persona.storytelling_mode}</Badge>
                    </div>
                  )}
                  {persona.message_structure && (
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>מבנה</label>
                      <Badge>{persona.message_structure}</Badge>
                    </div>
                  )}
                </div>

                {persona.sass_level !== null && persona.sass_level !== undefined && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>רמת חוצפה</label>
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
                    <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>שפה</label>
                    <p className="text-sm">{voiceRules.language}</p>
                  </div>
                )}

                {persona.common_phrases && persona.common_phrases.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>ביטויים אופייניים</label>
                    <div className="flex flex-wrap gap-1.5">
                      {persona.common_phrases.map((phrase, i) => (
                        <Badge key={i} color="var(--color-warning)">{phrase}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {voiceRules?.recurringPhrases && voiceRules.recurringPhrases.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>ביטויים חוזרים</label>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceRules.recurringPhrases.map((phrase, i) => (
                        <Badge key={i} color="var(--color-info)">{phrase}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {voiceRules?.avoidedWords && voiceRules.avoidedWords.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>מילים שנמנע מהן</label>
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
            <Section title="מפת ידע" icon={Map}>
              <div className="space-y-4 pt-4">
                {knowledgeMap?.coreTopics && knowledgeMap.coreTopics.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-2" style={{ color: 'var(--dash-text-2)' }}>נושאי ליבה</label>
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
                    <label className="text-xs font-medium block mb-2" style={{ color: 'var(--dash-text-2)' }}>תחומי מומחיות</label>
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
            <Section title="אודות" icon={Brain}>
              <div className="space-y-4 pt-4">
                {persona.bio && (
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: 'var(--dash-text-2)' }}>ביו</label>
                    <p className="text-sm">{persona.bio}</p>
                  </div>
                )}
                {persona.interests && persona.interests.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>תחומי עניין</label>
                    <div className="flex flex-wrap gap-1.5">
                      {persona.interests.map((interest, i) => (
                        <Badge key={i}>{interest}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {persona.directives && persona.directives.length > 0 && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--dash-text-2)' }}>הנחיות</label>
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
              <Section title="הודעת פתיחה" icon={Sparkles}>
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
            <span className="text-sm font-medium">קישור לצ׳אט</span>
          </div>
          <a
            href={`/chat/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs btn-primary"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            פתח צ׳אט
          </a>
        </div>
      </main>
    </div>
  );
}
