'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Save, Sparkles, Instagram } from 'lucide-react';
import ScrapeProgressModal from '@/components/ScrapeProgressModal';

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

  const [persona, setPersona] = useState({
    name: '',
    tone: 'friendly',
    emoji_usage: 'moderate',
    greeting_message: 'היי! אני הבוט שלי 😊 אני כאן כדי לעזור לך עם כל השאלות על המוצרים והשת"פים שלי. במה אפשר לעזור?',
    directives: [
      'תמיד דבר בגוף ראשון כנציג שלי',
      'היה ידידותי ומועיל',
      'גלה בהתחלה שאתה הבוט שלי, אבל בצורה חמה',
      'כששואלים על דברים אישיים שלא ציינתי בביו - תענה בעדינות שזה פרטי',
      'כששואלים על מקומות/חוויות - השתמש במה שכתוב בביו והתחומי עניין'
    ] as string[],
    bio: '',
    interests: [] as string[],
  });

  const [newDirective, setNewDirective] = useState('');
  const [newInterest, setNewInterest] = useState('');

  useEffect(() => {
    loadPersona();
  }, [username]);

  const loadPersona = async () => {
    try {
      const response = await fetch(
        `/api/influencer/chatbot/persona?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load persona');
      }

      const data = await response.json();
      if (data.persona) {
        setPersona({
          name: data.persona.name || username,
          tone: data.persona.tone || 'friendly',
          emoji_usage: data.persona.emoji_usage || 'moderate',
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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(
        `/api/influencer/chatbot/persona?username=${username}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(persona),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save persona');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving persona:', err);
      setError('שגיאה בשמירת הפרסונה');
    } finally {
      setSaving(false);
    }
  };

  const addDirective = () => {
    if (newDirective.trim()) {
      setPersona({
        ...persona,
        directives: [...persona.directives, newDirective.trim()],
      });
      setNewDirective('');
    }
  };

  const removeDirective = (index: number) => {
    setPersona({
      ...persona,
      directives: persona.directives.filter((_, i) => i !== index),
    });
  };

  const addInterest = () => {
    if (newInterest.trim()) {
      setPersona({
        ...persona,
        interests: [...persona.interests, newInterest.trim()],
      });
      setNewInterest('');
    }
  };

  const removeInterest = (index: number) => {
    setPersona({
      ...persona,
      interests: persona.interests.filter((_, i) => i !== index),
    });
  };

  const syncFromInstagram = async () => {
    try {
      setSyncing(true);
      setError(null);
      setSuccess(false);
      
      // Show progress modal
      setShowProgressModal(true);

      // Start the sync in the background
      const response = await fetch(
        `/api/influencer/chatbot/persona?username=${username}`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to sync from Instagram');
      }

      // Note: Progress modal will handle the completion via polling
    } catch (err) {
      console.error('Error syncing from Instagram:', err);
      setError(err instanceof Error ? err.message : 'שגיאה בסנכרון מאינסטגרם');
      setShowProgressModal(false);
      setSyncing(false);
    }
  };

  const handleSyncComplete = async (success: boolean) => {
    setShowProgressModal(false);
    setSyncing(false);
    
    if (success) {
      // Reload persona after successful sync
      await loadPersona();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } else {
      setError('הסריקה נכשלה. נסה שוב.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה
          </button>
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-10 h-10 text-purple-400" />
            <h1 className="text-4xl font-bold text-white">הפרסונה של הצ'אטבוט שלי</h1>
          </div>
          <p className="text-gray-400">הגדר איך הבוט שלך מדבר ומתנהג - תהיה אותנטי!</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-300">
            ✓ הפרסונה נשמרה בהצלחה!
          </div>
        )}

        <div className="space-y-6">
          {/* Legal Notice */}
          <div className="bg-blue-500/10 border border-blue-500/50 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <div className="text-3xl">⚖️</div>
              <div className="flex-1 text-right">
                <h3 className="text-xl font-bold text-blue-300 mb-2">דרישה חוקית חשובה</h3>
                <p className="text-gray-300 leading-relaxed">
                  על פי החוק (כמו קליפורניה AB 2655 ואירופה AI Act), הבוט <strong>חייב לגלות</strong> שהוא בוט בהתחלת השיחה.
                  <br />
                  <strong>אבל!</strong> אפשר (ומומלץ!) לעשות את זה בצורה חמה ונעימה בשפה שלך:
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-green-400">
                    <span>✅</span>
                    <span>"היי! אני הבוט של ירדן 😊 אני כאן כדי לעזור לך..."</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-400">
                    <span>✅</span>
                    <span>"שלום! אני העוזר הדיגיטלי של ירדן, במה אפשר לעזור?"</span>
                  </div>
                  <div className="flex items-center gap-2 text-red-400">
                    <span>❌</span>
                    <span>"אני מערכת AI אוטומטית" (קר מדי)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4 text-right">מידע בסיסי</h2>
            
            <div className="space-y-4">
              {/* Tone */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                  טון דיבור
                </label>
                <select
                  value={persona.tone}
                  onChange={(e) => setPersona({ ...persona, tone: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none text-right"
                >
                  <option value="friendly">ידידותי וחם</option>
                  <option value="professional">מקצועי</option>
                  <option value="casual">סלנג וחופשי</option>
                  <option value="enthusiastic">נלהב ואנרגטי</option>
                  <option value="formal">פורמלי</option>
                </select>
              </div>

              {/* Emoji Usage */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                  שימוש באימוג'ים
                </label>
                <select
                  value={persona.emoji_usage}
                  onChange={(e) => setPersona({ ...persona, emoji_usage: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none text-right"
                >
                  <option value="none">בלי בכלל</option>
                  <option value="minimal">מינימלי</option>
                  <option value="moderate">בינוני</option>
                  <option value="heavy">הרבה 🎉</option>
                </select>
              </div>

              {/* Greeting */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                  הודעת ברוכים הבאים
                </label>
                <textarea
                  value={persona.greeting_message}
                  onChange={(e) => setPersona({ ...persona, greeting_message: e.target.value })}
                  rows={3}
                  placeholder="היי! אני הבוט של ירדן, פה לעזור לך עם כל שאלה 😊"
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none text-right"
                />
                <p className="mt-2 text-xs text-yellow-400 text-right flex items-center gap-2 justify-end">
                  <span>⚠️</span>
                  <span>זכור לציין שזה בוט (דרישה חוקית), אבל עשה את זה בצורה חמה!</span>
                </p>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                  קצת עליי (הבוט ישתמש בזה כהקשר)
                </label>
                <textarea
                  value={persona.bio}
                  onChange={(e) => setPersona({ ...persona, bio: e.target.value })}
                  rows={4}
                  placeholder="אני ירדן, בלוגרית אופנה וטיולים. גרה בתל אביב, אוהבת קפה, ספורט וברצלונה..."
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none text-right"
                />
              </div>
            </div>
          </div>

          {/* Interests */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4 text-right">תחומי עניין ותחביבים</h2>
            <p className="text-gray-400 mb-4 text-right text-sm">
              הבוט ישתמש בזה כדי להיות אותנטי יותר בתשובות
            </p>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addInterest()}
                placeholder="לדוגמה: ברצלונה, קפה, צילום"
                className="flex-1 px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none text-right"
              />
              <button
                onClick={addInterest}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors"
              >
                הוסף
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {persona.interests.map((interest, index) => (
                <div
                  key={index}
                  className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm flex items-center gap-2"
                >
                  {interest}
                  <button
                    onClick={() => removeInterest(index)}
                    className="hover:text-purple-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Directives */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4 text-right">הנחיות והתנהגות 🎯</h2>
            <p className="text-gray-400 mb-4 text-right text-sm">
              תגיד ל-AI איך להתנהג ולענות - <strong>לא סקריפטים מוכנים, רק כללים!</strong>
            </p>
            
            <div className="mb-4 space-y-2">
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-right">
                <p className="text-xs text-blue-300">
                  💡 <strong>טיפ:</strong> הבוט כבר מוגדר לגלות שהוא בוט (דרישה חוקית), אבל בצורה חמה ונעימה בשפה שלך
                </p>
              </div>
              
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-right space-y-1">
                <p className="text-xs font-semibold text-green-300">דוגמאות להנחיות טובות:</p>
                <div className="text-xs text-gray-300 space-y-1 pr-2">
                  <p>✅ "כששואלים על דברים אישיים שלא ציינתי - תענה בעדינות שזה פרטי"</p>
                  <p>✅ "כששואלים על מקומות - השתמש במה שכתוב בביו ובתחומי העניין"</p>
                  <p>✅ "תמיד הצע מוצרים או שת\"פים רלוונטיים כשמתאים"</p>
                  <p>✅ "אם לא יודע משהו - תגיד שתעביר את השאלה אליי"</p>
                  <p>❌ לא: "כששואלים על בן זוג תגיד X" (זה סקריפט מוכן!)</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newDirective}
                onChange={(e) => setNewDirective(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addDirective()}
                placeholder='לדוגמה: "כששואלים על נושאים אישיים - תענה בעדינות שזה פרטי"'
                className="flex-1 px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none text-right"
              />
              <button
                onClick={addDirective}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors"
              >
                הוסף
              </button>
            </div>

            <div className="space-y-2">
              {persona.directives.map((directive, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg"
                >
                  <span className="text-white text-right flex-1">{directive}</span>
                  <button
                    onClick={() => removeDirective(index)}
                    className="text-red-400 hover:text-red-300 px-2"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            {/* Sync from Instagram */}
            <button
              onClick={syncFromInstagram}
              disabled={syncing || saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  סורק אינסטגרם עם Gemini Pro...
                </>
              ) : (
                <>
                  <Instagram className="w-5 h-5" />
                  🤖 סנכרן מאינסטגרם (AI)
                </>
              )}
            </button>

            {/* Save Changes */}
            <button
              onClick={handleSave}
              disabled={saving || syncing}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  שומר...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  שמור שינויים
                </>
              )}
            </button>
          </div>

          {/* Info about sync */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-right">
            <p className="text-sm text-blue-300">
              💡 <strong>מה קורה בסנכרון מאינסטגרם?</strong>
            </p>
            <ol className="text-xs text-gray-300 space-y-1 mt-2 pr-4">
              <li>1️⃣ סורקים 50 פוסטים אחרונים מהאינסטגרם שלך (Apify)</li>
              <li>2️⃣ מנתחים את התוכן, הטון, תחומי עניין, hashtags</li>
              <li>3️⃣ <strong>Gemini 3 Pro</strong> בונה פרסונה מעמיקה מכל התוכן</li>
              <li>4️⃣ הפרסונה נשמרת אוטומטית ומוכנה לשימוש!</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Progress Modal */}
      <ScrapeProgressModal
        username={username}
        isOpen={showProgressModal}
        onComplete={handleSyncComplete}
      />
    </div>
  );
}
