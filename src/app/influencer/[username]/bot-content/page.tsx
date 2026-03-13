'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Save,
  Trash2,
  Tag,
  Handshake,
  MessageSquare,
  BookOpen,
  Database,
  Instagram,
  Lightbulb,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  PenLine,
  Upload,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CoreTopic {
  name: string;
  keyPoints?: string[];
  subtopics?: string[];
  examples?: string[];
}

interface CouponItem {
  id: string;
  code: string;
  brandName: string;
  discountType?: string;
  discountValue?: number;
  copyCount: number;
  isActive: boolean;
  partnershipId?: string;
}

interface PartnershipItem {
  id: string;
  brandName: string;
  status: string;
  contractAmount: number;
  category?: string;
  couponCode?: string;
  startDate?: string;
  endDate?: string;
}

interface DashboardStats {
  influencer: {
    id: string;
    username: string;
    display_name?: string;
  };
  instagram: {
    totalPosts: number;
    followers: number;
  };
  partnerships: {
    total: number;
    active: number;
    list: PartnershipItem[];
  };
  coupons: {
    total: number;
    active: number;
    totalCopies: number;
    list: CouponItem[];
  };
  botKnowledge: {
    totalDocuments: number;
    totalChunks: number;
    docsByType: Record<string, number>;
    hasPersona: boolean;
  };
}

interface KnowledgeEntry {
  id: string;
  knowledge_type: string;
  title: string;
  content: string;
  keywords: string[];
  priority: number;
  source_type: string;
  is_active: boolean;
  created_at: string;
}

interface PersonaData {
  greeting_message?: string;
  directives?: string;
  knowledge_map?: {
    coreTopics?: CoreTopic[];
  };
  voice_rules?: {
    recurringPhrases?: string[];
    avoidedWords?: string[];
    tone?: string;
    responseStructure?: string;
    avgLength?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusLabels: Record<string, string> = {
  active: 'פעיל',
  proposal: 'הצעה',
  negotiation: 'משא ומתן',
  completed: 'הושלם',
  cancelled: 'בוטל',
  expired: 'פג תוקף',
};

const statusColors: Record<string, string> = {
  active: 'var(--dash-positive)',
  proposal: 'var(--color-info)',
  negotiation: 'var(--color-primary)',
  completed: 'var(--dash-text-3)',
  cancelled: 'var(--dash-negative)',
  expired: 'var(--dash-text-3)',
};

const knowledgeTypeLabels: Record<string, string> = {
  faq: 'שאלה נפוצה',
  custom: 'מידע כללי',
  product: 'מוצר',
  coupon: 'קופון',
  active_partnership: 'שיתוף פעולה',
  manual: 'ידני',
};

function formatCurrency(amount: number): string {
  if (!amount) return '';
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BotContentPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data from APIs
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [persona, setPersona] = useState<PersonaData | null>(null);

  // Editable fields
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [greetingMessage, setGreetingMessage] = useState('');

  // Knowledge entries (manual)
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [newEntry, setNewEntry] = useState({ knowledge_type: 'faq', title: '', content: '' });
  const [addingEntry, setAddingEntry] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    topics: true,
    coupons: true,
    partnerships: false,
    config: true,
    knowledge: false,
    manualKnowledge: true,
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  /* ---- data loading ---- */

  const loadData = async () => {
    try {
      // 1. Auth check
      const authRes = await fetch(`/api/influencer/auth?username=${username}`);
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.push(`/influencer/${username}/login`);
        return;
      }

      // 2. Load all APIs in parallel
      const [statsRes, personaRes, knowledgeRes] = await Promise.all([
        fetch(`/api/influencer/dashboard-stats?username=${username}`),
        fetch(`/api/influencer/chatbot/persona?username=${username}`),
        fetch(`/api/influencer/chatbot/knowledge?username=${username}`),
      ]);

      if (!statsRes.ok) {
        console.error('Failed to load dashboard stats', statsRes.status);
        return;
      }

      const statsData: DashboardStats = await statsRes.json();
      setStats(statsData);

      let personaData: PersonaData | null = null;
      if (personaRes.ok) {
        const pBody = await personaRes.json();
        personaData = pBody.persona || null;
      }
      setPersona(personaData);

      // Load knowledge entries
      if (knowledgeRes.ok) {
        const kBody = await knowledgeRes.json();
        setKnowledgeEntries(kBody.knowledge || []);
      }

      // Populate editable fields from persona
      setGreetingMessage(personaData?.greeting_message || '');
      // suggested_questions live in account config, loaded via stats influencer
      // The persona API doesn't return them, but the config save API writes to accounts.config
      // We'll use persona greeting and leave questions empty if not in persona
      setSuggestedQuestions([]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  /* ---- save config ---- */

  const handleSaveConfig = async () => {
    if (!stats) return;
    setSaving(true);
    try {
      const res = await fetch('/api/influencer/content/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: stats.influencer.id,
          suggested_questions: suggestedQuestions,
          greeting_message: greetingMessage,
        }),
      });

      if (res.ok) {
        // Also update persona greeting_message if persona exists
        await fetch(`/api/influencer/chatbot/persona?username=${username}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ greeting_message: greetingMessage }),
        });
        alert('הגדרות נשמרו בהצלחה!');
      } else {
        alert('שגיאה בשמירה');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      alert('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  /* ---- questions ---- */

  const handleAddQuestion = () => {
    setSuggestedQuestions([...suggestedQuestions, '']);
  };

  const handleUpdateQuestion = (index: number, value: string) => {
    const updated = [...suggestedQuestions];
    updated[index] = value;
    setSuggestedQuestions(updated);
  };

  const handleDeleteQuestion = (index: number) => {
    setSuggestedQuestions(suggestedQuestions.filter((_, i) => i !== index));
  };

  /* ---- knowledge CRUD ---- */

  const handleAddKnowledgeEntry = async () => {
    if (!newEntry.title.trim() || !newEntry.content.trim()) {
      alert('יש למלא כותרת ותוכן');
      return;
    }
    setAddingEntry(true);
    try {
      const res = await fetch(`/api/influencer/chatbot/knowledge?username=${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledge_type: newEntry.knowledge_type,
          title: newEntry.title,
          content: newEntry.content,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setKnowledgeEntries((prev) => [data.knowledge, ...prev]);
        setNewEntry({ knowledge_type: 'faq', title: '', content: '' });
      } else {
        alert('שגיאה בהוספת תוכן');
      }
    } catch {
      alert('שגיאה בהוספת תוכן');
    } finally {
      setAddingEntry(false);
    }
  };

  const handleDeleteKnowledgeEntry = async (entryId: string) => {
    if (!confirm('למחוק את הערך הזה?')) return;
    setDeletingEntryId(entryId);
    try {
      const res = await fetch(
        `/api/influencer/chatbot/knowledge?username=${username}&id=${entryId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setKnowledgeEntries((prev) => prev.filter((e) => e.id !== entryId));
      } else {
        alert('שגיאה במחיקה');
      }
    } catch {
      alert('שגיאה במחיקה');
    } finally {
      setDeletingEntryId(null);
    }
  };

  /* ---- UI helpers ---- */

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  /* ---- loading state ---- */

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        dir="rtl"
        style={{ background: 'transparent' }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (!stats) return null;

  const coreTopics = persona?.knowledge_map?.coreTopics || [];
  const coupons = stats.coupons.list || [];
  const partnerships = stats.partnerships.list || [];

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div
      className="min-h-screen"
      dir="rtl"
      style={{ background: 'transparent', color: 'var(--dash-text)' }}
    >
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ========== STATS STRIP ========== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard
            icon={<Handshake className="w-6 h-6" />}
            iconBg="rgba(168,85,247,0.15)"
            iconColor="var(--color-primary)"
            value={stats.partnerships.total}
            label="שיתופי פעולה"
          />
          <StatCard
            icon={<Tag className="w-6 h-6" />}
            iconBg="rgba(34,197,94,0.15)"
            iconColor="var(--dash-positive)"
            value={stats.coupons.active}
            label="קופונים פעילים"
          />
          <StatCard
            icon={<Instagram className="w-6 h-6" />}
            iconBg="rgba(225,48,108,0.15)"
            iconColor="#E1306C"
            value={stats.instagram.totalPosts}
            label="פוסטים"
          />
          <StatCard
            icon={<Database className="w-6 h-6" />}
            iconBg="rgba(59,130,246,0.15)"
            iconColor="var(--color-info)"
            value={`${stats.botKnowledge.totalDocuments} / ${stats.botKnowledge.totalChunks}`}
            label="מסמכים / חלקים"
          />
          <StatCard
            icon={<Lightbulb className="w-6 h-6" />}
            iconBg="rgba(250,204,21,0.15)"
            iconColor="#FACC15"
            value={coreTopics.length}
            label="נושאי ידע"
          />
        </div>

        {/* ========== KNOWLEDGE TOPICS ========== */}
        <CollapsibleSection
          title="נושאי ידע"
          count={coreTopics.length}
          icon={<Lightbulb className="w-5 h-5" style={{ color: '#FACC15' }} />}
          expanded={expandedSections.topics}
          onToggle={() => toggleSection('topics')}
        >
          {coreTopics.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--dash-text-2)' }}>
              אין נושאי ידע. הבוט עדיין לא נסרק או שהפרסונה לא נבנתה.
            </p>
          ) : (
            <div className="space-y-4">
              {coreTopics.map((topic, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <h4 className="font-semibold text-sm mb-2" style={{ color: 'var(--dash-text)' }}>
                    {topic.name}
                  </h4>

                  {/* Subtopics as tags */}
                  {topic.subtopics && topic.subtopics.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {topic.subtopics.map((sub, si) => (
                        <span
                          key={si}
                          className="px-2 py-0.5 rounded-full text-xs"
                          style={{
                            background: 'rgba(168,85,247,0.12)',
                            color: 'var(--color-primary)',
                          }}
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Key points as bullet list */}
                  {topic.keyPoints && topic.keyPoints.length > 0 && (
                    <ul className="list-disc list-inside space-y-1">
                      {topic.keyPoints.map((point, pi) => (
                        <li
                          key={pi}
                          className="text-xs"
                          style={{ color: 'var(--dash-text-2)' }}
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* ========== COUPONS ========== */}
        <CollapsibleSection
          title="קופונים"
          count={coupons.length}
          icon={<Tag className="w-5 h-5" style={{ color: 'var(--dash-positive)' }} />}
          expanded={expandedSections.coupons}
          onToggle={() => toggleSection('coupons')}
        >
          {coupons.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--dash-text-2)' }}>
              אין קופונים
            </p>
          ) : (
            <div className="space-y-3">
              {coupons.map((coupon) => (
                <div
                  key={coupon.id}
                  className="flex items-center justify-between p-4 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {/* Code badge */}
                      <span
                        className="px-2 py-1 text-xs rounded font-mono font-bold"
                        style={{
                          background: 'rgba(34,197,94,0.15)',
                          color: 'var(--dash-positive)',
                        }}
                      >
                        {coupon.code}
                      </span>

                      {/* Brand */}
                      <span className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
                        {coupon.brandName}
                      </span>

                      {/* Active / Inactive badge */}
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          background: coupon.isActive
                            ? 'rgba(34,197,94,0.15)'
                            : 'rgba(239,68,68,0.15)',
                          color: coupon.isActive
                            ? 'var(--dash-positive)'
                            : 'var(--dash-negative)',
                        }}
                      >
                        {coupon.isActive ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </div>

                    {/* Discount info */}
                    {coupon.discountType && (
                      <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>
                        {coupon.discountType === 'percentage' && `${coupon.discountValue}% הנחה`}
                        {coupon.discountType === 'fixed' && `${formatCurrency(coupon.discountValue || 0)} הנחה`}
                        {coupon.discountType === 'free_shipping' && 'משלוח חינם'}
                      </p>
                    )}

                    {/* Usage stats */}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                        <Copy className="w-3 h-3" />
                        {coupon.copyCount} העתקות
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* ========== PARTNERSHIPS ========== */}
        <CollapsibleSection
          title="שיתופי פעולה"
          count={partnerships.length}
          icon={<Handshake className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />}
          expanded={expandedSections.partnerships}
          onToggle={() => toggleSection('partnerships')}
        >
          {partnerships.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--dash-text-2)' }}>
              אין שיתופי פעולה
            </p>
          ) : (
            <div className="space-y-3">
              {partnerships.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-4 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
                        {p.brandName}
                      </span>

                      {/* Status badge */}
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          background: `color-mix(in srgb, ${statusColors[p.status] || 'var(--dash-text-3)'} 15%, transparent)`,
                          color: statusColors[p.status] || 'var(--dash-text-3)',
                        }}
                      >
                        {statusLabels[p.status] || p.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-1">
                      {p.contractAmount > 0 && (
                        <span className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                          {formatCurrency(p.contractAmount)}
                        </span>
                      )}
                      {p.couponCode && (
                        <span className="text-xs font-mono" style={{ color: 'var(--dash-positive)' }}>
                          {p.couponCode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* ========== CHAT CONFIG ========== */}
        <CollapsibleSection
          title="הגדרות צ'אט"
          icon={<MessageSquare className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />}
          expanded={expandedSections.config}
          onToggle={() => toggleSection('config')}
        >
          {/* Greeting Message */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>
              הודעת ברכה
            </label>
            <textarea
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
              className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--dash-glass-border)',
                color: 'var(--dash-text)',
              }}
              rows={3}
              placeholder="היי! אני הבוט של..."
            />
          </div>

          {/* Suggested Questions */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--dash-text-2)' }}>
                שאלות מוצעות
              </label>
              <button
                onClick={handleAddQuestion}
                className="px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 btn-primary"
              >
                <Plus className="w-3 h-3" />
                הוסף שאלה
              </button>
            </div>
            <div className="space-y-2">
              {suggestedQuestions.map((question, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => handleUpdateQuestion(idx, e.target.value)}
                    className="flex-1 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--dash-glass-border)',
                      color: 'var(--dash-text)',
                    }}
                    placeholder={`שאלה ${idx + 1}`}
                  />
                  <button
                    onClick={() => handleDeleteQuestion(idx)}
                    className="p-2 rounded-xl transition-colors"
                    style={{ color: 'var(--dash-negative)' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {suggestedQuestions.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--dash-text-2)' }}>
                  אין שאלות מוצעות
                </p>
              )}
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="w-full px-6 py-3 disabled:opacity-50 rounded-2xl transition-all font-medium flex items-center justify-center gap-2 btn-primary"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                שמור הגדרות
              </>
            )}
          </button>
        </CollapsibleSection>

        {/* ========== BOT KNOWLEDGE ========== */}
        <CollapsibleSection
          title="ידע הבוט"
          icon={<BookOpen className="w-5 h-5" style={{ color: 'var(--color-info)' }} />}
          expanded={expandedSections.knowledge}
          onToggle={() => toggleSection('knowledge')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div
              className="p-4 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              <p className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>
                {stats.botKnowledge.totalDocuments}
              </p>
              <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                מסמכים מעובדים
              </p>
            </div>
            <div
              className="p-4 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              <p className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>
                {stats.botKnowledge.totalChunks}
              </p>
              <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                חלקי ידע (chunks)
              </p>
            </div>
          </div>

          {/* Document types breakdown */}
          {Object.keys(stats.botKnowledge.docsByType).length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>
                סוגי מסמכים:
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.botKnowledge.docsByType).map(([type, count]) => (
                  <span
                    key={type}
                    className="px-2 py-1 rounded-xl text-xs"
                    style={{
                      background: 'rgba(59,130,246,0.12)',
                      color: 'var(--color-info)',
                    }}
                  >
                    {type}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
              הבוט משתמש בכל המידע הזה כדי לענות על שאלות: פוסטים מאינסטגרם, מסמכים שהועלו, שיתופי פעולה, קופונים ועוד.
            </p>
            <Link
              href={`/influencer/${username}/documents/upload`}
              className="shrink-0 px-4 py-2 text-sm rounded-xl font-medium transition-colors flex items-center gap-2 btn-primary"
            >
              <Upload className="w-4 h-4" />
              העלאת מסמך
            </Link>
          </div>
        </CollapsibleSection>

        {/* ========== MANUAL KNOWLEDGE ========== */}
        <CollapsibleSection
          title="הוספת תוכן ידני"
          count={knowledgeEntries.length}
          icon={<PenLine className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />}
          expanded={expandedSections.manualKnowledge}
          onToggle={() => toggleSection('manualKnowledge')}
        >
          {/* Add form */}
          <div
            className="p-4 rounded-2xl mb-4"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dash-text-2)' }}>
                  סוג
                </label>
                <select
                  value={newEntry.knowledge_type}
                  onChange={(e) => setNewEntry({ ...newEntry, knowledge_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--dash-glass-border)',
                    color: 'var(--dash-text)',
                  }}
                >
                  <option value="faq">שאלה נפוצה (FAQ)</option>
                  <option value="custom">מידע כללי</option>
                  <option value="product">מוצר</option>
                  <option value="coupon">קופון</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dash-text-2)' }}>
                  כותרת
                </label>
                <input
                  type="text"
                  value={newEntry.title}
                  onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--dash-glass-border)',
                    color: 'var(--dash-text)',
                  }}
                  placeholder="לדוגמה: מהן שעות הפעילות?"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dash-text-2)' }}>
                תוכן
              </label>
              <textarea
                value={newEntry.content}
                onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--dash-glass-border)',
                  color: 'var(--dash-text)',
                }}
                rows={3}
                placeholder="התשובה או המידע שהבוט ישתמש בו..."
              />
            </div>
            <button
              onClick={handleAddKnowledgeEntry}
              disabled={addingEntry}
              className="px-4 py-2 text-sm rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50 btn-primary"
            >
              {addingEntry ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              הוסף לידע הבוט
            </button>
          </div>

          {/* Existing entries list */}
          {knowledgeEntries.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--dash-text-2)' }}>
              עדיין לא הוספת תוכן ידני. הבוט ישתמש רק במידע שנאסף אוטומטית.
            </p>
          ) : (
            <div className="space-y-3">
              {knowledgeEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between p-4 rounded-2xl gap-3"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
                        {entry.title}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          background: 'rgba(168,85,247,0.12)',
                          color: 'var(--color-primary)',
                        }}
                      >
                        {knowledgeTypeLabels[entry.knowledge_type] || entry.knowledge_type}
                      </span>
                      {entry.source_type === 'manual' && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px]"
                          style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--color-info)' }}
                        >
                          ידני
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--dash-text-2)' }}>
                      {entry.content}
                    </p>
                  </div>
                  {entry.source_type === 'manual' && (
                    <button
                      onClick={() => handleDeleteKnowledgeEntry(entry.id)}
                      disabled={deletingEntryId === entry.id}
                      className="p-2 rounded-xl transition-colors shrink-0"
                      style={{ color: 'var(--dash-negative)' }}
                    >
                      {deletingEntryId === entry.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs mt-4" style={{ color: 'var(--dash-text-3)' }}>
            תוכן ידני שתוסיף יהיה זמין לבוט ישירות. הוא יופיע בתשובות כשמישהו ישאל שאלה רלוונטית.
          </p>
        </CollapsibleSection>

      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatCard({
  icon,
  iconBg,
  iconColor,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  value: string | number;
  label: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-border)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold truncate" style={{ color: 'var(--dash-text)' }}>
            {value}
          </p>
          <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-6 mb-6"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-border)' }}
    >
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={onToggle}
      >
        <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
          {icon}
          {title}
          {count !== undefined && (
            <span className="text-sm font-normal" style={{ color: 'var(--dash-text-3)' }}>
              ({count})
            </span>
          )}
        </h3>
        {expanded ? (
          <ChevronUp className="w-5 h-5" style={{ color: 'var(--dash-text-2)' }} />
        ) : (
          <ChevronDown className="w-5 h-5" style={{ color: 'var(--dash-text-2)' }} />
        )}
      </div>

      {expanded && <div className="mt-4">{children}</div>}
    </div>
  );
}
