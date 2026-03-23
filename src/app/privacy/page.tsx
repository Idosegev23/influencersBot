'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import {
  Shield,
  ArrowRight,
  Trash2,
  Download,
  Loader2,
  Check,
  AlertCircle,
  Lock,
  Eye,
  Database,
  Globe,
  Clock,
  UserCheck,
  MessageSquare,
  Instagram,
  FileText,
  ChevronDown,
  Mail,
  Server,
  Cookie,
  Baby,
  Scale,
  RefreshCw,
} from 'lucide-react';

// ============================================
// Animation helpers
// ============================================

function FadeInSection({ children, delay = 0, className = '' }: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// Table of Contents sections
// ============================================

const sections = [
  { id: 'overview', label: 'סקירה כללית', icon: Eye },
  { id: 'data-collection', label: 'מידע שאנחנו אוספים', icon: Database },
  { id: 'instagram-data', label: 'נתוני Instagram ו-Meta', icon: Instagram },
  { id: 'data-usage', label: 'שימוש במידע', icon: FileText },
  { id: 'ai-processing', label: 'עיבוד בינה מלאכותית', icon: MessageSquare },
  { id: 'data-sharing', label: 'שיתוף מידע עם צדדים שלישיים', icon: Globe },
  { id: 'data-storage', label: 'אחסון ואבטחת מידע', icon: Server },
  { id: 'data-retention', label: 'תקופת שמירת מידע', icon: Clock },
  { id: 'cookies', label: 'עוגיות (Cookies)', icon: Cookie },
  { id: 'user-rights', label: 'זכויותיך', icon: UserCheck },
  { id: 'children', label: 'פרטיות קטינים', icon: Baby },
  { id: 'changes', label: 'עדכונים למדיניות', icon: RefreshCw },
  { id: 'contact', label: 'יצירת קשר', icon: Mail },
  { id: 'gdpr-actions', label: 'מימוש זכויות', icon: Shield },
];

// ============================================
// Main Page
// ============================================

export default function PrivacyPage() {
  const [email, setEmail] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tocOpen, setTocOpen] = useState(false);

  const handleDeleteRequest = async () => {
    if (!email && !sessionId) {
      setMessage({ type: 'error', text: 'יש להזין אימייל או מזהה שיחה' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/gdpr/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, sessionId }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'הבקשה התקבלה בהצלחה. נעבד אותה תוך 30 יום.' });
        setEmail('');
        setSessionId('');
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'שגיאה בעיבוד הבקשה' });
      }
    } catch {
      setMessage({ type: 'error', text: 'שגיאת תקשורת. נסו שוב.' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    if (!sessionId) {
      setMessage({ type: 'error', text: 'יש להזין מזהה שיחה לייצוא נתונים' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/gdpr/delete-data?sessionId=${sessionId}`);

      if (response.ok) {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-data-${sessionId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage({ type: 'success', text: 'הנתונים הורדו בהצלחה' });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'לא נמצאו נתונים' });
      }
    } catch {
      setMessage({ type: 'error', text: 'שגיאת תקשורת. נסו שוב.' });
    } finally {
      setLoading(false);
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTocOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-gray-300" dir="rtl">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:40px_40px]" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-20 bg-slate-950/70 backdrop-blur-2xl border-b border-white/5 sticky top-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
          >
            <ArrowRight className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline">חזרה לדף הבית</span>
            <span className="sm:hidden">חזרה</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              תנאי שימוש
            </Link>
            <span className="text-gray-700">|</span>
            <Link href="/contact" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              יצירת קשר
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-12 sm:mb-16"
        >
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-indigo-500/30 rounded-3xl blur-xl" />
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Shield className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            מדיניות פרטיות
          </h1>
          <p className="text-lg text-gray-400 mb-2">Privacy Policy</p>
          <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
            <span>עודכן לאחרונה: מרץ 2026</span>
            <span className="w-1 h-1 rounded-full bg-gray-600" />
            <span>גרסה 2.0</span>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
            {[
              { icon: Lock, label: 'הצפנת SSL/TLS' },
              { icon: Shield, label: 'תאימות GDPR' },
              { icon: Scale, label: 'Meta Platform Terms' },
              { icon: Server, label: 'אחסון מאובטח' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-400"
              >
                <Icon className="w-4 h-4 text-indigo-400" />
                {label}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Table of Contents — collapsible on mobile */}
        <FadeInSection delay={0.1} className="mb-10">
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <button
              onClick={() => setTocOpen(!tocOpen)}
              className="w-full flex items-center justify-between px-6 py-4 sm:py-5 text-white font-semibold text-lg"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                תוכן עניינים
              </span>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform sm:hidden ${tocOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className={`px-6 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-1 ${tocOpen ? '' : 'hidden sm:grid'}`}>
              {sections.map(({ id, label, icon: Icon }, i) => (
                <button
                  key={id}
                  onClick={() => scrollToSection(id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all text-right w-full"
                >
                  <span className="text-indigo-400/70 font-mono text-xs w-5">{String(i + 1).padStart(2, '0')}</span>
                  <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </FadeInSection>

        {/* Policy Content */}
        <div className="space-y-8">

          {/* 1. Overview */}
          <FadeInSection>
            <PolicyCard id="overview" number="01" title="סקירה כללית" subtitle="Overview" icon={Eye}>
              <p>
                ברוכים הבאים למדיניות הפרטיות של <strong className="text-white">bestieAI</strong> (להלן: &quot;השירות&quot;, &quot;הפלטפורמה&quot;, &quot;אנחנו&quot;).
                השירות מופעל על ידי <strong className="text-white">bestieAI</strong> ומספק פלטפורמת צ&apos;אטבוטים מבוססת בינה מלאכותית עבור משפיענים ויוצרי תוכן.
              </p>
              <p>
                מדיניות זו מתארת כיצד אנו אוספים, משתמשים, שומרים ומגנים על המידע האישי שלך בעת שימוש בפלטפורמה שלנו,
                כולל אינטראקציות באמצעות צ&apos;אטבוטים, הודעות Instagram Direct, וויג&apos;טים המוטמעים באתרים חיצוניים.
              </p>
              <p>
                אנו מחויבים לשקיפות מלאה ולעמידה בתקנות הגנת המידע הבינלאומיות, כולל <strong className="text-white">GDPR</strong> (הרגולציה הכללית להגנת מידע של האיחוד האירופי),
                חוק הגנת הפרטיות הישראלי, ו-<strong className="text-white">Meta Platform Terms</strong>.
              </p>
              <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-sm">
                <p className="text-indigo-300">
                  בשימוש בשירות, אתה מסכים לתנאי מדיניות פרטיות זו. אם אינך מסכים לתנאים כלשהם, אנא הפסק את השימוש בשירות.
                  מדיניות זו חלה על כל המשתמשים — בין אם הם משפיענים המנהלים את הפלטפורמה, עוקבים המתכתבים עם צ&apos;אטבוט, או מבקרים באתר.
                </p>
              </div>
            </PolicyCard>
          </FadeInSection>

          {/* 2. Data Collection */}
          <FadeInSection>
            <PolicyCard id="data-collection" number="02" title="מידע שאנחנו אוספים" subtitle="Information We Collect" icon={Database}>
              <h4 className="text-white font-medium mb-2">א. מידע שנמסר באופן ישיר</h4>
              <ul className="list-disc list-inside space-y-1.5 mb-6">
                <li>תוכן הודעות ושיחות עם הצ&apos;אטבוט</li>
                <li>כתובת אימייל (אם נמסרה)</li>
                <li>שם משתמש או כינוי (אם נמסר)</li>
                <li>תמונות וסרטונים שנשלחו במסגרת שיחה</li>
                <li>פרטי יצירת קשר (בעת שליחת בקשה דרך טופס יצירת קשר)</li>
                <li>פרטי חשבון Instagram (למשפיענים המחברים את חשבונם)</li>
              </ul>

              <h4 className="text-white font-medium mb-2">ב. מידע שנאסף אוטומטית</h4>
              <ul className="list-disc list-inside space-y-1.5 mb-6">
                <li>כתובת IP ומיקום גיאוגרפי משוער</li>
                <li>סוג הדפדפן, מערכת הפעלה וסוג מכשיר</li>
                <li>נתוני שימוש — עמודים שנצפו, זמן שהייה, דפוסי אינטראקציה</li>
                <li>מזהה סשן (Session ID) ייחודי לכל שיחה</li>
                <li>חותמות זמן של הודעות ופעולות</li>
              </ul>

              <h4 className="text-white font-medium mb-2">ג. מידע מצדדים שלישיים</h4>
              <ul className="list-disc list-inside space-y-1.5">
                <li>נתוני פרופיל Instagram ציבוריים (שם, תמונת פרופיל, ביוגרפיה) — עבור משפיענים שחיברו חשבון</li>
                <li>מזהה משתמש Instagram (IGSID) — עבור משתמשים המתכתבים דרך Instagram DM</li>
                <li>נתוני אנליטיקה מ-Meta Platforms — צפיות, הגעה, מעורבות</li>
              </ul>
            </PolicyCard>
          </FadeInSection>

          {/* 3. Instagram & Meta Data */}
          <FadeInSection>
            <PolicyCard id="instagram-data" number="03" title="נתוני Instagram ו-Meta" subtitle="Instagram & Meta Platform Data" icon={Instagram}>
              <div className="p-4 bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 rounded-xl mb-6">
                <p className="text-sm text-pink-300">
                  שירות זה משתמש ב-<strong>Instagram Business Login API</strong> ו-<strong>Instagram Messaging API</strong> מבית Meta Platforms, Inc.
                  השימוש בנתוני Meta כפוף ל-<a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer" className="underline hover:text-pink-200">Meta Platform Terms</a> ו-<a href="https://developers.facebook.com/devpolicy/" target="_blank" rel="noopener noreferrer" className="underline hover:text-pink-200">Developer Policies</a>.
                </p>
              </div>

              <h4 className="text-white font-medium mb-2">נתונים שאנו מקבלים מ-Meta:</h4>
              <ul className="list-disc list-inside space-y-1.5 mb-6">
                <li><strong className="text-white">הודעות Instagram Direct</strong> — תוכן הודעות שנשלחות לחשבון המשפיען, לצורך מענה אוטומטי</li>
                <li><strong className="text-white">פרופיל עסקי</strong> — שם חשבון, קטגוריה, ביוגרפיה, תמונת פרופיל</li>
                <li><strong className="text-white">תובנות (Insights)</strong> — נתוני מעורבות, צפיות, הגעה (aggregated data בלבד)</li>
                <li><strong className="text-white">תגובות</strong> — תגובות על פוסטים (למשפיענים שהפעילו תכונה זו)</li>
                <li><strong className="text-white">סטוריז</strong> — תובנות על סטוריז (aggregated data בלבד)</li>
              </ul>

              <h4 className="text-white font-medium mb-2">כיצד אנו משתמשים בנתוני Meta:</h4>
              <ul className="list-disc list-inside space-y-1.5 mb-6">
                <li>מענה אוטומטי להודעות Direct בשם המשפיען, באמצעות צ&apos;אטבוט AI</li>
                <li>הצגת אנליטיקות ותובנות למשפיען בלוח הבקרה שלו</li>
                <li>שיפור ביצועי הצ&apos;אטבוט והתאמת התוכן</li>
              </ul>

              <h4 className="text-white font-medium mb-2">מה אנחנו <u>לא</u> עושים עם נתוני Meta:</h4>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <ul className="list-disc list-inside space-y-1.5 text-red-300">
                  <li>לא מוכרים או משכירים נתוני Instagram לצדדים שלישיים</li>
                  <li>לא משתמשים בנתונים לפרסום ממוקד שאינו קשור לשירות</li>
                  <li>לא שומרים גישה לנתונים מעבר לנדרש לתפקוד השירות</li>
                  <li>לא משתפים תוכן הודעות פרטיות עם גורמים שאינם המשפיען הרלוונטי</li>
                  <li>לא מעבירים נתונים לברוקרים של מידע (data brokers)</li>
                </ul>
              </div>

              <h4 className="text-white font-medium mt-6 mb-2">מחיקת נתוני Meta:</h4>
              <p>
                בהתאם לדרישות Meta, אנו מאפשרים למשתמשים לבקש מחיקה מלאה של כל הנתונים שנאספו דרך Instagram API.
                בקשות מחיקה יטופלו תוך 30 יום. ראו סעיף <button onClick={() => scrollToSection('gdpr-actions')} className="text-indigo-400 underline hover:text-indigo-300">&quot;מימוש זכויות&quot;</button> בתחתית הדף.
              </p>
            </PolicyCard>
          </FadeInSection>

          {/* 4. Data Usage */}
          <FadeInSection>
            <PolicyCard id="data-usage" number="04" title="שימוש במידע" subtitle="How We Use Your Information" icon={FileText}>
              <p className="mb-4">אנו משתמשים במידע שנאסף למטרות הבאות בלבד:</p>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { title: 'מתן השירות', desc: 'הפעלת צ\'אטבוט, מענה להודעות, הצגת תוכן רלוונטי' },
                  { title: 'שיפור חוויית משתמש', desc: 'התאמה אישית של תגובות, למידה מדפוסי שיחה' },
                  { title: 'אנליטיקות', desc: 'מעקב אחר מדדי ביצועים, מגמות, ודוחות שימוש' },
                  { title: 'אבטחה', desc: 'זיהוי ומניעת שימוש לרעה, ספאם, והונאה' },
                  { title: 'תקשורת', desc: 'מענה לפניות, עדכונים על שינויים בשירות' },
                  { title: 'עמידה בחוק', desc: 'מילוי דרישות חוקיות ורגולטוריות' },
                ].map(({ title, desc }) => (
                  <div key={title} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                    <h5 className="text-white font-medium text-sm mb-1">{title}</h5>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-300">
                <strong>הבסיס החוקי לעיבוד:</strong> אנו מעבדים מידע על בסיס הסכמה (Consent), אינטרס לגיטימי (Legitimate Interest),
                וביצוע חוזה (Contract Performance) — בהתאם לסעיף 6 של ה-GDPR.
              </div>
            </PolicyCard>
          </FadeInSection>

          {/* 5. AI Processing */}
          <FadeInSection>
            <PolicyCard id="ai-processing" number="05" title="עיבוד בינה מלאכותית" subtitle="AI Processing & Automated Decisions" icon={MessageSquare}>
              <p className="mb-4">
                השירות שלנו משתמש במודלים של בינה מלאכותית (AI) לעיבוד ויצירת תגובות. חשוב שתדע:
              </p>

              <ul className="list-disc list-inside space-y-2 mb-6">
                <li>
                  <strong className="text-white">הודעות מעובדות על ידי מודלי AI</strong> — תוכן השיחות מועבר למודלי שפה (LLM)
                  מבית OpenAI ו/או Google לצורך יצירת תגובה. המידע מעובד בצורה זמנית ולא נשמר על ידי ספקי ה-AI.
                </li>
                <li>
                  <strong className="text-white">ניתוח תוכן חזותי</strong> — תמונות וסרטונים שנשלחים בשיחה מנותחים באמצעות מודלי Vision של Google Gemini
                  לצורך הבנת התוכן בלבד. קבצי מדיה נמחקים מיד לאחר הניתוח.
                </li>
                <li>
                  <strong className="text-white">לא מתקבלות החלטות אוטומטיות משמעותיות</strong> — ה-AI משמש להמלצות ושיחה בלבד, ולא לקבלת החלטות
                  שמשפיעות באופן מהותי על זכויותיך.
                </li>
                <li>
                  <strong className="text-white">שיפור מודלים</strong> — איננו משתמשים בתוכן השיחות שלך לאימון או שיפור מודלי AI.
                  אנו משתמשים ב-API בלבד עם הגדרות &quot;no training&quot;.
                </li>
              </ul>

              <h4 className="text-white font-medium mb-2">ספקי AI שאנו עובדים איתם:</h4>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { name: 'OpenAI', use: 'צ\'אטבוט ראשי', link: 'https://openai.com/policies/privacy-policy' },
                  { name: 'Google Gemini', use: 'ניתוח תמונות וסרטונים', link: 'https://ai.google.dev/gemini-api/terms' },
                  { name: 'Anthropic Claude', use: 'ניתוח מסמכים (גיבוי)', link: 'https://www.anthropic.com/privacy' },
                ].map(({ name, use, link }) => (
                  <a key={name} href={link} target="_blank" rel="noopener noreferrer"
                    className="p-3 bg-white/[0.03] border border-white/5 rounded-xl hover:border-indigo-500/30 transition-colors block">
                    <h5 className="text-white font-medium text-sm">{name}</h5>
                    <p className="text-xs text-gray-500 mt-1">{use}</p>
                  </a>
                ))}
              </div>
            </PolicyCard>
          </FadeInSection>

          {/* 6. Data Sharing */}
          <FadeInSection>
            <PolicyCard id="data-sharing" number="06" title="שיתוף מידע עם צדדים שלישיים" subtitle="Third-Party Data Sharing" icon={Globe}>
              <p className="mb-4">
                אנו <strong className="text-white">לא מוכרים</strong> את המידע האישי שלך. אנו משתפים מידע רק במקרים הבאים:
              </p>

              <div className="space-y-4">
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                  <h5 className="text-white font-medium mb-1">ספקי שירות (Service Providers)</h5>
                  <p className="text-sm">
                    אנו עובדים עם ספקים הנחוצים להפעלת השירות: Supabase (בסיס נתונים), Vercel (אחסון אתר),
                    Upstash (מטמון), OpenAI/Google/Anthropic (AI). כולם כפופים להסכמי עיבוד מידע (DPA).
                  </p>
                </div>
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                  <h5 className="text-white font-medium mb-1">המשפיען הרלוונטי</h5>
                  <p className="text-sm">
                    תוכן שיחות עם הצ&apos;אטבוט זמין למשפיען שהצ&apos;אטבוט שייך לו, לצורך מעקב אחר שביעות רצון ושיפור השירות.
                  </p>
                </div>
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                  <h5 className="text-white font-medium mb-1">דרישות חוק</h5>
                  <p className="text-sm">
                    אנו עשויים לחשוף מידע אם נדרש על ידי חוק, צו בית משפט, או רשות מוסמכת.
                  </p>
                </div>
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                  <h5 className="text-white font-medium mb-1">Meta Platforms</h5>
                  <p className="text-sm">
                    אנו מחזירים תגובות צ&apos;אטבוט דרך Instagram Messaging API. Meta עשויה לעבד מידע זה בהתאם למדיניות הפרטיות שלה.
                  </p>
                </div>
              </div>
            </PolicyCard>
          </FadeInSection>

          {/* 7. Data Storage & Security */}
          <FadeInSection>
            <PolicyCard id="data-storage" number="07" title="אחסון ואבטחת מידע" subtitle="Data Storage & Security" icon={Server}>
              <p className="mb-4">
                אנו נוקטים באמצעי אבטחה מקובלים בתעשייה כדי להגן על המידע שלך:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 mb-6">
                {[
                  { title: 'הצפנה בתעבורה', desc: 'כל התקשורת מוצפנת באמצעות TLS 1.3' },
                  { title: 'הצפנה במנוחה', desc: 'נתונים מוצפנים ב-AES-256 בבסיס הנתונים' },
                  { title: 'בקרת גישה', desc: 'Row-Level Security (RLS) ברמת בסיס הנתונים' },
                  { title: 'הגנה על API', desc: 'Rate limiting, חתימת HMAC, אימות webhook' },
                  { title: 'גיבויים', desc: 'גיבויים יומיים אוטומטיים עם שמירה ל-30 יום' },
                  { title: 'מיקום שרתים', desc: 'שרתים ממוקמים באירופה ובארה"ב (AWS/Vercel)' },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex items-start gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                    <Lock className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="text-white font-medium text-sm">{title}</h5>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500">
                למרות מאמצינו, אין שיטת העברה או אחסון מקוונת מאובטחת ב-100%.
                אם נהיה מודעים לפריצת אבטחה, נודיע למשתמשים המושפעים ולרשויות הרלוונטיות בהתאם לחוק.
              </p>
            </PolicyCard>
          </FadeInSection>

          {/* 8. Data Retention */}
          <FadeInSection>
            <PolicyCard id="data-retention" number="08" title="תקופת שמירת מידע" subtitle="Data Retention" icon={Clock}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-right py-3 px-4 text-white font-medium">סוג מידע</th>
                      <th className="text-right py-3 px-4 text-white font-medium">תקופת שמירה</th>
                      <th className="text-right py-3 px-4 text-white font-medium hidden sm:table-cell">הערות</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr className="border-b border-white/5">
                      <td className="py-3 px-4">תוכן שיחות צ&apos;אטבוט</td>
                      <td className="py-3 px-4">90 יום</td>
                      <td className="py-3 px-4 hidden sm:table-cell">מחיקה אוטומטית, או לפי בקשה</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-3 px-4">נתוני סשן (Session)</td>
                      <td className="py-3 px-4">30 יום</td>
                      <td className="py-3 px-4 hidden sm:table-cell">מזהי סשן וחותמות זמן</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-3 px-4">תמונות וסרטונים בשיחה</td>
                      <td className="py-3 px-4">מיידי</td>
                      <td className="py-3 px-4 hidden sm:table-cell">נמחקים מיד לאחר ניתוח AI</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-3 px-4">טוקני Instagram</td>
                      <td className="py-3 px-4">60 יום</td>
                      <td className="py-3 px-4 hidden sm:table-cell">מתחדשים אוטומטית, נמחקים עם ניתוק</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-3 px-4">נתוני אנליטיקה</td>
                      <td className="py-3 px-4">12 חודשים</td>
                      <td className="py-3 px-4 hidden sm:table-cell">נתונים מצטברים בלבד (aggregated)</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4">לוגים טכניים</td>
                      <td className="py-3 px-4">14 יום</td>
                      <td className="py-3 px-4 hidden sm:table-cell">לצורכי debug ואבטחה</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </PolicyCard>
          </FadeInSection>

          {/* 9. Cookies */}
          <FadeInSection>
            <PolicyCard id="cookies" number="09" title="עוגיות (Cookies)" subtitle="Cookies & Tracking" icon={Cookie}>
              <p className="mb-4">אנו משתמשים בעוגיות ובטכנולוגיות דומות באופן מינימלי:</p>
              <ul className="list-disc list-inside space-y-2 mb-4">
                <li>
                  <strong className="text-white">עוגיות הכרחיות</strong> — נדרשות לתפקוד השירות (אימות, ניהול סשן). לא ניתן לבטלן.
                </li>
                <li>
                  <strong className="text-white">עוגיות אנליטיקה</strong> — מסייעות לנו להבין כיצד המשתמשים מקיימים אינטראקציה עם השירות. ניתנות לביטול.
                </li>
              </ul>
              <p>
                אנו <strong className="text-white">לא</strong> משתמשים בעוגיות פרסום, בעוגיות של צדדים שלישיים למעקב, או בפיקסלים של רשתות חברתיות.
                ניתן לנהל את העדפות העוגיות דרך הגדרות הדפדפן שלך.
              </p>
            </PolicyCard>
          </FadeInSection>

          {/* 10. User Rights */}
          <FadeInSection>
            <PolicyCard id="user-rights" number="10" title="זכויותיך" subtitle="Your Rights (GDPR & Israeli Privacy Law)" icon={UserCheck}>
              <p className="mb-4">בהתאם ל-GDPR ולחוק הגנת הפרטיות הישראלי, יש לך את הזכויות הבאות:</p>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { title: 'זכות גישה (Access)', desc: 'לקבל עותק של כל המידע האישי שאנו מחזיקים עליך' },
                  { title: 'זכות תיקון (Rectification)', desc: 'לתקן מידע לא מדויק או לא שלם' },
                  { title: 'זכות מחיקה (Erasure)', desc: 'לבקש מחיקת המידע האישי שלך ("הזכות להישכח")' },
                  { title: 'זכות הגבלה (Restriction)', desc: 'להגביל את העיבוד של המידע שלך בנסיבות מסוימות' },
                  { title: 'זכות ניידות (Portability)', desc: 'לקבל את המידע שלך בפורמט מובנה וקריא למכונה' },
                  { title: 'זכות התנגדות (Objection)', desc: 'להתנגד לעיבוד מידע המבוסס על אינטרס לגיטימי' },
                  { title: 'ביטול הסכמה (Withdraw Consent)', desc: 'לבטל הסכמה שניתנה בכל עת, מבלי שזה ישפיע על חוקיות העיבוד הקודם' },
                  { title: 'הגשת תלונה', desc: 'להגיש תלונה לרשות להגנת הפרטיות (הרשם של מאגרי מידע) או ל-DPA אירופאי' },
                ].map(({ title, desc }) => (
                  <div key={title} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                    <h5 className="text-white font-medium text-sm mb-1">{title}</h5>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-sm">
                למימוש זכויותיך, השתמש בטופס <button onClick={() => scrollToSection('gdpr-actions')} className="text-indigo-400 underline hover:text-indigo-300">&quot;מימוש זכויות&quot;</button> בתחתית הדף,
                או פנה אלינו ישירות בכתובת: <a href="mailto:privacy@leaders.co.il" className="text-indigo-400 hover:text-indigo-300">privacy@leaders.co.il</a>.
                נענה לבקשתך תוך 30 יום.
              </p>
            </PolicyCard>
          </FadeInSection>

          {/* 11. Children's Privacy */}
          <FadeInSection>
            <PolicyCard id="children" number="11" title="פרטיות קטינים" subtitle="Children&apos;s Privacy" icon={Baby}>
              <p>
                השירות אינו מיועד לילדים מתחת לגיל 13 (או 16 במדינות EU מסוימות).
                אנו לא אוספים ביודעין מידע אישי מקטינים מתחת לגיל המינימום החוקי.
              </p>
              <p>
                אם נודע לנו שאספנו מידע מקטין ללא הסכמת הורה, נמחק את המידע בהקדם.
                אם הנך הורה ויש לך חשש שילדך סיפק לנו מידע אישי, אנא פנה אלינו ונטפל בכך מיידית.
              </p>
            </PolicyCard>
          </FadeInSection>

          {/* 12. Policy Changes */}
          <FadeInSection>
            <PolicyCard id="changes" number="12" title="עדכונים למדיניות" subtitle="Changes to This Policy" icon={RefreshCw}>
              <p>
                אנו עשויים לעדכן מדיניות פרטיות זו מעת לעת. שינויים מהותיים יפורסמו בדף זה עם תאריך עדכון חדש.
              </p>
              <p>
                במקרה של שינויים מהותיים המשפיעים על זכויותיך, נשלח הודעה למשפיענים הרשומים במערכת.
                המשך השימוש בשירות לאחר פרסום עדכונים מהווה הסכמה למדיניות המעודכנת.
              </p>
              <p className="text-sm text-gray-500 mt-3">
                היסטוריית גרסאות: v1.0 (דצמבר 2024) — גרסה ראשונה. v2.0 (מרץ 2026) — הרחבה מקיפה, הוספת סעיפי Meta/Instagram, AI, ועוגיות.
              </p>
            </PolicyCard>
          </FadeInSection>

          {/* 13. Contact */}
          <FadeInSection>
            <PolicyCard id="contact" number="13" title="יצירת קשר" subtitle="Contact Us" icon={Mail}>
              <p className="mb-4">לשאלות, בקשות, או חששות בנושא פרטיות, ניתן לפנות אלינו:</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                  <h5 className="text-white font-medium text-sm mb-2">אימייל פרטיות</h5>
                  <a href="mailto:privacy@leaders.co.il" className="text-indigo-400 hover:text-indigo-300 text-sm">
                    privacy@leaders.co.il
                  </a>
                </div>
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                  <h5 className="text-white font-medium text-sm mb-2">דף יצירת קשר</h5>
                  <Link href="/contact" className="text-indigo-400 hover:text-indigo-300 text-sm">
                    influencers-bot.vercel.app/contact
                  </Link>
                </div>
              </div>
              <p className="mt-4 text-sm">
                זמן תגובה ממוצע: עד 5 ימי עסקים. בקשות הקשורות לזכויות פרטיות (GDPR) — עד 30 יום.
              </p>
            </PolicyCard>
          </FadeInSection>

          {/* 14. GDPR Actions */}
          <FadeInSection>
            <div
              id="gdpr-actions"
              className="scroll-mt-24 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 backdrop-blur-xl border border-indigo-500/20 rounded-2xl p-6 sm:p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">מימוש זכויות הפרטיות שלך</h2>
                  <p className="text-sm text-gray-400">Exercise Your Privacy Rights</p>
                </div>
              </div>

              <p className="text-sm text-gray-400 mb-6">
                השתמש בטופס זה כדי לבקש מחיקת נתונים או לייצא את המידע שלך.
                ניתן גם לשלוח בקשה ישירות ל-<a href="mailto:privacy@leaders.co.il" className="text-indigo-400 hover:text-indigo-300">privacy@leaders.co.il</a>.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">אימייל</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">מזהה שיחה (אופציונלי)</label>
                  <input
                    type="text"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    placeholder="session_xxx..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    dir="ltr"
                  />
                </div>
              </div>

              {message && (
                <div
                  className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
                    message.type === 'success'
                      ? 'bg-green-500/15 border border-green-500/25 text-green-400'
                      : 'bg-red-500/15 border border-red-500/25 text-red-400'
                  }`}
                >
                  {message.type === 'success' ? (
                    <Check className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  {message.text}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleDeleteRequest}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-all disabled:opacity-50 shadow-lg shadow-red-600/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  בקש מחיקת נתונים
                </button>
                <button
                  onClick={handleExportData}
                  disabled={loading || !sessionId}
                  className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl font-medium transition-all disabled:opacity-50 border border-white/10"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  ייצוא הנתונים שלי
                </button>
              </div>

              <p className="mt-4 text-xs text-gray-500">
                * בקשות מחיקה מעובדות תוך 30 יום. לייצוא נתונים נדרש מזהה השיחה.
                מחיקת נתונים היא בלתי הפיכה ותסיר את כל היסטוריית השיחות שלך.
              </p>
            </div>
          </FadeInSection>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-gray-500">
            <div className="flex flex-wrap gap-6">
              <Link href="/terms" className="hover:text-gray-300 transition-colors">תנאי שימוש</Link>
              <Link href="/privacy" className="text-indigo-400">מדיניות פרטיות</Link>
              <Link href="/contact" className="hover:text-gray-300 transition-colors">יצירת קשר</Link>
            </div>
            <p>&copy; {new Date().getFullYear()} bestieAI. כל הזכויות שמורות.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================
// Policy Card component
// ============================================

function PolicyCard({
  id,
  number,
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24 bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 hover:border-white/15 transition-colors">
      <div className="flex items-start gap-4 mb-5">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-mono text-indigo-400/60">{number}</span>
          </div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="text-gray-400 leading-relaxed space-y-3 text-[15px]">
        {children}
      </div>
    </div>
  );
}
