'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Save,
  Sparkles,
  Instagram,
  MessageSquare,
  Brain,
  BookOpen,
  Settings,
  Quote,
  Ban,
  Map,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
} from 'lucide-react';
import ScrapeProgressModal from '@/components/ScrapeProgressModal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VoiceRules {
  tone?: string;
  avgLength?: string;
  firstPerson?: boolean;
  avoidedWords?: string[];
  recurringPhrases?: string[];
  responseStructure?: string;
}

interface CoreTopic {
  name: string;
  examples?: string[];
  keyPoints?: string[];
  subtopics?: string[];
}

interface KnowledgeMap {
  coreTopics?: CoreTopic[];
}

interface PersonaFull {
  /* AI-generated read-only fields */
  name: string;
  tone: string;
  voice_rules: VoiceRules | null;
  knowledge_map: KnowledgeMap | null;
  common_phrases: string[] | null;
  narrative_perspective: string | null;
  sass_level: number | null;
  slang_map: Record<string, string> | null;
  storytelling_mode: string | null;
  message_structure: string | null;
  emoji_usage: string | null;

  /* Editable fields */
  greeting_message: string;
  directives: string[];
  bio: string;
  interests: string[];
}

const EMPTY_PERSONA: PersonaFull = {
  name: '',
  tone: '',
  voice_rules: null,
  knowledge_map: null,
  common_phrases: null,
  narrative_perspective: null,
  sass_level: null,
  slang_map: null,
  storytelling_mode: null,
  message_structure: null,
  emoji_usage: null,
  greeting_message: '',
  directives: [],
  bio: '',
  interests: [],
};

/* ------------------------------------------------------------------ */
/*  Small reusable components                                          */
/* ------------------------------------------------------------------ */

function Badge({ children, color = 'var(--color-primary)' }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
      style={{
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm"
      style={{
        background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
        color: 'var(--color-primary)',
        border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)',
      }}
    >
      {children}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70 transition-opacity">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
    >
      <button
        type="button"
        onClick={() => collapsible && setOpen(!open)}
        className={`w-full flex items-center gap-3 p-5 text-right ${
          collapsible ? 'cursor-pointer' : 'cursor-default'
        }`}
        style={{ color: 'var(--dash-text)' }}
      >
        <Icon className="w-5 h-5 shrink-0" style={{ color: 'var(--color-primary)' }} />
        <h2 className="text-lg font-bold flex-1 text-right">{title}</h2>
        {collapsible && (
          open ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--dash-text-3)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--dash-text-3)' }} />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

function EmptyLabel({ text = 'לא הוגדר' }: { text?: string }) {
  return (
    <span className="text-sm italic" style={{ color: 'var(--dash-text-3)' }}>
      {text}
    </span>
  );
}

function SassIndicator({ level }: { level: number }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs font-medium" style={{ color: 'var(--dash-text-2)' }}>סאס:</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{
              background: i < level
                ? `color-mix(in srgb, var(--color-primary) ${50 + i * 5}%, var(--dash-negative))`
                : 'var(--dash-muted)',
            }}
          />
        ))}
      </div>
      <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>{level}/10</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Label mapping helpers                                              */
/* ------------------------------------------------------------------ */

const NARRATIVE_LABELS: Record<string, string> = {
  'sidekick-professional': 'עוזר מקצועי',
  'first-person': 'גוף ראשון',
  'third-person': 'גוף שלישי',
  'friendly-assistant': 'עוזר ידידותי',
};

const STORYTELLING_LABELS: Record<string, string> = {
  balanced: 'מאוזן',
  narrative: 'סיפורי',
  factual: 'עובדתי',
  emotional: 'רגשי',
};

const MESSAGE_STRUCTURE_LABELS: Record<string, string> = {
  whatsapp: 'וואטסאפ',
  formal: 'פורמלי',
  email: 'אימייל',
  chat: "צ'אט",
};

function humanize(value: string | null | undefined, map: Record<string, string>): string | null {
  if (!value) return null;
  return map[value] || value;
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function ChatbotPersonaPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [persona, setPersona] = useState<PersonaFull>(EMPTY_PERSONA);

  const [newDirective, setNewDirective] = useState('');
  const [newInterest, setNewInterest] = useState('');

  /* ---- data loading ---- */

  useEffect(() => {
    loadPersona();
  }, [username]);

  const loadPersona = async () => {
    try {
      const response = await fetch(`/api/influencer/chatbot/persona?username=${username}`);
      if (!response.ok) throw new Error('Failed to load persona');

      const data = await response.json();
      if (data.persona) {
        setPersona({
          name: data.persona.name || '',
          tone: data.persona.tone || '',
          voice_rules: data.persona.voice_rules || null,
          knowledge_map: data.persona.knowledge_map || null,
          common_phrases: data.persona.common_phrases || null,
          narrative_perspective: data.persona.narrative_perspective || null,
          sass_level: data.persona.sass_level ?? null,
          slang_map: data.persona.slang_map || null,
          storytelling_mode: data.persona.storytelling_mode || null,
          message_structure: data.persona.message_structure || null,
          emoji_usage: data.persona.emoji_usage || null,
          greeting_message: data.persona.greeting_message || '',
          directives: data.persona.directives || [],
          bio: data.persona.bio || '',
          interests: data.persona.interests || [],
        });
      }
    } catch (err) {
      console.error('Error loading persona:', err);
      setError('שגיאה בטעינת הפרסונה');
    } finally {
      setLoading(false);
    }
  };

  /* ---- save (editable fields only) ---- */

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/influencer/chatbot/persona?username=${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directives: persona.directives,
          tone: persona.tone,
          emoji_usage: persona.emoji_usage,
          greeting_message: persona.greeting_message,
          bio: persona.bio,
          interests: persona.interests,
        }),
      });

      if (!response.ok) throw new Error('Failed to save persona');

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving persona:', err);
      setError('שגיאה בשמירת הפרסונה');
    } finally {
      setSaving(false);
    }
  };

  /* ---- directives helpers ---- */

  const addDirective = () => {
    if (newDirective.trim()) {
      setPersona({ ...persona, directives: [...persona.directives, newDirective.trim()] });
      setNewDirective('');
    }
  };

  const removeDirective = (index: number) => {
    setPersona({ ...persona, directives: persona.directives.filter((_, i) => i !== index) });
  };

  /* ---- interests helpers ---- */

  const addInterest = () => {
    if (newInterest.trim()) {
      setPersona({ ...persona, interests: [...persona.interests, newInterest.trim()] });
      setNewInterest('');
    }
  };

  const removeInterest = (index: number) => {
    setPersona({ ...persona, interests: persona.interests.filter((_, i) => i !== index) });
  };

  /* ---- sync from Instagram ---- */

  const syncFromInstagram = async () => {
    try {
      setSyncing(true);
      setError(null);
      setSuccess(false);
      setShowProgressModal(true);

      const response = await fetch(`/api/influencer/chatbot/persona?username=${username}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to sync from Instagram');
      }
    } catch (err) {
      console.error('Error syncing from Instagram:', err);
      setError(err instanceof Error ? err.message : 'שגיאה בסנכרון מאינסטגרם');
      setShowProgressModal(false);
      setSyncing(false);
    }
  };

  const handleSyncComplete = async (ok: boolean) => {
    setShowProgressModal(false);
    setSyncing(false);

    if (ok) {
      await loadPersona();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } else {
      setError('הסריקה נכשלה. נסה שוב.');
    }
  };

  /* ---- derived data ---- */

  const voiceRules = persona.voice_rules;
  const knowledgeMap = persona.knowledge_map;
  const hasRichData =
    !!voiceRules || !!knowledgeMap || !!persona.common_phrases?.length || persona.sass_level !== null;

  // Merge recurring phrases + common_phrases into one list, deduplicated
  const allPhrases = Array.from(
    new Set([...(voiceRules?.recurringPhrases || []), ...(persona.common_phrases || [])]),
  );

  const slangEntries = persona.slang_map ? Object.entries(persona.slang_map) : [];

  /* ---- loading state ---- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dash-bg)' }}>
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderColor: 'var(--color-primary)' }}
        />
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div
      dir="rtl"
      className="min-h-screen py-8 px-4"
      style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* ---- Header ---- */}
        <div className="mb-2">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 mb-4 transition-colors"
            style={{ color: 'var(--dash-text-2)' }}
          >
            <ArrowRight className="w-5 h-5" />
            חזרה
          </button>
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-10 h-10" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-3xl font-bold">הפרסונה של הצ'אטבוט</h1>
          </div>
          <p style={{ color: 'var(--dash-text-2)' }}>כל מה שה-AI יודע על הסגנון שלך</p>
        </div>

        {/* ---- Notifications ---- */}
        {error && (
          <div
            className="p-4 rounded-lg text-sm"
            style={{
              background: 'color-mix(in srgb, var(--dash-negative) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--dash-negative) 40%, transparent)',
              color: 'var(--dash-negative)',
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            className="p-4 rounded-lg text-sm"
            style={{
              background: 'color-mix(in srgb, var(--dash-positive) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--dash-positive) 40%, transparent)',
              color: 'var(--dash-positive)',
            }}
          >
            הפרסונה נשמרה בהצלחה!
          </div>
        )}

        {/* ============================================================ */}
        {/*  1. PERSONA IDENTITY CARD                                     */}
        {/* ============================================================ */}

        <div
          className="rounded-xl border p-6"
          style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)' }}
            >
              <Sparkles className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              {/* Name / title */}
              <div>
                <h2 className="text-xl font-bold leading-snug" style={{ color: 'var(--dash-text)' }}>
                  {persona.name || username}
                </h2>
                {persona.tone && (
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--dash-text-2)' }}>
                    {persona.tone}
                  </p>
                )}
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap gap-2">
                {persona.narrative_perspective && (
                  <Badge>{humanize(persona.narrative_perspective, NARRATIVE_LABELS)}</Badge>
                )}
                {persona.storytelling_mode && (
                  <Badge color="var(--color-info)">
                    {humanize(persona.storytelling_mode, STORYTELLING_LABELS)}
                  </Badge>
                )}
                {persona.message_structure && (
                  <Badge color="var(--dash-text-2)">
                    {humanize(persona.message_structure, MESSAGE_STRUCTURE_LABELS)}
                  </Badge>
                )}
                {persona.emoji_usage && (
                  <Badge color="var(--dash-positive)">
                    אימוג׳י: {persona.emoji_usage}
                  </Badge>
                )}
              </div>

              {/* Sass level */}
              {persona.sass_level !== null && <SassIndicator level={persona.sass_level} />}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  2. VOICE & STYLE (read-only)                                 */}
        {/* ============================================================ */}

        {hasRichData && (
          <SectionCard icon={MessageSquare} title="קול וסגנון" collapsible defaultOpen>
            {/* Voice Rules Tone */}
            {voiceRules?.tone && (
              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--dash-text-2)' }}>
                  טון מפורט
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--dash-text)' }}>
                  {voiceRules.tone}
                </p>
              </div>
            )}

            {/* Average Length */}
            {voiceRules?.avgLength && (
              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--dash-text-2)' }}>
                  אורך תגובה ממוצע
                </h3>
                <p className="text-sm" style={{ color: 'var(--dash-text)' }}>
                  {voiceRules.avgLength}
                </p>
              </div>
            )}

            {/* First Person */}
            {voiceRules?.firstPerson !== undefined && (
              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--dash-text-2)' }}>
                  דיבור בגוף ראשון
                </h3>
                <p className="text-sm" style={{ color: 'var(--dash-text)' }}>
                  {voiceRules.firstPerson ? 'כן' : 'לא'}
                </p>
              </div>
            )}

            {/* Response Structure */}
            {voiceRules?.responseStructure && (
              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--dash-text-2)' }}>
                  מבנה תגובה
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--dash-text)' }}>
                  {voiceRules.responseStructure}
                </p>
              </div>
            )}

            {/* Recurring Phrases */}
            {allPhrases.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Quote className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-2)' }}>
                    ביטויים חוזרים
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allPhrases.map((phrase, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full text-sm"
                      style={{
                        background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                        color: 'var(--color-primary)',
                        border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)',
                      }}
                    >
                      &ldquo;{phrase}&rdquo;
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Avoided Words */}
            {voiceRules?.avoidedWords && voiceRules.avoidedWords.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Ban className="w-4 h-4" style={{ color: 'var(--dash-negative)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-2)' }}>
                    מילים שנמנעים מהן
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {voiceRules.avoidedWords.map((word, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full text-sm"
                      style={{
                        background: 'color-mix(in srgb, var(--dash-negative) 10%, transparent)',
                        color: 'var(--dash-negative)',
                        border: '1px solid color-mix(in srgb, var(--dash-negative) 20%, transparent)',
                      }}
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Slang Map */}
            {slangEntries.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-2)' }}>
                    סלנג ומילים מיוחדות
                  </h3>
                </div>
                <div className="space-y-1">
                  {slangEntries.map(([key, value], i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-medium" style={{ color: 'var(--color-primary)' }}>
                        {key}
                      </span>
                      <span style={{ color: 'var(--dash-text-3)' }}>&larr;</span>
                      <span style={{ color: 'var(--dash-text)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* If no voice data at all */}
            {!voiceRules && allPhrases.length === 0 && slangEntries.length === 0 && (
              <EmptyLabel text="אין נתוני קול וסגנון. סנכרן מאינסטגרם כדי ליצור פרסונה מפורטת." />
            )}
          </SectionCard>
        )}

        {/* ============================================================ */}
        {/*  3. KNOWLEDGE MAP (read-only)                                 */}
        {/* ============================================================ */}

        {knowledgeMap?.coreTopics && knowledgeMap.coreTopics.length > 0 && (
          <SectionCard icon={Brain} title="מפת ידע" collapsible defaultOpen>
            <div className="space-y-5">
              {knowledgeMap.coreTopics.map((topic, ti) => (
                <div key={ti}>
                  {/* Topic header */}
                  <div className="flex items-center gap-2 mb-2">
                    <Map className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                    <h3 className="font-bold text-sm" style={{ color: 'var(--dash-text)' }}>
                      {topic.name}
                    </h3>
                  </div>

                  {/* Key points */}
                  {topic.keyPoints && topic.keyPoints.length > 0 && (
                    <ul className="list-disc pr-5 space-y-1 mb-2">
                      {topic.keyPoints.map((point, pi) => (
                        <li key={pi} className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Subtopics */}
                  {topic.subtopics && topic.subtopics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {topic.subtopics.map((sub, si) => (
                        <span
                          key={si}
                          className="px-2 py-0.5 rounded text-xs"
                          style={{
                            background: 'color-mix(in srgb, var(--color-info) 12%, transparent)',
                            color: 'var(--color-info)',
                          }}
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Examples */}
                  {topic.examples && topic.examples.length > 0 && (
                    <div className="space-y-1 mr-3">
                      {topic.examples.map((ex, ei) => (
                        <p
                          key={ei}
                          className="text-xs pr-3 leading-relaxed"
                          style={{
                            color: 'var(--dash-text-3)',
                            borderRight: '2px solid var(--dash-border)',
                          }}
                        >
                          {ex}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Separator between topics (except last) */}
                  {ti < knowledgeMap.coreTopics!.length - 1 && (
                    <hr className="mt-4" style={{ borderColor: 'var(--dash-border)' }} />
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ============================================================ */}
        {/*  4. EDITABLE SETTINGS                                         */}
        {/* ============================================================ */}

        <SectionCard icon={Settings} title="הגדרות ניתנות לעריכה">
          {/* Legal notice (compact) */}
          <div
            className="rounded-lg p-4"
            style={{
              background: 'color-mix(in srgb, var(--color-info) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-info) 30%, transparent)',
            }}
          >
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-info)' }}>
              <strong>דרישה חוקית:</strong> על פי החוק הבוט חייב לגלות שהוא בוט בהתחלת השיחה, אבל אפשר לעשות את זה בצורה חמה ונעימה.
            </p>
          </div>

          {/* Greeting message */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text-2)' }}>
              הודעת ברוכים הבאים
            </label>
            <textarea
              value={persona.greeting_message}
              onChange={(e) => setPersona({ ...persona, greeting_message: e.target.value })}
              rows={3}
              placeholder='היי! אני הבוט של ירדן, פה לעזור לך עם כל שאלה...'
              className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none resize-none"
              style={{
                background: 'var(--dash-bg)',
                border: '1px solid var(--dash-border)',
                color: 'var(--dash-text)',
              }}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text-2)' }}>
              קצת על עצמי - הבוט ישתמש בזה
            </label>
            <textarea
              value={persona.bio}
              onChange={(e) => setPersona({ ...persona, bio: e.target.value })}
              rows={3}
              placeholder="אני ירדן, בלוגרית אופנה וטיולים. גרה בתל אביב, אוהבת קפה..."
              className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none resize-none"
              style={{
                background: 'var(--dash-bg)',
                border: '1px solid var(--dash-border)',
                color: 'var(--dash-text)',
              }}
            />
          </div>

          {/* Interests */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text-2)' }}>
              תחומי עניין
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addInterest()}
                placeholder="לדוגמה: ברצלונה, קפה, צילום"
                className="flex-1 px-4 py-2 rounded-lg text-sm focus:outline-none"
                style={{
                  background: 'var(--dash-bg)',
                  border: '1px solid var(--dash-border)',
                  color: 'var(--dash-text)',
                }}
              />
              <button
                onClick={addInterest}
                className="px-3 py-2 rounded-lg transition-colors flex items-center gap-1 text-sm"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
            </div>
            {persona.interests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {persona.interests.map((interest, index) => (
                  <Chip key={index} onRemove={() => removeInterest(index)}>
                    {interest}
                  </Chip>
                ))}
              </div>
            ) : (
              <EmptyLabel text="לא הוגדרו תחומי עניין" />
            )}
          </div>

          {/* Directives */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text-2)' }}>
              הנחיות התנהגות לבוט
            </label>

            {/* Tip box */}
            <div
              className="rounded-lg p-3 mb-3"
              style={{
                background: 'color-mix(in srgb, var(--dash-positive) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--dash-positive) 25%, transparent)',
              }}
            >
              <p className="text-xs" style={{ color: 'var(--dash-positive)' }}>
                <strong>טיפ:</strong> כתוב כללים כלליים, לא סקריפטים מוכנים. לדוגמה: &quot;כששואלים על דברים אישיים - תענה בעדינות שזה פרטי&quot;
              </p>
            </div>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newDirective}
                onChange={(e) => setNewDirective(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDirective()}
                placeholder="הוסף הנחיה חדשה..."
                className="flex-1 px-4 py-2 rounded-lg text-sm focus:outline-none"
                style={{
                  background: 'var(--dash-bg)',
                  border: '1px solid var(--dash-border)',
                  color: 'var(--dash-text)',
                }}
              />
              <button
                onClick={addDirective}
                className="px-3 py-2 rounded-lg transition-colors flex items-center gap-1 text-sm"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
            </div>

            {persona.directives.length > 0 ? (
              <div className="space-y-2">
                {persona.directives.map((directive, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg text-sm"
                    style={{ background: 'var(--dash-bg)', border: '1px solid var(--dash-border)' }}
                  >
                    <span className="flex-1" style={{ color: 'var(--dash-text)' }}>
                      {directive}
                    </span>
                    <button
                      onClick={() => removeDirective(index)}
                      className="pr-2 transition-colors"
                      style={{ color: 'var(--dash-negative)' }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyLabel text="לא הוגדרו הנחיות" />
            )}
          </div>

          {/* Save button */}
          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving || syncing}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              style={{ background: 'var(--color-primary)', color: 'white' }}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  שומר...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  שמור שינויים
                </>
              )}
            </button>
          </div>
        </SectionCard>

        {/* ============================================================ */}
        {/*  5. SYNC FROM INSTAGRAM                                       */}
        {/* ============================================================ */}

        <div
          className="rounded-xl border p-5"
          style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
        >
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 text-center sm:text-right">
              <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--dash-text)' }}>
                סנכרון מאינסטגרם
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--dash-text-3)' }}>
                סורק את הפוסטים שלך ובונה פרסונה מפורטת עם Gemini Pro. כולל טון, ביטויים, נושאים ועוד.
              </p>
            </div>
            <button
              onClick={syncFromInstagram}
              disabled={syncing || saving}
              className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              style={{ background: 'var(--color-primary)', color: 'white' }}
            >
              {syncing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  סורק...
                </>
              ) : (
                <>
                  <Instagram className="w-4 h-4" />
                  סנכרן מאינסטגרם
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Progress Modal */}
      <ScrapeProgressModal username={username} isOpen={showProgressModal} onComplete={handleSyncComplete} />
    </div>
  );
}
