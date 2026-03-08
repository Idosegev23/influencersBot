'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  Phone,
  Bell,
  User,
  Smile,
  Heart,
  Zap,
  Coffee,
  Star,
  Globe,
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
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<{ products: number; content: number } | null>(null);

  // Form state
  const [theme, setTheme] = useState<InfluencerTheme>({
    colors: {
      primary: '#7c3aed',
      accent: '#a855f7',
      background: '#0f0a1a',
      text: '#ffffff',
      surface: '#1a1a2e',
      border: '#2a2a4a',
    },
    fonts: {
      heading: 'Assistant',
      body: 'Assistant',
    },
    style: 'minimal',
    darkMode: true,
  });
  const [greetingMessage, setGreetingMessage] = useState('');
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [hideBranding, setHideBranding] = useState(false);
  const [customLogoUrl, setCustomLogoUrl] = useState('');

  // Phone & WhatsApp state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);

  // Scrape settings state
  const [scrapeSettings, setScrapeSettings] = useState<ScrapeSettings>(DEFAULT_SCRAPE_SETTINGS);

  // Persona settings state
  const [personaTone, setPersonaTone] = useState('');
  const [personaStyle, setPersonaStyle] = useState('');
  const [personaInterests, setPersonaInterests] = useState<string[]>([]);
  const [personaPhrases, setPersonaPhrases] = useState<string[]>([]);
  const [personaEmojiStyle, setPersonaEmojiStyle] = useState<'none' | 'minimal' | 'frequent'>('minimal');
  const [personaLanguage, setPersonaLanguage] = useState<'he' | 'en' | 'mixed'>('he');

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
        if (inf.phone_number) setPhoneNumber(inf.phone_number);
        if (inf.whatsapp_enabled) setWhatsappEnabled(inf.whatsapp_enabled);
        // Load persona settings
        if (inf.persona) {
          setPersonaTone(inf.persona.tone || '');
          setPersonaStyle(inf.persona.style || '');
          setPersonaInterests(inf.persona.interests || []);
          setPersonaPhrases(inf.persona.signature_phrases || []);
          setPersonaEmojiStyle(inf.persona.emoji_style || 'minimal');
          setPersonaLanguage(inf.persona.language || 'he');
        }
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
      // Build persona object
      const updatedPersona = {
        tone: personaTone,
        style: personaStyle,
        interests: personaInterests,
        signature_phrases: personaPhrases,
        emoji_style: personaEmojiStyle,
        language: personaLanguage,
      };

      await updateInfluencer(influencer.id, {
        theme,
        greeting_message: greetingMessage,
        suggested_questions: suggestedQuestions,
        hide_branding: hideBranding,
        custom_logo_url: customLogoUrl || null,
        scrape_settings: scrapeSettings,
        phone_number: phoneNumber || null,
        whatsapp_enabled: whatsappEnabled,
        persona: updatedPersona,
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

  const handleRescan = async () => {
    if (!influencer) return;

    setRescanning(true);
    setRescanResult(null);
    try {
      const response = await fetch('/api/influencer/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (response.ok) {
        const data = await response.json();
        setRescanResult({
          products: data.stats.products,
          content: data.stats.content,
        });
        // Reload influencer data
        const inf = await getInfluencerByUsername(username);
        if (inf) setInfluencer(inf);
      }
    } catch (error) {
      console.error('Error rescanning:', error);
    } finally {
      setRescanning(false);
    }
  };

  const applyPreset = (preset: typeof colorPresets[0]) => {
    setTheme({
      ...theme,
      colors: {
        ...theme.colors,
        primary: preset.primary,
        accent: preset.accent,
        background: preset.background,
        text: preset.text,
      },
      darkMode: preset.background.startsWith('#0') || preset.background.startsWith('#1'),
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
      <div className="min-h-screen flex items-center justify-center" dir="rtl" style={{ background: 'var(--dash-bg)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Top Actions */}
        <div className="flex items-center justify-end gap-2 mb-8">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: showPreview ? 'var(--color-primary)' : 'var(--dash-surface)',
              color: showPreview ? 'white' : 'var(--dash-text-2)',
            }}
          >
            <Eye className="w-4 h-4" />
            תצוגה מקדימה
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: saved ? 'var(--dash-positive)' : 'var(--color-primary)',
              color: 'white',
            }}
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

        <div className={`grid ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-8`}>
          {/* Settings Panel */}
          <div className="space-y-8">
            {/* Theme Settings */}
            <div
              className="rounded-xl border p-6"
              style={{ borderColor: 'var(--dash-border)' }}
            >
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
                <Palette className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                עיצוב וצבעים
              </h2>

              {/* Color Presets */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-3" style={{ color: 'var(--dash-text-2)' }}>ערכות צבעים מוכנות</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset)}
                      className="group flex flex-col items-center gap-2 p-3 rounded-xl border transition-all"
                      style={{ borderColor: 'var(--dash-border)' }}
                    >
                      <div
                        className="w-8 h-8 rounded-full"
                        style={{
                          background: `linear-gradient(135deg, ${preset.primary}, ${preset.accent})`,
                        }}
                      />
                      <span className="text-xs transition-colors" style={{ color: 'var(--dash-text-2)' }}>
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Colors */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>צבע ראשי</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.colors.primary}
                      onChange={(e) => setTheme({ ...theme, colors: { ...theme.colors, primary: e.target.value } })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={theme.colors.primary}
                      onChange={(e) => setTheme({ ...theme, colors: { ...theme.colors, primary: e.target.value } })}
                      className="flex-1 rounded-lg px-3 py-2 text-sm"
                      style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>צבע משני</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.colors.accent}
                      onChange={(e) => setTheme({ ...theme, colors: { ...theme.colors, accent: e.target.value } })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={theme.colors.accent}
                      onChange={(e) => setTheme({ ...theme, colors: { ...theme.colors, accent: e.target.value } })}
                      className="flex-1 rounded-lg px-3 py-2 text-sm"
                      style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>צבע רקע</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.colors.background}
                      onChange={(e) => setTheme({ ...theme, colors: { ...theme.colors, background: e.target.value } })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={theme.colors.background}
                      onChange={(e) => setTheme({ ...theme, colors: { ...theme.colors, background: e.target.value } })}
                      className="flex-1 rounded-lg px-3 py-2 text-sm"
                      style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>צבע טקסט</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.colors.text}
                      onChange={(e) => setTheme({ ...theme, colors: { ...theme.colors, text: e.target.value } })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={theme.colors.text}
                      onChange={(e) => setTheme({ ...theme, colors: { ...theme.colors, text: e.target.value } })}
                      className="flex-1 rounded-lg px-3 py-2 text-sm"
                      style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                    />
                  </div>
                </div>
              </div>

              {/* Font */}
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--dash-text-2)' }}>
                  <Type className="w-4 h-4" />
                  גופן
                </label>
                <select
                  value={theme.fonts.heading}
                  onChange={(e) => setTheme({ ...theme, fonts: { heading: e.target.value, body: e.target.value } })}
                  className="w-full rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                >
                  {fontOptions.map((font) => (
                    <option key={font.value} value={font.value}>{font.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Greeting & Questions */}
            <div
              className="rounded-xl border p-6"
              style={{ borderColor: 'var(--dash-border)' }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
                  <MessageCircle className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
                  הודעת פתיחה ושאלות מוצעות
                </h2>
                <button
                  onClick={handleRegenerateAI}
                  disabled={regenerating}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all"
                  style={{ background: 'var(--color-primary)', color: 'white' }}
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
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>הודעת פתיחה</label>
                <textarea
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                  placeholder="היי! אני העוזר שלך..."
                />
              </div>

              {/* Suggested Questions */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>שאלות מוצעות</label>
                <div className="space-y-2">
                  {suggestedQuestions.map((question, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => updateQuestion(index, e.target.value)}
                        className="flex-1 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
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
                    className="mt-3 text-sm transition-colors"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    + הוסף שאלה
                  </button>
                )}
              </div>
            </div>

            {/* Persona Settings */}
            <div
              className="rounded-xl border p-6"
              style={{ borderColor: 'var(--dash-border)' }}
            >
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
                <User className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                פרסונה וטון הצ&apos;אטבוט
              </h2>

              <div className="space-y-6">
                {/* Tone */}
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--dash-text-2)' }}>
                    <Heart className="w-4 h-4 text-pink-400" />
                    טון השיחה
                  </label>
                  <input
                    type="text"
                    value={personaTone}
                    onChange={(e) => setPersonaTone(e.target.value)}
                    className="w-full rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                    placeholder="לדוגמה: חם, ידידותי ומעודד"
                  />
                  <p className="mt-1 text-xs" style={{ color: 'var(--dash-text-3)' }}>תאר איך הצ&apos;אטבוט צריך לדבר - האם הוא רשמי, חברותי, הומוריסטי?</p>
                </div>

                {/* Style */}
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--dash-text-2)' }}>
                    <Zap className="w-4 h-4 text-yellow-400" />
                    סגנון תוכן
                  </label>
                  <textarea
                    value={personaStyle}
                    onChange={(e) => setPersonaStyle(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                    placeholder="לדוגמה: שיחתי, קליל, עם הרבה הדגשות ודוגמאות"
                  />
                </div>

                {/* Language */}
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--dash-text-2)' }}>
                    <Globe className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
                    שפה
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'he', label: 'עברית', icon: '🇮🇱' },
                      { value: 'en', label: 'אנגלית', icon: '🇺🇸' },
                      { value: 'mixed', label: 'מעורב', icon: '🌐' },
                    ].map((lang) => (
                      <button
                        key={lang.value}
                        type="button"
                        onClick={() => setPersonaLanguage(lang.value as 'he' | 'en' | 'mixed')}
                        className="flex items-center justify-center gap-2 p-3 rounded-xl border transition-all"
                        style={{
                          background: personaLanguage === lang.value ? 'color-mix(in srgb, var(--color-primary) 20%, transparent)' : 'var(--dash-surface)',
                          borderColor: personaLanguage === lang.value ? 'var(--color-primary)' : 'var(--dash-border)',
                          color: personaLanguage === lang.value ? 'var(--dash-text)' : 'var(--dash-text-2)',
                        }}
                      >
                        <span>{lang.icon}</span>
                        <span className="text-sm">{lang.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Emoji Style */}
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--dash-text-2)' }}>
                    <Smile className="w-4 h-4 text-yellow-400" />
                    שימוש באימוג&apos;ים
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'none', label: 'ללא', example: 'ללא אימוג\'ים' },
                      { value: 'minimal', label: 'מינימלי', example: 'מעט 👍' },
                      { value: 'frequent', label: 'הרבה', example: 'הרבה!! 🎉✨💕' },
                    ].map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        onClick={() => setPersonaEmojiStyle(style.value as 'none' | 'minimal' | 'frequent')}
                        className="flex flex-col items-center gap-1 p-3 rounded-xl border transition-all"
                        style={{
                          background: personaEmojiStyle === style.value ? 'color-mix(in srgb, var(--color-warning) 20%, transparent)' : 'var(--dash-surface)',
                          borderColor: personaEmojiStyle === style.value ? 'var(--color-warning)' : 'var(--dash-border)',
                          color: personaEmojiStyle === style.value ? 'var(--dash-text)' : 'var(--dash-text-2)',
                        }}
                      >
                        <span className="text-sm font-medium">{style.label}</span>
                        <span className="text-xs opacity-60">{style.example}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interests */}
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--dash-text-2)' }}>
                    <Star className="w-4 h-4 text-amber-400" />
                    תחומי עניין (נושאים שהצ&apos;אטבוט יודע עליהם)
                  </label>
                  <div className="space-y-2">
                    {personaInterests.map((interest, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={interest}
                          onChange={(e) => {
                            const updated = [...personaInterests];
                            updated[index] = e.target.value;
                            setPersonaInterests(updated);
                          }}
                          className="flex-1 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                          placeholder={`תחום עניין ${index + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => setPersonaInterests(personaInterests.filter((_, i) => i !== index))}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  {personaInterests.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setPersonaInterests([...personaInterests, ''])}
                      className="mt-3 text-sm transition-colors"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      + הוסף תחום עניין
                    </button>
                  )}
                </div>

                {/* Signature Phrases */}
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--dash-text-2)' }}>
                    <Coffee className="w-4 h-4 text-orange-400" />
                    ביטויים ייחודיים (משפטי חתימה)
                  </label>
                  <div className="space-y-2">
                    {personaPhrases.map((phrase, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={phrase}
                          onChange={(e) => {
                            const updated = [...personaPhrases];
                            updated[index] = e.target.value;
                            setPersonaPhrases(updated);
                          }}
                          className="flex-1 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                          placeholder={`ביטוי ${index + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => setPersonaPhrases(personaPhrases.filter((_, i) => i !== index))}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  {personaPhrases.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setPersonaPhrases([...personaPhrases, ''])}
                      className="mt-3 text-sm transition-colors"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      + הוסף ביטוי
                    </button>
                  )}
                </div>

                {/* Info box */}
                <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)' }}>
                  <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
                    <strong>💡 טיפ:</strong> הגדרות אלה משפיעות על איך הצ&apos;אטבוט מדבר עם המבקרים.
                    ככל שתתאימו יותר לסגנון האישי שלכם, ככה התגובות יהיו אותנטיות יותר.
                  </p>
                </div>
              </div>
            </div>

            {/* Scrape Settings */}
            <div
              className="rounded-xl border p-6"
              style={{ borderColor: 'var(--dash-border)' }}
            >
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
                <Database className="w-5 h-5" style={{ color: 'var(--dash-positive)' }} />
                הגדרות סריקת אינסטגרם
              </h2>

              <div className="space-y-6">
                {/* Posts Limit Slider */}
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--dash-text-2)' }}>
                    כמות פוסטים לסריקה: <span className="font-bold" style={{ color: 'var(--dash-text)' }}>{scrapeSettings.posts_limit}</span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="10"
                    value={scrapeSettings.posts_limit}
                    onChange={(e) => setScrapeSettings({ ...scrapeSettings, posts_limit: parseInt(e.target.value) })}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-green-500"
                    style={{ background: 'var(--dash-surface)' }}
                  />
                  <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>
                    <span>10</span>
                    <span>50</span>
                    <span>100</span>
                  </div>
                </div>

                {/* Content Types */}
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--dash-text-2)' }}>סוגי תוכן לסריקה</label>
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
                          className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                          style={{
                            background: isSelected ? 'color-mix(in srgb, var(--dash-positive) 20%, transparent)' : 'var(--dash-surface)',
                            borderColor: isSelected ? 'var(--dash-positive)' : 'var(--dash-border)',
                            color: isSelected ? 'var(--dash-text)' : 'var(--dash-text-2)',
                          }}
                        >
                          <Icon className="w-5 h-5" style={isSelected ? { color: 'var(--dash-positive)' } : undefined} />
                          <span className="text-sm font-medium">{label}</span>
                          {isSelected && <Check className="w-4 h-4 mr-auto" style={{ color: 'var(--dash-positive)' }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Additional Options */}
                <div className="space-y-3">
                  {/* Include Hashtags */}
                  <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--dash-surface)' }}>
                    <div className="flex items-center gap-3">
                      <Hash className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
                      <div>
                        <h4 className="font-medium" style={{ color: 'var(--dash-text)' }}>חילוץ האשטגים</h4>
                        <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>שמירת האשטגים מהפוסטים</p>
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
                  <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--dash-surface)' }}>
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                      <div>
                        <h4 className="font-medium" style={{ color: 'var(--dash-text)' }}>שליפת תגובות</h4>
                        <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>יאט את הסריקה אך יספק יותר מידע</p>
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

                <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--color-info) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-info) 30%, transparent)' }}>
                  <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
                    <strong>שימו לב:</strong> Highlights ו-Stories לא נתמכים על ידי הסריקה (דורשים התחברות לאינסטגרם).
                  </p>
                </div>

                {/* Rescan Button */}
                <div className="pt-4" style={{ borderTop: '1px solid var(--dash-border)' }}>
                  <button
                    onClick={handleRescan}
                    disabled={rescanning}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 disabled:opacity-50 text-white font-medium rounded-xl transition-all"
                    style={{ background: 'var(--dash-positive)' }}
                  >
                    {rescanning ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        סורק מחדש...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5" />
                        סרוק מחדש מאינסטגרם
                      </>
                    )}
                  </button>
                  {rescanResult && (
                    <div className="mt-3 p-3 rounded-xl" style={{ background: 'color-mix(in srgb, var(--dash-positive) 20%, transparent)', border: '1px solid color-mix(in srgb, var(--dash-positive) 30%, transparent)' }}>
                      <p className="text-sm text-center" style={{ color: 'var(--dash-positive)' }}>
                        נמצאו {rescanResult.products} מוצרים ו-{rescanResult.content} פריטי תוכן
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* WhatsApp & Phone Settings */}
            <div
              className="rounded-xl border p-6"
              style={{ borderColor: 'var(--dash-border)' }}
            >
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
                <Phone className="w-5 h-5" style={{ color: 'var(--dash-positive)' }} />
                טלפון והתראות WhatsApp
              </h2>

              <div className="space-y-6">
                {/* Phone Number */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>מספר טלפון</label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        setPhoneNumber(value);
                      }}
                      placeholder="0541234567"
                      dir="ltr"
                      className="w-full rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-left"
                      style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                    />
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--dash-text-3)' }} />
                  </div>
                  <p className="mt-2 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                    מספר לקבלת התראות על פניות תמיכה ושאלות מלקוחות
                  </p>
                </div>

                {/* WhatsApp Notifications Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--dash-surface)' }}>
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5" style={{ color: 'var(--dash-positive)' }} />
                    <div>
                      <h4 className="font-medium" style={{ color: 'var(--dash-text)' }}>התראות WhatsApp</h4>
                      <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>קבלת התראות בזמן אמת על פניות חדשות</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setWhatsappEnabled(!whatsappEnabled)}
                    disabled={!phoneNumber}
                    className={`w-12 h-7 rounded-full relative transition-colors ${
                      whatsappEnabled && phoneNumber ? 'bg-green-600' : 'bg-gray-600'
                    } ${!phoneNumber ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div
                      className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${
                        whatsappEnabled && phoneNumber ? 'left-1' : 'right-1'
                      }`}
                    />
                  </button>
                </div>

                {!phoneNumber && whatsappEnabled && (
                  <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)' }}>
                    <p className="text-sm" style={{ color: 'var(--color-warning)' }}>
                      יש להזין מספר טלפון כדי להפעיל התראות WhatsApp
                    </p>
                  </div>
                )}

                {phoneNumber && whatsappEnabled && (
                  <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--dash-positive) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--dash-positive) 30%, transparent)' }}>
                    <p className="text-sm" style={{ color: 'var(--dash-positive)' }}>
                      התראות WhatsApp פעילות - תקבלו הודעה בכל פנייה חדשה
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* White Label Settings */}
            <div
              className="rounded-xl border p-6"
              style={{ borderColor: 'var(--dash-border)' }}
            >
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
                <svg className="w-5 h-5" style={{ color: 'var(--color-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                White Label (מיתוג עצמי)
              </h2>

              <div className="space-y-4">
                {/* Hide Branding Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--dash-surface)' }}>
                  <div>
                    <h4 className="font-medium" style={{ color: 'var(--dash-text)' }}>הסתר מיתוג המערכת</h4>
                    <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>הסתר את הלוגו והקרדיט של InfluencerBot</p>
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
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>לוגו מותאם (URL)</label>
                  <input
                    type="url"
                    value={customLogoUrl}
                    onChange={(e) => setCustomLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                  />
                  <p className="mt-2 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                    השאירו ריק להצגת תמונת הפרופיל שלכם
                  </p>
                </div>

                {hideBranding && (
                  <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)' }}>
                    <p className="text-sm" style={{ color: 'var(--color-warning)' }}>
                      💡 אפשרות זו זמינה בחבילות Premium. צרו קשר לשדרוג.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          {showPreview && (
            <div className="lg:sticky lg:top-24 h-fit">
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--dash-border)' }}>
                <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--dash-border)' }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--dash-text-2)' }}>תצוגה מקדימה</span>
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
                    backgroundColor: theme.colors.background,
                    fontFamily: theme.fonts.heading,
                  }}
                >
                  {/* Avatar */}
                  <div className="flex flex-col items-center mb-6">
                    <div
                      className="w-16 h-16 rounded-full mb-3 flex items-center justify-center text-2xl font-bold"
                      style={{
                        background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})`,
                        color: theme.colors.text,
                      }}
                    >
                      {influencer.display_name.charAt(0)}
                    </div>
                    <h3 className="font-semibold" style={{ color: theme.colors.text }}>
                      {influencer.display_name}
                    </h3>
                  </div>

                  {/* Greeting */}
                  <div
                    className="rounded-2xl rounded-tr-sm p-4 mb-4 max-w-[85%] mr-auto"
                    style={{
                      backgroundColor: `${theme.colors.primary}20`,
                      borderColor: `${theme.colors.primary}50`,
                      borderWidth: '1px',
                    }}
                  >
                    <p className="text-sm" style={{ color: theme.colors.text }}>
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
                          borderColor: `${theme.colors.primary}50`,
                          color: theme.colors.text,
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
                      backgroundColor: `${theme.colors.text}10`,
                      borderColor: `${theme.colors.primary}30`,
                      borderWidth: '1px',
                    }}
                  >
                    <span className="text-sm opacity-50" style={{ color: theme.colors.text }}>
                      הקלד הודעה...
                    </span>
                    <div
                      className="mr-auto w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: theme.colors.primary }}
                    >
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={theme.colors.text}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
