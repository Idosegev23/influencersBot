'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings,
  Save,
  Loader2,
  Check,
  MessageSquare,
  Plus,
  X,
  Sparkles,
  GripVertical,
} from 'lucide-react';
import { getInfluencerByUsername } from '@/lib/supabase';
import type { Influencer } from '@/types';

export default function SettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [greetingMessage, setGreetingMessage] = useState('');
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();
        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);

        // Load greeting from config or chatbot_persona
        if (inf.greeting_message) {
          setGreetingMessage(inf.greeting_message);
        } else if ((inf as any).config?.widget?.welcomeMessage) {
          setGreetingMessage((inf as any).config.widget.welcomeMessage);
        }

        // Load suggested questions
        const questions = inf.suggested_questions
          || (inf as any).config?.suggested_questions
          || [];
        setSuggestedQuestions(questions);
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/influencer/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          greeting_message: greetingMessage,
          suggested_questions: suggestedQuestions,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch('/api/influencer/regenerate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.greeting) {
          setGreetingMessage(data.greeting);
        }
        if (data.questions && data.questions.length > 0) {
          setSuggestedQuestions(data.questions);
        }
      }
    } catch (err) {
      console.error('Error regenerating greeting:', err);
    } finally {
      setRegenerating(false);
    }
  }

  function addQuestion() {
    const trimmed = newQuestion.trim();
    if (!trimmed) return;
    if (suggestedQuestions.length >= 6) return;
    setSuggestedQuestions([...suggestedQuestions, trimmed]);
    setNewQuestion('');
  }

  function removeQuestion(index: number) {
    setSuggestedQuestions(suggestedQuestions.filter((_, i) => i !== index));
  }

  function startEditing(index: number) {
    setEditingIndex(index);
    setEditingText(suggestedQuestions[index]);
  }

  function saveEditing() {
    if (editingIndex === null) return;
    const trimmed = editingText.trim();
    if (!trimmed) {
      removeQuestion(editingIndex);
    } else {
      const updated = [...suggestedQuestions];
      updated[editingIndex] = trimmed;
      setSuggestedQuestions(updated);
    }
    setEditingIndex(null);
    setEditingText('');
  }

  function moveQuestion(from: number, to: number) {
    if (to < 0 || to >= suggestedQuestions.length) return;
    const updated = [...suggestedQuestions];
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    setSuggestedQuestions(updated);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            הגדרות צ׳אט
          </h1>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            {regenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {regenerating ? 'יוצר...' : 'צור הכל מחדש'}
          </button>
        </div>

        <p className="text-sm" style={{ color: 'var(--dash-text-3)' }}>
          כאן תוכל/י לערוך את ההודעה הראשונה שהעוקבים רואים כשנכנסים לצ׳אט, ואת השאלות המוצעות.
          <br />
          טיפ: שימי הודעה על מבצע, השקה חדשה, או כל דבר שרלוונטי עכשיו!
        </p>

        {/* ──── Greeting Message ──── */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
              הודעת פתיחה
            </h2>
          </div>

          <p className="text-sm mb-3" style={{ color: 'var(--dash-text-3)' }}>
            ההודעה הראשונה שמופיעה כשפותחים את הצ׳אט
          </p>

          <textarea
            className="input w-full py-3 px-4 text-sm"
            rows={3}
            value={greetingMessage}
            onChange={(e) => setGreetingMessage(e.target.value)}
            placeholder="היי! אני כאן לעזור לך עם כל שאלה..."
          />

          <p className="text-xs mt-2" style={{ color: 'var(--dash-text-3)' }}>
            {greetingMessage.length}/200 תווים
          </p>
        </div>

        {/* ──── Suggested Questions ──── */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M12 7v2" />
                <path d="M12 13h.01" />
              </svg>
              שאלות מוצעות
            </h2>
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dash-text-3)' }}>
              {suggestedQuestions.length}/6
            </span>
          </div>

          <p className="text-sm mb-4" style={{ color: 'var(--dash-text-3)' }}>
            הכפתורים שמופיעים מתחת להודעת הפתיחה — העוקבים לוחצים עליהם כדי להתחיל שיחה
          </p>

          {/* Questions list */}
          <div className="space-y-2 mb-4">
            {suggestedQuestions.map((q, i) => (
              <div
                key={i}
                className="flex items-center gap-2 group rounded-xl p-3 transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-glass-border)' }}
              >
                <button
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity cursor-grab"
                  style={{ color: 'var(--dash-text-3)' }}
                  title="הזז למעלה"
                  onClick={() => moveQuestion(i, i - 1)}
                >
                  <GripVertical className="w-4 h-4" />
                </button>

                {editingIndex === i ? (
                  <input
                    className="input flex-1 py-1.5 px-3 text-sm"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={saveEditing}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditing();
                      if (e.key === 'Escape') { setEditingIndex(null); setEditingText(''); }
                    }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="flex-1 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => startEditing(i)}
                    title="לחצי לעריכה"
                  >
                    {q}
                  </span>
                )}

                <button
                  onClick={() => removeQuestion(i)}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
                  style={{ color: 'var(--color-error, #ef4444)' }}
                  title="מחק"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Add question */}
          {suggestedQuestions.length < 6 && (
            <div className="flex gap-2">
              <input
                className="input flex-1 py-2.5 px-4 text-sm"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="הוסיפי שאלה חדשה..."
                onKeyDown={(e) => { if (e.key === 'Enter') addQuestion(); }}
              />
              <button
                onClick={addQuestion}
                disabled={!newQuestion.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-30 hover:opacity-90"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
            </div>
          )}
        </div>

        {/* ──── Preview ──── */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            תצוגה מקדימה
          </h2>

          <div
            className="rounded-2xl p-5 space-y-4"
            style={{ background: 'var(--dash-muted)', border: '1px solid var(--dash-glass-border)' }}
          >
            {/* Greeting bubble */}
            {greetingMessage && (
              <div
                className="p-3.5 rounded-2xl text-sm leading-relaxed"
                style={{
                  background: 'rgba(160,148,224,0.1)',
                  border: '1px solid rgba(160,148,224,0.2)',
                  color: 'var(--dash-text)',
                  borderBottomLeftRadius: '4px',
                  maxWidth: '85%',
                }}
              >
                {greetingMessage}
              </div>
            )}

            {/* Suggested questions preview */}
            {suggestedQuestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q, i) => (
                  <div
                    key={i}
                    className="px-3.5 py-2 rounded-full text-xs font-medium cursor-default"
                    style={{
                      background: 'rgba(160,148,224,0.08)',
                      border: '1px solid rgba(160,148,224,0.25)',
                      color: 'var(--dash-text-2)',
                    }}
                  >
                    {q}
                  </div>
                ))}
              </div>
            )}

            {!greetingMessage && suggestedQuestions.length === 0 && (
              <p className="text-center text-sm py-4" style={{ color: 'var(--dash-text-3)' }}>
                הוסיפי הודעת פתיחה ושאלות מוצעות כדי לראות תצוגה מקדימה
              </p>
            )}
          </div>
        </div>

        {/* ──── Save ──── */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 shadow-lg hover:shadow-xl"
            style={{ background: saved ? '#17A34A' : 'var(--color-primary)', color: '#fff' }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? 'נשמר!' : 'שמור שינויים'}
          </button>
        </div>
      </main>
    </div>
  );
}
