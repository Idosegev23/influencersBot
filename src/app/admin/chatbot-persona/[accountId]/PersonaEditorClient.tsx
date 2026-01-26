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
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/admin" className="text-blue-600 hover:underline mb-4 inline-block">
            ← חזרה לניהול
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">עריכת פרסונת צ׳אטבוט</h1>
          <p className="text-gray-600 mt-2">
            התאם את אופי התגובות והתנהגות של הצ׳אטבוט
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              שם הפרסונה
            </label>
            <input
              type="text"
              value={persona.name}
              onChange={(e) => setPersona({ ...persona, name: e.target.value })}
              placeholder="לדוגמה: ליאור המסייעת"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Tone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              טון דיבור
            </label>
            <select
              value={persona.tone}
              onChange={(e) => setPersona({ ...persona, tone: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="friendly">ידידותי</option>
              <option value="professional">מקצועי</option>
              <option value="casual">רגיל</option>
              <option value="formal">רשמי</option>
              <option value="enthusiastic">נלהב</option>
            </select>
          </div>

          {/* Response Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סגנון תגובה
            </label>
            <input
              type="text"
              value={persona.response_style}
              onChange={(e) => setPersona({ ...persona, response_style: e.target.value })}
              placeholder="helpful, funny, serious, etc."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Emoji Usage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              שימוש באימוג׳י
            </label>
            <select
              value={persona.emoji_usage}
              onChange={(e) => setPersona({ ...persona, emoji_usage: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="none">בלי בכלל</option>
              <option value="minimal">מינימלי</option>
              <option value="moderate">בינוני</option>
              <option value="heavy">הרבה</option>
            </select>
          </div>

          {/* Greeting Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              הודעת ברכה
            </label>
            <textarea
              value={persona.greeting_message || ''}
              onChange={(e) => setPersona({ ...persona, greeting_message: e.target.value })}
              placeholder="שלום! איך אפשר לעזור?"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ביוגרפיה (מאינסטגרם)
            </label>
            <textarea
              value={persona.bio || ''}
              onChange={(e) => setPersona({ ...persona, bio: e.target.value })}
              placeholder="ביוגרפיה מאינסטגרם..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Directives */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              הנחיות (Directives)
            </label>
            <p className="text-sm text-gray-500 mb-2">
              הוראות ספציפיות לצ׳אטבוט, שורה אחת לכל הנחיה
            </p>
            <textarea
              value={persona.directives.join('\n')}
              onChange={(e) => setPersona({
                ...persona,
                directives: e.target.value.split('\n').filter(d => d.trim())
              })}
              placeholder="תמיד תציע קופון&#10;אל תדבר על מחירים&#10;תהיה חיובי ומעודד"
              rows={5}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
            />
            <div className="mt-2 text-xs text-gray-500">
              {persona.directives.length} הנחיות
            </div>
          </div>

          {/* Topics */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              נושאים (Topics)
            </label>
            <input
              type="text"
              value={persona.topics.join(', ')}
              onChange={(e) => setPersona({
                ...persona,
                topics: e.target.value.split(',').map(t => t.trim()).filter(t => t)
              })}
              placeholder="אופנה, יופי, לייפסטייל"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Interests */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              תחומי עניין (Interests)
            </label>
            <input
              type="text"
              value={persona.interests.join(', ')}
              onChange={(e) => setPersona({
                ...persona,
                interests: e.target.value.split(',').map(i => i.trim()).filter(i => i)
              })}
              placeholder="קוסמטיקה, טיולים, אוכל"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'שומר...' : 'שמור שינויים'}
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              ביטול
            </button>
          </div>
        </div>

        {/* Instagram Info (Read-only) */}
        {persona.instagram_username && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">מידע מאינסטגרם</h3>
            <p className="text-sm text-blue-800">
              משתמש: @{persona.instagram_username}
            </p>
            <p className="text-xs text-blue-600 mt-2">
              המידע מאינסטגרם מתעדכן אוטומטית. ניתן לערוך רק את ההנחיות וההגדרות למעלה.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
