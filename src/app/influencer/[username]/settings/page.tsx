'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Settings,
  ArrowLeft,
  Palette,
  MessageCircle,
  Save,
  Eye,
  RefreshCw,
  Loader2,
  Check,
  Sparkles,
  Type,
  Sun,
  Moon,
  Database,
  Image,
  Video,
  Film,
  Layers,
  Hash,
  MessageSquare,
} from 'lucide-react';
import {
  getInfluencerByUsername,
  updateInfluencer,
  getProductsByInfluencer,
  getContentByInfluencer,
} from '@/lib/supabase';
import type { Influencer, InfluencerTheme, Product, ContentItem, ScrapeSettings, PostType } from '@/types';
import { DEFAULT_SCRAPE_SETTINGS } from '@/types';

const fontOptions = [
  { value: 'Assistant', label: 'Assistant' },
  { value: 'Heebo', label: 'Heebo' },
  { value: 'Rubik', label: 'Rubik' },
  { value: 'Open Sans Hebrew', label: 'Open Sans Hebrew' },
  { value: 'Alef', label: 'Alef' },
  { value: 'Secular One', label: 'Secular One' },
];

const colorPresets = [
  { name: 'סגול', primary: '#7c3aed', accent: '#a855f7', background: '#0f0a1a', text: '#ffffff' },
  { name: 'כחול', primary: '#3b82f6', accent: '#60a5fa', background: '#0a1628', text: '#ffffff' },
  { name: 'ירוק', primary: '#10b981', accent: '#34d399', background: '#0a1a14', text: '#ffffff' },
  { name: 'ורוד', primary: '#ec4899', accent: '#f472b6', background: '#1a0a14', text: '#ffffff' },
  { name: 'כתום', primary: '#f97316', accent: '#fb923c', background: '#1a120a', text: '#ffffff' },
  { name: 'בהיר', primary: '#6366f1', accent: '#818cf8', background: '#f8fafc', text: '#1e293b' },
];

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

  // Form state
  const [theme, setTheme] = useState<InfluencerTheme>({
    primaryColor: '#7c3aed',
    accentColor: '#a855f7',
    backgroundColor: '#0f0a1a',
    textColor: '#ffffff',
    fontFamily: 'Assistant',
  });
  const [greetingMessage, setGreetingMessage] = useState('');
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [hideBranding, setHideBranding] = useState(false);
  const [customLogoUrl, setCustomLogoUrl] = useState('');
  
  // Scrape settings state
  const [scrapeSettings, setScrapeSettings] = useState<ScrapeSettings>(DEFAULT_SCRAPE_SETTINGS);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Check authentication
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();

        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        // Load influencer data
        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);
        if (inf.theme) setTheme(inf.theme);
        if (inf.greeting_message) setGreetingMessage(inf.greeting_message);
        if (inf.suggested_questions) setSuggestedQuestions(inf.suggested_questions);
        if (inf.hide_branding) setHideBranding(inf.hide_branding);
        if (inf.custom_logo_url) setCustomLogoUrl(inf.custom_logo_url);
        if (inf.scrape_settings) setScrapeSettings(inf.scrape_settings);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  const handleSave = async () => {
    if (!influencer) return;

    setSaving(true);
    try {
      await updateInfluencer(influencer.id, {
        theme,
        greeting_message: greetingMessage,
        suggested_questions: suggestedQuestions,
        hide_branding: hideBranding,
        custom_logo_url: customLogoUrl || null,
        scrape_settings: scrapeSettings,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateAI = async () => {
    if (!influencer) return;

    setRegenerating(true);
    try {
      const response = await fetch('/api/influencer/regenerate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (response.ok) {
        const data = await response.json();
        setGreetingMessage(data.greeting);
        setSuggestedQuestions(data.questions);
      }
    } catch (error) {
      console.error('Error regenerating:', error);
    } finally {
      setRegenerating(false);
    }
  };

  const applyPreset = (preset: typeof colorPresets[0]) => {
    setTheme({
      ...theme,
      primaryColor: preset.primary,
      accentColor: preset.accent,
      backgroundColor: preset.background,
      textColor: preset.text,
    });
  };

  const addQuestion = () => {
    if (suggestedQuestions.length < 6) {
      setSuggestedQuestions([...suggestedQuestions, '']);
    }
  };

  const removeQuestion = (index: number) => {
    setSuggestedQuestions(suggestedQuestions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, value: string) => {
    const updated = [...suggestedQuestions];
    updated[index] = value;
    setSuggestedQuestions(updated);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" dir="rtl">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-slate-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/influencer/${username}/dashboard`}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">חזרה</span>
              </Link>
              <div className="h-6 w-px bg-gray-700" />
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Settings className="w-6 h-6 text-gray-400" />
                הגדרות
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  showPreview
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <Eye className="w-4 h-4" />
                תצוגה מקדימה
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  saved
                    ? 'bg-green-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saved ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saved ? 'נשמר!' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className={`grid ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-8`}>
          {/* Settings Panel */}
          <div className="space-y-8">
            {/* Theme Settings */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
            >
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-400" />
                עיצוב וצבעים
              </h2>

              {/* Color Presets */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-3">ערכות צבעים מוכנות</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset)}
                      className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-700 hover:border-indigo-500 transition-all"
                    >
                      <div
                        className="w-8 h-8 rounded-full"
                        style={{
                          background: `linear-gradient(135deg, ${preset.primary}, ${preset.accent})`,
                        }}
                      />
                      <span className="text-xs text-gray-400 group-hover:text-white transition-colors">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Colors */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">צבע ראשי</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.primaryColor}
                      onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={theme.primaryColor}
                      onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">צבע משני</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.accentColor}
                      onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={theme.accentColor}
                      onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">צבע רקע</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.backgroundColor}
                      onChange={(e) => setTheme({ ...theme, backgroundColor: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={theme.backgroundColor}
                      onChange={(e) => setTheme({ ...theme, backgroundColor: e.target.value })}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">צבע טקסט</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.textColor}
                      onChange={(e) => setTheme({ ...theme, textColor: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={theme.textColor}
                      onChange={(e) => setTheme({ ...theme, textColor: e.target.value })}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Font */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  גופן
                </label>
                <select
                  value={theme.fontFamily}
                  onChange={(e) => setTheme({ ...theme, fontFamily: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {fontOptions.map((font) => (
                    <option key={font.value} value={font.value}>{font.label}</option>
                  ))}
                </select>
              </div>
            </motion.div>

            {/* Greeting & Questions */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-blue-400" />
                  הודעת פתיחה ושאלות מוצעות
                </h2>
                <button
                  onClick={handleRegenerateAI}
                  disabled={regenerating}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm rounded-lg transition-all"
                >
                  {regenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  יצירה מחדש ב-AI
                </button>
              </div>

              {/* Greeting Message */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">הודעת פתיחה</label>
                <textarea
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="היי! אני העוזר שלך..."
                />
              </div>

              {/* Suggested Questions */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">שאלות מוצעות</label>
                <div className="space-y-2">
                  {suggestedQuestions.map((question, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => updateQuestion(index, e.target.value)}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder={`שאלה ${index + 1}`}
                      />
                      <button
                        onClick={() => removeQuestion(index)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                {suggestedQuestions.length < 6 && (
                  <button
                    onClick={addQuestion}
                    className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    + הוסף שאלה
                  </button>
                )}
              </div>
            </motion.div>

            {/* Scrape Settings */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
            >
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Database className="w-5 h-5 text-green-400" />
                הגדרות סריקת אינסטגרם
              </h2>

              <div className="space-y-6">
                {/* Posts Limit Slider */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-3">
                    כמות פוסטים לסריקה: <span className="text-white font-bold">{scrapeSettings.posts_limit}</span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="10"
                    value={scrapeSettings.posts_limit}
                    onChange={(e) => setScrapeSettings({ ...scrapeSettings, posts_limit: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>10</span>
                    <span>50</span>
                    <span>100</span>
                  </div>
                </div>

                {/* Content Types */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-3">סוגי תוכן לסריקה</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { type: 'image' as PostType, label: 'תמונות', icon: Image },
                      { type: 'video' as PostType, label: 'סרטונים', icon: Video },
                      { type: 'reel' as PostType, label: 'Reels', icon: Film },
                      { type: 'carousel' as PostType, label: 'קרוסלות', icon: Layers },
                    ].map(({ type, label, icon: Icon }) => {
                      const isSelected = scrapeSettings.content_types.includes(type);
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            if (isSelected) {
                              // Don't allow removing last type
                              if (scrapeSettings.content_types.length > 1) {
                                setScrapeSettings({
                                  ...scrapeSettings,
                                  content_types: scrapeSettings.content_types.filter(t => t !== type),
                                });
                              }
                            } else {
                              setScrapeSettings({
                                ...scrapeSettings,
                                content_types: [...scrapeSettings.content_types, type],
                              });
                            }
                          }}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-green-600/20 border-green-500/50 text-white'
                              : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${isSelected ? 'text-green-400' : ''}`} />
                          <span className="text-sm font-medium">{label}</span>
                          {isSelected && <Check className="w-4 h-4 mr-auto text-green-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Additional Options */}
                <div className="space-y-3">
                  {/* Include Hashtags */}
                  <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Hash className="w-5 h-5 text-blue-400" />
                      <div>
                        <h4 className="font-medium text-white">חילוץ האשטגים</h4>
                        <p className="text-xs text-gray-400">שמירת האשטגים מהפוסטים</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setScrapeSettings({ ...scrapeSettings, include_hashtags: !scrapeSettings.include_hashtags })}
                      className={`w-12 h-7 rounded-full relative transition-colors ${
                        scrapeSettings.include_hashtags ? 'bg-green-600' : 'bg-gray-600'
                      }`}
                    >
                      <div
                        className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${
                          scrapeSettings.include_hashtags ? 'left-1' : 'right-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Include Comments */}
                  <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5 text-purple-400" />
                      <div>
                        <h4 className="font-medium text-white">שליפת תגובות</h4>
                        <p className="text-xs text-gray-400">יאט את הסריקה אך יספק יותר מידע</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setScrapeSettings({ ...scrapeSettings, include_comments: !scrapeSettings.include_comments })}
                      className={`w-12 h-7 rounded-full relative transition-colors ${
                        scrapeSettings.include_comments ? 'bg-purple-600' : 'bg-gray-600'
                      }`}
                    >
                      <div
                        className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${
                          scrapeSettings.include_comments ? 'left-1' : 'right-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-blue-600/10 border border-blue-500/30 rounded-xl">
                  <p className="text-sm text-blue-300">
                    <strong>שימו לב:</strong> Highlights ו-Stories לא נתמכים על ידי הסריקה (דורשים התחברות לאינסטגרם).
                  </p>
                </div>
              </div>
            </motion.div>

            {/* White Label Settings */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
            >
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                White Label (מיתוג עצמי)
              </h2>

              <div className="space-y-4">
                {/* Hide Branding Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-xl">
                  <div>
                    <h4 className="font-medium text-white">הסתר מיתוג המערכת</h4>
                    <p className="text-sm text-gray-400">הסתר את הלוגו והקרדיט של InfluencerBot</p>
                  </div>
                  <button
                    onClick={() => setHideBranding(!hideBranding)}
                    className={`w-12 h-7 rounded-full relative transition-colors ${
                      hideBranding ? 'bg-indigo-600' : 'bg-gray-600'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${
                        hideBranding ? 'left-1' : 'right-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Custom Logo URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">לוגו מותאם (URL)</label>
                  <input
                    type="url"
                    value={customLogoUrl}
                    onChange={(e) => setCustomLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    השאירו ריק להצגת תמונת הפרופיל שלכם
                  </p>
                </div>

                {hideBranding && (
                  <div className="p-4 bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/30 rounded-xl">
                    <p className="text-sm text-yellow-400">
                      💡 אפשרות זו זמינה בחבילות Premium. צרו קשר לשדרוג.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Preview Panel */}
          {showPreview && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="lg:sticky lg:top-24 h-fit"
            >
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-400">תצוגה מקדימה</span>
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                </div>

                {/* Chat Preview */}
                <div
                  className="p-6 min-h-[400px]"
                  style={{
                    backgroundColor: theme.backgroundColor,
                    fontFamily: theme.fontFamily,
                  }}
                >
                  {/* Avatar */}
                  <div className="flex flex-col items-center mb-6">
                    <div
                      className="w-16 h-16 rounded-full mb-3 flex items-center justify-center text-2xl font-bold"
                      style={{
                        background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor})`,
                        color: theme.textColor,
                      }}
                    >
                      {influencer.display_name.charAt(0)}
                    </div>
                    <h3 className="font-semibold" style={{ color: theme.textColor }}>
                      {influencer.display_name}
                    </h3>
                  </div>

                  {/* Greeting */}
                  <div
                    className="rounded-2xl rounded-tr-sm p-4 mb-4 max-w-[85%] mr-auto"
                    style={{
                      backgroundColor: `${theme.primaryColor}20`,
                      borderColor: `${theme.primaryColor}50`,
                      borderWidth: '1px',
                    }}
                  >
                    <p className="text-sm" style={{ color: theme.textColor }}>
                      {greetingMessage || 'היי! איך אוכל לעזור?'}
                    </p>
                  </div>

                  {/* Suggested Questions */}
                  <div className="flex flex-wrap gap-2">
                    {suggestedQuestions.slice(0, 4).map((q, i) => (
                      <button
                        key={i}
                        className="px-3 py-2 text-xs rounded-lg border"
                        style={{
                          borderColor: `${theme.primaryColor}50`,
                          color: theme.textColor,
                        }}
                      >
                        {q || `שאלה ${i + 1}`}
                      </button>
                    ))}
                  </div>

                  {/* Input */}
                  <div
                    className="mt-6 rounded-full px-4 py-3 flex items-center"
                    style={{
                      backgroundColor: `${theme.textColor}10`,
                      borderColor: `${theme.primaryColor}30`,
                      borderWidth: '1px',
                    }}
                  >
                    <span className="text-sm opacity-50" style={{ color: theme.textColor }}>
                      הקלד הודעה...
                    </span>
                    <div
                      className="mr-auto w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: theme.primaryColor }}
                    >
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={theme.textColor}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

