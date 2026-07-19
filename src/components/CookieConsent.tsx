'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X, Check, Settings, Shield } from 'lucide-react';
import Link from 'next/link';

import { type CookiePreferences, readConsent, writeConsent } from '@/lib/consent';

type ConsentLevel = 'necessary' | 'analytics' | 'all';
type Lang = 'he' | 'en';

// The banner renders in the global root layout (always <html lang="he">), so it
// can't read the html lang. On an English account's /chat/<username> page it must
// still show English — so we fetch the account language from the public endpoint
// and localize. Default stays Hebrew for every other surface.
const STRINGS: Record<Lang, Record<string, string>> = {
  he: {
    title: 'אנחנו משתמשים בקוקיז 🍪',
    desc: 'אנחנו משתמשים בקוקיז כדי לשפר את חוויית השימוש שלך, לנתח את השימוש באתר ולהציג תוכן מותאם אישית. למידע נוסף, ראו את',
    privacy: 'מדיניות הפרטיות',
    acceptAll: 'אישור הכל',
    necessaryOnly: 'הכרחיים בלבד',
    settings: 'הגדרות',
    settingsTitle: 'הגדרות קוקיז',
    necessaryTitle: 'קוקיז הכרחיים',
    necessaryDesc: 'נדרשים לפעולה תקינה של האתר',
    analyticsTitle: 'קוקיז אנליטיקה',
    analyticsDesc: 'מסייעים לנו להבין כיצד משתמשים באתר',
    marketingTitle: 'קוקיז שיווקיים',
    marketingDesc: 'משמשים להצגת פרסומות מותאמות אישית',
    savePrefs: 'שמור העדפות',
  },
  en: {
    title: 'We use cookies 🍪',
    desc: 'We use cookies to improve your experience, analyze site usage, and show personalized content. For more, see our',
    privacy: 'Privacy Policy',
    acceptAll: 'Accept all',
    necessaryOnly: 'Necessary only',
    settings: 'Settings',
    settingsTitle: 'Cookie settings',
    necessaryTitle: 'Necessary cookies',
    necessaryDesc: 'Required for the site to function properly',
    analyticsTitle: 'Analytics cookies',
    analyticsDesc: 'Help us understand how the site is used',
    marketingTitle: 'Marketing cookies',
    marketingDesc: 'Used to show personalized ads',
    savePrefs: 'Save preferences',
  },
};

export default function CookieConsent() {
  const [show, setShow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [lang, setLang] = useState<Lang>('he');
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true, // Always required
    analytics: false,
    marketing: false,
  });
  const t = STRINGS[lang];
  const dir = lang === 'en' ? 'ltr' : 'rtl';

  useEffect(() => {
    // Check if consent was already given
    if (!readConsent()) {
      // Small delay to avoid flash
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    // On an account chat page (/chat/<username>), localize to the account language.
    const m = typeof window !== 'undefined' && window.location.pathname.match(/^\/chat\/([^/?#]+)/);
    if (!m) return;
    fetch(`/api/account/language?username=${encodeURIComponent(m[1])}`)
      .then((r) => r.json())
      .then((d) => { if (d?.language === 'en') setLang('en'); })
      .catch(() => {});
  }, []);

  const saveConsent = (level: ConsentLevel) => {
    let prefs: CookiePreferences;

    switch (level) {
      case 'necessary':
        prefs = { necessary: true, analytics: false, marketing: false };
        break;
      case 'analytics':
        prefs = { necessary: true, analytics: true, marketing: false };
        break;
      case 'all':
        prefs = { necessary: true, analytics: true, marketing: true };
        break;
      default:
        prefs = preferences;
    }

    // writeConsent notifies AnalyticsLoader, which mounts or withholds the
    // trackers accordingly. Previously this only wrote to storage.
    writeConsent(prefs);
    setShow(false);
  };

  const saveCustomPreferences = () => {
    writeConsent(preferences);
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4"
          dir={dir}
        >
          <div className="max-w-4xl mx-auto bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
            <AnimatePresence mode="wait">
              {!showSettings ? (
                <motion.div
                  key="main"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                      <Cookie className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {t.title}
                      </h3>
                      <p className="text-sm text-gray-400 mb-4">
                        {t.desc}{' '}
                        <Link href="/privacy" className="text-indigo-400 hover:underline">
                          {t.privacy}
                        </Link>
                        .
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => saveConsent('all')}
                          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          {t.acceptAll}
                        </button>
                        <button
                          onClick={() => saveConsent('necessary')}
                          className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                        >
                          <Shield className="w-4 h-4" />
                          {t.necessaryOnly}
                        </button>
                        <button
                          onClick={() => setShowSettings(true)}
                          className="flex items-center gap-2 px-5 py-2.5 text-gray-400 hover:text-white transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                          {t.settings}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setShow(false)}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-6"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-white">{t.settingsTitle}</h3>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-4 mb-6">
                    {/* Necessary Cookies */}
                    <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl">
                      <div>
                        <h4 className="font-medium text-white">{t.necessaryTitle}</h4>
                        <p className="text-sm text-gray-400">{t.necessaryDesc}</p>
                      </div>
                      <div className="w-12 h-7 bg-indigo-600 rounded-full relative cursor-not-allowed">
                        <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full" />
                      </div>
                    </div>

                    {/* Analytics Cookies */}
                    <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl">
                      <div>
                        <h4 className="font-medium text-white">{t.analyticsTitle}</h4>
                        <p className="text-sm text-gray-400">{t.analyticsDesc}</p>
                      </div>
                      <button
                        onClick={() => setPreferences({ ...preferences, analytics: !preferences.analytics })}
                        className={`w-12 h-7 rounded-full relative transition-colors ${
                          preferences.analytics ? 'bg-indigo-600' : 'bg-gray-600'
                        }`}
                      >
                        <div
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${
                            preferences.analytics ? 'left-1' : 'right-1'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Marketing Cookies */}
                    <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl">
                      <div>
                        <h4 className="font-medium text-white">{t.marketingTitle}</h4>
                        <p className="text-sm text-gray-400">{t.marketingDesc}</p>
                      </div>
                      <button
                        onClick={() => setPreferences({ ...preferences, marketing: !preferences.marketing })}
                        className={`w-12 h-7 rounded-full relative transition-colors ${
                          preferences.marketing ? 'bg-indigo-600' : 'bg-gray-600'
                        }`}
                      >
                        <div
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${
                            preferences.marketing ? 'left-1' : 'right-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={saveCustomPreferences}
                      className="flex-1 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
                    >
                      {t.savePrefs}
                    </button>
                    <button
                      onClick={() => saveConsent('all')}
                      className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                    >
                      {t.acceptAll}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}








