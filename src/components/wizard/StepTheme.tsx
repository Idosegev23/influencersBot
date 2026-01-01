'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Palette, Type, Sun, Moon, ArrowLeft, Check } from 'lucide-react';
import type { InfluencerTheme, InfluencerType } from '@/types';
import { themePresets } from '@/lib/theme';

interface StepThemeProps {
  initialTheme: InfluencerTheme;
  influencerType: InfluencerType;
  profileName: string;
  onThemeChange: (theme: InfluencerTheme) => void;
  onContinue: () => void;
  onBack: () => void;
}

const colorPresets = [
  { name: 'אינדיגו', primary: '#6366f1', accent: '#818cf8' },
  { name: 'ורוד', primary: '#ec4899', accent: '#f472b6' },
  { name: 'כתום', primary: '#f97316', accent: '#fb923c' },
  { name: 'ירוק', primary: '#10b981', accent: '#34d399' },
  { name: 'כחול', primary: '#3b82f6', accent: '#60a5fa' },
  { name: 'סגול', primary: '#8b5cf6', accent: '#a78bfa' },
  { name: 'אדום', primary: '#ef4444', accent: '#f87171' },
  { name: 'שחור', primary: '#171717', accent: '#404040' },
];

const fontOptions = [
  { name: 'Heebo', label: 'Heebo (ברירת מחדל)' },
  { name: 'Assistant', label: 'Assistant' },
  { name: 'Rubik', label: 'Rubik' },
  { name: 'Open Sans', label: 'Open Sans' },
  { name: 'Inter', label: 'Inter' },
];

const styleOptions: { id: InfluencerTheme['style']; label: string }[] = [
  { id: 'minimal', label: 'מינימליסטי' },
  { id: 'playful', label: 'שובב' },
  { id: 'elegant', label: 'אלגנטי' },
  { id: 'bold', label: 'בולט' },
];

export function StepTheme({
  initialTheme,
  influencerType,
  profileName,
  onThemeChange,
  onContinue,
  onBack,
}: StepThemeProps) {
  const [theme, setTheme] = useState<InfluencerTheme>(initialTheme);

  const updateTheme = (updates: Partial<InfluencerTheme>) => {
    const newTheme = { ...theme, ...updates };
    setTheme(newTheme);
    onThemeChange(newTheme);
  };

  const updateColors = (colorUpdates: Partial<InfluencerTheme['colors']>) => {
    updateTheme({
      colors: { ...theme.colors, ...colorUpdates },
    });
  };

  const applyPreset = (type: InfluencerType) => {
    const preset = themePresets[type];
    setTheme(preset);
    onThemeChange(preset);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Settings Panel */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">התאמת העיצוב</h2>

          {/* Quick Presets */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Palette className="w-4 h-4" />
              ערכות נושא מוכנות
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.keys(themePresets).map((type) => (
                <button
                  key={type}
                  onClick={() => applyPreset(type as InfluencerType)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    influencerType === type
                      ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3">צבע ראשי</h3>
            <div className="grid grid-cols-4 gap-3">
              {colorPresets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => updateColors({ primary: preset.primary, accent: preset.accent })}
                  className={`relative aspect-square rounded-xl transition-transform hover:scale-105 ${
                    theme.colors.primary === preset.primary ? 'ring-2 ring-offset-2 ring-indigo-500' : ''
                  }`}
                  style={{ backgroundColor: preset.primary }}
                >
                  {theme.colors.primary === preset.primary && (
                    <Check className="w-5 h-5 text-white absolute inset-0 m-auto" />
                  )}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm text-gray-600">צבע מותאם:</label>
              <input
                type="color"
                value={theme.colors.primary}
                onChange={(e) => updateColors({ primary: e.target.value })}
                className="w-10 h-10 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Dark Mode Toggle */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                {theme.darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                מצב כהה
              </h3>
              <button
                onClick={() => updateTheme({ darkMode: !theme.darkMode })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  theme.darkMode ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
                    theme.darkMode ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Style Selection */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3">סגנון</h3>
            <div className="grid grid-cols-2 gap-2">
              {styleOptions.map((style) => (
                <button
                  key={style.id}
                  onClick={() => updateTheme({ style: style.id })}
                  className={`py-3 rounded-xl font-medium transition-all ${
                    theme.style === style.id
                      ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Selection */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Type className="w-4 h-4" />
              פונט
            </h3>
            <select
              value={theme.fonts.body}
              onChange={(e) => updateTheme({ fonts: { ...theme.fonts, body: e.target.value, heading: e.target.value } })}
              className="input"
            >
              {fontOptions.map((font) => (
                <option key={font.name} value={font.name}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="lg:sticky lg:top-4 h-fit">
          <h3 className="font-semibold text-gray-900 mb-3">תצוגה מקדימה</h3>
          <div
            className="rounded-2xl overflow-hidden border shadow-lg"
            style={{
              backgroundColor: theme.darkMode ? '#0f172a' : theme.colors.background,
              borderColor: theme.colors.border,
            }}
          >
            {/* Preview Header */}
            <div
              className="p-4 flex items-center gap-3"
              style={{
                backgroundColor: theme.darkMode ? 'rgba(30,41,59,0.8)' : 'rgba(255,255,255,0.92)',
                borderBottom: `1px solid ${theme.colors.border}`,
              }}
            >
              <div
                className="w-10 h-10 rounded-full"
                style={{ backgroundColor: theme.colors.primary }}
              />
              <div>
                <p
                  className="font-semibold text-sm"
                  style={{
                    color: theme.darkMode ? '#f8fafc' : theme.colors.text,
                    fontFamily: theme.fonts.heading,
                  }}
                >
                  העוזר של {profileName}
                </p>
                <p
                  className="text-xs"
                  style={{ color: theme.darkMode ? '#94a3b8' : '#6b7280' }}
                >
                  מוצרים, קופונים וטיפים
                </p>
              </div>
            </div>

            {/* Preview Chat */}
            <div className="p-4 space-y-3" style={{ minHeight: '300px' }}>
              <div className="flex justify-start">
                <div
                  className="px-4 py-2 rounded-2xl max-w-[80%]"
                  style={{
                    backgroundColor: theme.colors.primary,
                    color: 'white',
                    borderRadius: '20px 4px 20px 20px',
                  }}
                >
                  <p className="text-sm">יש לי שאלה על המתכון</p>
                </div>
              </div>
              <div className="flex justify-end">
                <div
                  className="px-4 py-2 rounded-2xl max-w-[80%]"
                  style={{
                    backgroundColor: theme.darkMode ? '#1e293b' : theme.colors.surface,
                    color: theme.darkMode ? '#f8fafc' : theme.colors.text,
                    borderRadius: '4px 20px 20px 20px',
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  <p className="text-sm">בטח! מה רצית לדעת?</p>
                </div>
              </div>

              {/* Preview Product Card */}
              <div
                className="p-3 rounded-xl"
                style={{
                  backgroundColor: theme.darkMode ? '#1e293b' : theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-lg"
                    style={{ backgroundColor: theme.colors.primary + '20' }}
                  />
                  <div>
                    <p
                      className="font-medium text-sm"
                      style={{ color: theme.darkMode ? '#f8fafc' : theme.colors.text }}
                    >
                      מוצר לדוגמה
                    </p>
                    <p
                      className="text-xs font-mono px-2 py-0.5 rounded inline-block mt-1"
                      style={{
                        backgroundColor: theme.colors.primary + '20',
                        color: theme.colors.primary,
                      }}
                    >
                      COUPON10
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 mt-8">
        <button onClick={onBack} className="btn-secondary flex-1">
          חזור
        </button>
        <button onClick={onContinue} className="btn-primary flex-1 flex items-center justify-center gap-2">
          המשך לפרסום
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}







