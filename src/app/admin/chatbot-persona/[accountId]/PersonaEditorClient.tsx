'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Persona = {
  id: string;
  account_id: string;
  name: string;
  tone: 'friendly' | 'professional' | 'casual' | 'formal' | 'enthusiastic';
  language: 'he' | 'en' | 'ar' | 'ru';
  bio: string | null;
  description: string | null;
  interests: string[];
  topics: string[];
  response_style: string;
  emoji_usage: 'none' | 'minimal' | 'moderate' | 'heavy';
  greeting_message: string | null;
  directives: string[];
  instagram_username: string | null;
};

const TONE_OPTIONS: { value: Persona['tone']; label: string }[] = [
  { value: 'friendly', label: 'ידידותי' },
  { value: 'professional', label: 'מקצועי' },
  { value: 'casual', label: 'קז׳ואלי' },
  { value: 'formal', label: 'פורמלי' },
  { value: 'enthusiastic', label: 'נלהב' },
];

const EMOJI_OPTIONS: { value: Persona['emoji_usage']; label: string }[] = [
  { value: 'none', label: 'ללא' },
  { value: 'minimal', label: 'מעט' },
  { value: 'moderate', label: 'בינוני' },
  { value: 'heavy', label: 'הרבה' },
];

const TAG_COLORS = [
  'bg-[#9334EB]/15 text-[#2d8a5e] border-[#9334EB]/30',
  'bg-[#2663EB]/15 text-[#575a8c] border-[#2663EB]/30',
  'bg-[#DC2627]/15 text-[#a14470] border-[#DC2627]/30',
  'bg-[#FFD166]/15 text-[#8a7030] border-[#FFD166]/30',
  'bg-[#73C7FF]/15 text-[#3a6a8c] border-[#73C7FF]/30',
];

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [inputValue, setInputValue] = useState('');

  const addTag = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      setInputValue('');
    }
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${TAG_COLORS[i % TAG_COLORS.length]} transition-all`}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="hover:opacity-70 transition-opacity leading-none"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-4 py-2.5 bg-[#f8f9fc] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#2663EB]/50 focus:outline-none transition-shadow"
        />
        <button
          type="button"
          onClick={addTag}
          className="px-4 py-2.5 rounded-xl bg-[#9334EB]/10 text-[#2d8a5e] hover:bg-[#9334EB]/20 transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span className="text-sm font-medium">הוסף</span>
        </button>
      </div>
    </div>
  );
}

export default function PersonaEditorClient({
  params
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = use(params);
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPersona();
  }, [accountId]);

  const fetchPersona = async () => {
    try {
      const res = await fetch(`/api/influencer/chatbot/persona?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setPersona(data.persona);
      }
    } catch (error) {
      console.error('Failed to load persona:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!persona) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/influencer/chatbot/persona`, {
        method: persona.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          ...persona,
        }),
      });

      if (!res.ok) throw new Error('Failed to save');

      alert('הפרסונה נשמרה בהצלחה!');
      fetchPersona();
    } catch (error) {
      console.error('Failed to save persona:', error);
      alert('שגיאה בשמירת הפרסונה');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-[800px] mx-auto px-6 mt-12">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-[#2663EB]/20" />
            <div className="h-7 bg-[#2663EB]/10 rounded-xl w-1/3" />
          </div>
          <div className="neon-card p-8 space-y-6">
            <div className="h-5 bg-[#2663EB]/10 rounded-xl w-1/4" />
            <div className="h-12 bg-[#f8f9fc] rounded-xl" />
            <div className="h-5 bg-[#2663EB]/10 rounded-xl w-1/4" />
            <div className="h-12 bg-[#f8f9fc] rounded-xl" />
            <div className="h-5 bg-[#2663EB]/10 rounded-xl w-1/4" />
            <div className="h-24 bg-[#f8f9fc] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!persona) {
    // Initialize empty persona
    setPersona({
      id: '',
      account_id: accountId,
      name: '',
      tone: 'friendly',
      language: 'he',
      bio: null,
      description: null,
      interests: [],
      topics: [],
      response_style: 'helpful',
      emoji_usage: 'moderate',
      greeting_message: null,
      directives: [],
      instagram_username: null,
    });
    return null;
  }

  return (
    <div className="max-w-[800px] mx-auto px-6 mt-12">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="neon-pill neon-pill-outline flex items-center gap-1.5 text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            חזרה
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[#474747] font-headline">עריכת פרסונה</h1>
            {persona.name && (
              <p className="text-sm text-[#474747]/60 mt-0.5">
                {persona.name}
                {persona.instagram_username && (
                  <span className="mr-2 text-[#2663EB]">@{persona.instagram_username}</span>
                )}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="neon-pill neon-pill-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              שומר...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">save</span>
              שמור שינויים
            </>
          )}
        </button>
      </div>

      <div className="space-y-6">
        {/* Section 1: Basic Details */}
        <div className="neon-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#f3f4f6]">
            <div className="w-9 h-9 rounded-full bg-[#2663EB]/15 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#2663EB] text-[20px]">person</span>
            </div>
            <h2 className="text-lg font-bold text-[#474747] font-headline">פרטים בסיסיים</h2>
          </div>
          <div className="p-6 space-y-5">
            {/* Bot Name */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-2">שם הבוט</label>
              <input
                type="text"
                value={persona.name}
                onChange={(e) => setPersona({ ...persona, name: e.target.value })}
                placeholder="לדוגמה: ליאור המסייעת"
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#2663EB]/50 focus:outline-none transition-shadow"
              />
            </div>

            {/* Instagram Username */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-2">שם משתמש באינסטגרם</label>
              <div className="relative">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#474747]/40 text-sm">@</span>
                <input
                  type="text"
                  value={persona.instagram_username || ''}
                  onChange={(e) => setPersona({ ...persona, instagram_username: e.target.value || null })}
                  placeholder="username"
                  className="w-full pr-8 pl-4 py-2.5 bg-[#f8f9fc] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#2663EB]/50 focus:outline-none transition-shadow"
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-2">ביוגרפיה</label>
              <textarea
                value={persona.bio || ''}
                onChange={(e) => setPersona({ ...persona, bio: e.target.value })}
                placeholder="ביוגרפיה מאינסטגרם..."
                rows={3}
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#2663EB]/50 focus:outline-none transition-shadow resize-none"
              />
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-2">תחומי עניין</label>
              <TagInput
                tags={persona.interests}
                onChange={(interests) => setPersona({ ...persona, interests })}
                placeholder="הקלד תחום עניין ולחץ Enter"
              />
            </div>

            {/* Topics */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-2">נושאים</label>
              <TagInput
                tags={persona.topics}
                onChange={(topics) => setPersona({ ...persona, topics })}
                placeholder="הקלד נושא ולחץ Enter"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Voice & Style */}
        <div className="neon-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#f3f4f6]">
            <div className="w-9 h-9 rounded-full bg-[#FFD166]/15 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#FFD166] text-[20px]">mic</span>
            </div>
            <h2 className="text-lg font-bold text-[#474747] font-headline">קול וסגנון</h2>
          </div>
          <div className="p-6 space-y-5">
            {/* Tone Selection */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-3">טון דיבור</label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPersona({ ...persona, tone: opt.value })}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      persona.tone === opt.value
                        ? 'bg-[#575a8c] text-white shadow-md shadow-[#575a8c]/25'
                        : 'bg-[#f8f9fc] text-[#474747] hover:bg-[#2663EB]/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-2">שפה</label>
              <select
                value={persona.language}
                onChange={(e) => setPersona({ ...persona, language: e.target.value as Persona['language'] })}
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#2663EB]/50 focus:outline-none transition-shadow appearance-none cursor-pointer"
              >
                <option value="he">עברית</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
                <option value="ru">Русский</option>
              </select>
            </div>

            {/* Emoji Usage */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-3">שימוש באימוג׳י</label>
              <div className="grid grid-cols-4 gap-2">
                {EMOJI_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPersona({ ...persona, emoji_usage: opt.value })}
                    className={`py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                      persona.emoji_usage === opt.value
                        ? 'bg-[#575a8c] text-white shadow-md shadow-[#575a8c]/25'
                        : 'bg-[#f8f9fc] text-[#474747] hover:bg-[#2663EB]/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Response Style */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-2">סגנון תגובה</label>
              <textarea
                value={persona.response_style}
                onChange={(e) => setPersona({ ...persona, response_style: e.target.value })}
                placeholder="תאר את סגנון התגובה הרצוי, לדוגמה: helpful, funny, serious"
                rows={3}
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#2663EB]/50 focus:outline-none transition-shadow resize-none"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Greeting & Directives */}
        <div className="neon-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#f3f4f6]">
            <div className="w-9 h-9 rounded-full bg-[#9334EB]/15 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#9334EB] text-[20px]">forum</span>
            </div>
            <h2 className="text-lg font-bold text-[#474747] font-headline">ברכה והנחיות</h2>
          </div>
          <div className="p-6 space-y-5">
            {/* Greeting Message */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-2">הודעת ברכה</label>
              <textarea
                value={persona.greeting_message || ''}
                onChange={(e) => setPersona({ ...persona, greeting_message: e.target.value })}
                placeholder="שלום! איך אפשר לעזור?"
                rows={3}
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#2663EB]/50 focus:outline-none transition-shadow resize-none"
              />
            </div>

            {/* Directives */}
            <div>
              <label className="block text-sm font-semibold text-[#474747] mb-2">הנחיות לצ׳אטבוט</label>
              <textarea
                value={persona.directives.join('\n')}
                onChange={(e) => setPersona({
                  ...persona,
                  directives: e.target.value.split('\n').filter(d => d.trim())
                })}
                placeholder={"תמיד תציע קופון\nאל תדבר על מחירים\nתהיה חיובי ומעודד"}
                rows={5}
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border-none rounded-xl text-sm font-mono focus:ring-2 focus:ring-[#2663EB]/50 focus:outline-none transition-shadow resize-none"
              />
              <div className="mt-3 flex items-start gap-2 bg-[#2663EB]/8 rounded-xl p-3">
                <span className="material-symbols-outlined text-[#2663EB] text-[18px] mt-0.5">info</span>
                <p className="text-xs text-[#474747]/70 leading-relaxed">
                  שורה אחת לכל הנחיה. ההנחיות מגדירות את ההתנהגות של הצ׳אטבוט בשיחות עם עוקבים.
                  <span className="block mt-1 font-medium text-[#575a8c]">{persona.directives.length} הנחיות</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Instagram Info Card */}
        {persona.instagram_username && (
          <div className="rounded-2xl bg-[#9334EB]/8 border border-[#9334EB]/20 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-[#9334EB]/15 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#9334EB] text-[18px]">photo_camera</span>
              </div>
              <h3 className="font-bold text-[#2d8a5e] text-sm">מידע מאינסטגרם</h3>
            </div>
            <p className="text-sm text-[#2d8a5e]/80 mr-11">
              משתמש: <span className="font-medium">@{persona.instagram_username}</span>
            </p>
            <p className="text-xs text-[#2d8a5e]/60 mt-1.5 mr-11">
              המידע מאינסטגרם מתעדכן אוטומטית. ניתן לערוך רק את ההנחיות וההגדרות למעלה.
            </p>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 rounded-full bg-[#2663EB] text-white font-semibold text-sm hover:bg-[#9b9ddb] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-[#2663EB]/20 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                שומר...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">save</span>
                שמור שינויים
              </>
            )}
          </button>
          <button
            onClick={() => router.back()}
            className="px-8 py-3 rounded-full border-2 border-[#e0ddd8] text-[#474747] font-semibold text-sm hover:bg-[#f8f9fc] transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
