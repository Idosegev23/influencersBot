'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Plus,
  Trash2,
  Check,
  Send,
  Copy,
  MessageCircle,
  X,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase client ───
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ───
interface OnboardingRecord {
  id: string;
  brand_name: string;
  brand_domain: string | null;
  notes: string | null;
  status: 'in_progress' | 'completed';
  created_at: string;
}

interface TaskRecord {
  id: string;
  onboarding_id: string;
  task_number: number;
  task_title: string;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
}

// ─── Task definitions ───
interface TaskDef {
  num: number;
  title: string;
  badges: { label: string; color: string }[];
  note: string;
  section: string;
}

const SECTIONS = [
  { key: 'A', title: 'הכנה ואיסוף מידע' },
  { key: 'B', title: 'סריקה מקומית של האתר' },
  { key: 'C', title: 'הגדרת הצ\'אטבוט (פרסונה)' },
  { key: 'D', title: 'הגדרת וידג\'ט (עיצוב)' },
  { key: 'E', title: 'בדיקות ואימות' },
  { key: 'F', title: 'הטמעה והפעלה (Go Live)' },
];

const BADGE_COLORS: Record<string, string> = {
  'data': 'bg-blue-500/20 text-blue-300',
  'admin': 'bg-red-500/20 text-red-300',
  'content': 'bg-cyan-500/20 text-cyan-300',
  'scan': 'bg-green-500/20 text-green-300',
  'local': 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30',
  'ai': 'bg-purple-500/20 text-purple-300',
  'persona': 'bg-pink-500/20 text-pink-300',
  'policy': 'bg-red-500/20 text-red-300',
  'ux': 'bg-pink-500/20 text-pink-300',
  'design': 'bg-fuchsia-500/20 text-fuchsia-300',
  'test': 'bg-amber-500/20 text-amber-300',
  'deploy': 'bg-orange-500/20 text-orange-300',
};

const TASKS: TaskDef[] = [
  // A
  { num: 1, title: 'יצירת חשבון (account) מסוג brand בסופאבייס', badges: [{ label: 'דאטה', color: 'data' }, { label: 'אדמין', color: 'admin' }], note: 'POST /api/admin/accounts עם type: \'brand\' — או ישירות ב-DB', section: 'A' },
  { num: 2, title: 'מילוי פרטי מותג: שם, דומיין, שפה, סוג עסק, לוגו', badges: [{ label: 'דאטה', color: 'data' }], note: 'config: { username (domain), display_name, language, logo_url }', section: 'A' },
  { num: 3, title: 'קבלת חומרי רקע מהלקוח (PDF, מסמכים, שאלות נפוצות)', badges: [{ label: 'תוכן', color: 'content' }], note: 'לבקש: קטלוג, FAQ, מדריכי שימוש, מדיניות החזרות, מידע על החברה', section: 'A' },
  // B
  { num: 4, title: 'הרצת סקריפט סריקה מקומי (deep-scrape-local / deep-scrape-website)', badges: [{ label: 'סריקה', color: 'scan' }, { label: 'לוקאלי', color: 'local' }], note: 'node scripts/deep-scrape-website.mjs --url https://domain.com --account-id UUID', section: 'B' },
  { num: 5, title: 'וידוא שכל העמודים נסרקו ונשמרו ב-DB (website_pages)', badges: [{ label: 'דאטה', color: 'data' }, { label: 'סריקה', color: 'scan' }], note: 'SELECT count(*) FROM website_pages WHERE account_id = \'UUID\'', section: 'B' },
  { num: 6, title: 'יצירת RAG chunks מתוכן האתר (וקטורים)', badges: [{ label: 'AI / RAG', color: 'ai' }, { label: 'לוקאלי', color: 'local' }], note: 'SELECT count(*) FROM rag_chunks WHERE account_id = \'UUID\'', section: 'B' },
  { num: 7, title: 'העלאה ופרסור מסמכי לקוח (PDF/DOCX) דרך AI Parser', badges: [{ label: 'AI', color: 'ai' }, { label: 'תוכן', color: 'content' }], note: 'GPT-5.2 → Gemini 3 fallback. בדיקת confidence > 0.7', section: 'B' },
  // C
  { num: 8, title: 'הגדרת פרסונה: טון דיבור, סגנון, שפה, אימוג\'י', badges: [{ label: 'AI', color: 'ai' }, { label: 'פרסונה', color: 'persona' }], note: '/admin/chatbot-persona/[accountId] — או ישירות בטבלת chatbot_persona', section: 'C' },
  { num: 9, title: 'הגדרת גבולות: מה הבוט לא עונה, הפניות לנציג, נושאים חסומים', badges: [{ label: 'AI', color: 'ai' }, { label: 'מדיניות', color: 'policy' }], note: 'למשל: לא לתת מחירים, לא להבטיח זמני משלוח, להפנות לטלפון במקרי חירום', section: 'C' },
  { num: 10, title: 'הגדרת הודעת פתיחה + שאלות מהירות (Quick Actions)', badges: [{ label: 'תוכן', color: 'content' }, { label: 'UX', color: 'ux' }], note: 'welcomeMessage + suggested actions (למשל: "מה שעות הפעילות?", "איך מזמינים?")', section: 'C' },
  // D
  { num: 11, title: 'הגדרת צבעים: primaryColor לפי מיתוג הלקוח', badges: [{ label: 'עיצוב', color: 'design' }], note: 'config.widget.primaryColor — צבע ראשי של הבועה, כפתורים ואלמנטים', section: 'D' },
  { num: 12, title: 'הגדרת פונט, מיקום (bottom-right/left), מצב כהה/בהיר', badges: [{ label: 'עיצוב', color: 'design' }], note: 'fontFamily, position, darkMode — בהתאם לעיצוב האתר של הלקוח', section: 'D' },
  { num: 13, title: 'העלאת לוגו / אוואטר לבועת הצ\'אט', badges: [{ label: 'עיצוב', color: 'design' }, { label: 'דאטה', color: 'data' }], note: 'config.logo_url — מוצג בחלון הצ\'אט ובבועה', section: 'D' },
  // E
  { num: 14, title: 'בדיקת צ\'אט בסיסית: שאלה כללית + תשובה רלוונטית מ-RAG', badges: [{ label: 'בדיקה', color: 'test' }, { label: 'AI', color: 'ai' }], note: 'לשאול לפחות 3 שאלות שונות ולוודא שהתשובות מבוססות על תוכן האתר', section: 'E' },
  { num: 15, title: 'בדיקת גבולות: שאלה מחוץ לתחום — תגובה מתאימה (לא "ממציא")', badges: [{ label: 'בדיקה', color: 'test' }, { label: 'מדיניות', color: 'policy' }], note: 'לשאול משהו שלא קיים באתר — הבוט צריך להגיד שהוא לא יודע או להפנות', section: 'E' },
  { num: 16, title: 'בדיקת עיצוב הוידג\'ט: צבעים, RTL, מובייל, דסקטופ', badges: [{ label: 'בדיקה', color: 'test' }, { label: 'עיצוב', color: 'design' }], note: 'לבדוק ב-Preview page + ישירות על האתר של הלקוח (אם אפשר)', section: 'E' },
  { num: 17, title: 'בדיקת streaming: תגובות זורמות, typing indicator, ללא שגיאות', badges: [{ label: 'בדיקה', color: 'test' }], note: 'לפתוח Network tab ולוודא NDJSON events: meta → delta → done', section: 'E' },
  // F
  { num: 18, title: 'הוספת דומיין הלקוח ל-CORS whitelist (אם נדרש)', badges: [{ label: 'הטמעה', color: 'deploy' }], note: 'widget config API + chat API — Access-Control-Allow-Origin', section: 'F' },
  { num: 19, title: 'שליחת קוד הטמעה ללקוח + הוראות התקנה', badges: [{ label: 'הטמעה', color: 'deploy' }, { label: 'תוכן', color: 'content' }], note: '<script src=".../widget.js" data-account-id="UUID"></script> — WordPress / Shopify / Wix / קוד', section: 'F' },
  { num: 20, title: 'אימות סופי: הוידג\'ט עובד על האתר החי של הלקוח', badges: [{ label: 'הטמעה', color: 'deploy' }, { label: 'אישור סופי', color: 'admin' }], note: 'לפתוח את האתר, לראות את הבועה, לשלוח הודעה, לוודא תשובה תקינה', section: 'F' },
];

// ─── Helpers ───
function formatHebDate(date: Date) {
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

// ─── Component ───
export default function BrandOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [checklists, setChecklists] = useState<OnboardingRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentRecord, setCurrentRecord] = useState<OnboardingRecord | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [brandName, setBrandName] = useState('');
  const [brandDomain, setBrandDomain] = useState('');
  const [notes, setNotes] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingTaskNum, setPendingTaskNum] = useState<number | null>(null);
  const [personName, setPersonName] = useState('');
  const [modalNow, setModalNow] = useState(new Date());
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // ─── Auth check ───
  useEffect(() => {
    fetch('/api/admin')
      .then(r => r.json())
      .then(data => {
        if (!data.authenticated) router.push('/admin');
      });
  }, [router]);

  // ─── Load saved user name ───
  useEffect(() => {
    const saved = localStorage.getItem('onboarding-user-name');
    if (saved) setPersonName(saved);
  }, []);

  // ─── Load checklists list ───
  const loadChecklists = useCallback(async () => {
    const { data } = await supabase
      .from('brand_onboarding')
      .select('*')
      .order('created_at', { ascending: false });
    setChecklists(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadChecklists(); }, [loadChecklists]);

  // ─── Auto-load last used ───
  useEffect(() => {
    if (checklists.length > 0 && !currentId) {
      const lastId = localStorage.getItem('onboarding-last-id');
      if (lastId && checklists.find(c => c.id === lastId)) {
        loadChecklist(lastId);
      }
    }
  }, [checklists]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load a specific checklist ───
  async function loadChecklist(id: string) {
    setCurrentId(id);
    localStorage.setItem('onboarding-last-id', id);

    const record = checklists.find(c => c.id === id);
    if (record) {
      setCurrentRecord(record);
      setBrandName(record.brand_name || '');
      setBrandDomain(record.brand_domain || '');
      setNotes(record.notes || '');
    }

    const { data } = await supabase
      .from('brand_onboarding_tasks')
      .select('*')
      .eq('onboarding_id', id)
      .order('task_number', { ascending: true });
    setTasks(data || []);
  }

  // ─── Create new checklist ───
  async function createNew() {
    const { data, error } = await supabase
      .from('brand_onboarding')
      .insert({ brand_name: 'מותג חדש', brand_domain: '', notes: '', status: 'in_progress' })
      .select()
      .single();

    if (error || !data) { showToast('שגיאה ביצירה'); return; }

    // Create 20 tasks
    const taskRows = TASKS.map(t => ({
      onboarding_id: data.id,
      task_number: t.num,
      task_title: t.title,
      completed: false,
    }));
    await supabase.from('brand_onboarding_tasks').insert(taskRows);

    await loadChecklists();
    await loadChecklist(data.id);
    showToast('נוצר צ\'קליסט חדש');
  }

  // ─── Delete checklist ───
  async function deleteChecklist() {
    if (!currentId) return;
    if (!confirm('למחוק את הצ\'קליסט הזה? הפעולה בלתי הפיכה.')) return;

    await supabase.from('brand_onboarding').delete().eq('id', currentId);
    setCurrentId(null);
    setCurrentRecord(null);
    setTasks([]);
    localStorage.removeItem('onboarding-last-id');
    await loadChecklists();
    showToast('נמחק');
  }

  // ─── Save brand info (debounced) ───
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  function saveBrandInfo(name: string, domain: string, noteVal: string) {
    if (!currentId) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      await supabase
        .from('brand_onboarding')
        .update({ brand_name: name, brand_domain: domain, notes: noteVal, updated_at: new Date().toISOString() })
        .eq('id', currentId);
    }, 800);
  }

  // ─── Task click handler ───
  function handleTaskClick(taskNum: number) {
    const existing = tasks.find(t => t.task_number === taskNum);
    if (existing?.completed) {
      // Unchecking
      if (confirm('לבטל את הסימון של משימה זו?')) {
        uncheckTask(taskNum);
      }
      return;
    }
    // Open modal
    setPendingTaskNum(taskNum);
    setModalNow(new Date());
    setModalOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }

  async function uncheckTask(taskNum: number) {
    if (!currentId) return;
    await supabase
      .from('brand_onboarding_tasks')
      .update({ completed: false, completed_by: null, completed_at: null })
      .eq('onboarding_id', currentId)
      .eq('task_number', taskNum);

    setTasks(prev => prev.map(t =>
      t.task_number === taskNum ? { ...t, completed: false, completed_by: null, completed_at: null } : t
    ));
  }

  async function confirmTask() {
    if (!personName.trim()) {
      nameInputRef.current?.focus();
      return;
    }
    if (!currentId || pendingTaskNum === null) return;

    localStorage.setItem('onboarding-user-name', personName.trim());
    const now = new Date().toISOString();

    await supabase
      .from('brand_onboarding_tasks')
      .update({ completed: true, completed_by: personName.trim(), completed_at: now })
      .eq('onboarding_id', currentId)
      .eq('task_number', pendingTaskNum);

    setTasks(prev => prev.map(t =>
      t.task_number === pendingTaskNum ? { ...t, completed: true, completed_by: personName.trim(), completed_at: now } : t
    ));

    setModalOpen(false);
    setPendingTaskNum(null);

    // Check if all done
    const updatedTasks = tasks.map(t =>
      t.task_number === pendingTaskNum ? { ...t, completed: true } : t
    );
    if (updatedTasks.every(t => t.completed)) {
      await supabase
        .from('brand_onboarding')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', currentId);
      showToast('כל המשימות הושלמו!');
    }
  }

  // ─── Progress ───
  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = TASKS.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // ─── Build summary text ───
  function buildSummary() {
    const lines: string[] = [];
    lines.push(`צ׳קליסט קליטת מותג: ${brandName || 'לא צוין'}${brandDomain ? ` (${brandDomain})` : ''}`);
    lines.push('═'.repeat(35));

    let currentSection = '';
    for (const taskDef of TASKS) {
      if (taskDef.section !== currentSection) {
        currentSection = taskDef.section;
        const sec = SECTIONS.find(s => s.key === currentSection);
        lines.push('');
        lines.push(`[ ${sec?.key} ${sec?.title} ]`);
      }
      const taskData = tasks.find(t => t.task_number === taskDef.num);
      const done = taskData?.completed || false;
      let line = `${done ? '\u2705' : '\u2B1C'} ${taskDef.num}. ${taskDef.title}`;
      if (done && taskData?.completed_by) {
        const when = taskData.completed_at ? formatHebDate(new Date(taskData.completed_at)) : '';
        line += `\n     \u2514 ${taskData.completed_by}${when ? ' — ' + when : ''}`;
      }
      lines.push(line);
    }

    lines.push('');
    lines.push('═'.repeat(35));
    lines.push(`סה״כ: ${completedCount} / ${totalCount} הושלמו (${progressPct}%)`);
    if (notes) {
      lines.push('');
      lines.push(`הערות: ${notes}`);
    }
    return lines.join('\n');
  }

  function sendEmail() {
    const subject = encodeURIComponent(`סטטוס קליטת מותג - ${brandName || 'מותג'}`);
    const body = encodeURIComponent(buildSummary());
    window.open(`mailto:cto@ldrsgroup.com,yoav@ldrsgroup.com?subject=${subject}&body=${body}`, '_blank');
    showToast('נפתח חלון מייל...');
  }

  function sendWhatsApp() {
    const text = encodeURIComponent(buildSummary());
    window.open(`https://wa.me/?text=${text}`, '_blank');
    showToast('נפתח וואטסאפ...');
  }

  function copyText() {
    navigator.clipboard.writeText(buildSummary()).then(() => showToast('הועתק ללוח!'));
  }

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel" dir="rtl">
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-900/20 via-gray-950 to-purple-900/20" />

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-gray-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-white text-lg">צ&apos;קליסט קליטת מותג</h1>
            <span className="text-xs text-gray-500">צ&apos;אט + וידג&apos;ט</span>
          </div>
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            חזרה לדאשבורד
          </Link>
        </div>
      </header>

      <main className="relative z-10 p-6 max-w-3xl mx-auto">

        {/* Selector bar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <select
            value={currentId || ''}
            onChange={(e) => {
              if (e.target.value) loadChecklist(e.target.value);
              else { setCurrentId(null); setCurrentRecord(null); setTasks([]); }
            }}
            className="flex-1 min-w-[200px] px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">בחר צ&apos;קליסט קיים...</option>
            {checklists.map(c => {
              const date = new Date(c.created_at).toLocaleDateString('he-IL');
              return (
                <option key={c.id} value={c.id}>
                  {c.brand_name || 'ללא שם'} — {c.brand_domain || ''} ({date}) {c.status === 'completed' ? '[הושלם]' : ''}
                </option>
              );
            })}
          </select>
          <button
            onClick={createNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25"
          >
            <Plus className="w-4 h-4" />
            חדש
          </button>
          {currentId && (
            <button
              onClick={deleteChecklist}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium rounded-xl transition-all"
            >
              <Trash2 className="w-4 h-4" />
              מחק
            </button>
          )}
        </div>

        {/* Content — only if checklist selected */}
        {currentId && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Brand info */}
            <div className="admin-card p-5 mb-6 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border-indigo-500/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">שם המותג</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => { setBrandName(e.target.value); saveBrandInfo(e.target.value, brandDomain, notes); }}
                    placeholder="למשל: ארגניה"
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white font-semibold text-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">דומיין / אתר</label>
                  <input
                    type="text"
                    value={brandDomain}
                    onChange={(e) => { setBrandDomain(e.target.value); saveBrandInfo(brandName, e.target.value, notes); }}
                    placeholder="example.co.il"
                    dir="ltr"
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white font-medium placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-400">{completedCount} / {totalCount}</span>
              <span className="text-sm font-medium text-gray-400">{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full mb-8 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>

            {/* Tasks grouped by section */}
            {SECTIONS.map(section => {
              const sectionTasks = TASKS.filter(t => t.section === section.key);
              return (
                <div key={section.key} className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center">
                      {section.key}
                    </span>
                    <span className="text-sm font-semibold text-gray-400">{section.title}</span>
                    <div className="flex-1 h-px bg-gray-800" />
                  </div>

                  <div className="space-y-2">
                    {sectionTasks.map(taskDef => {
                      const taskData = tasks.find(t => t.task_number === taskDef.num);
                      const isChecked = taskData?.completed || false;

                      return (
                        <div
                          key={taskDef.num}
                          onClick={() => handleTaskClick(taskDef.num)}
                          className={`admin-card p-4 cursor-pointer transition-all hover:border-indigo-500/40 ${
                            isChecked ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-xs font-bold text-gray-600 mt-1 min-w-[20px] text-center">{taskDef.num}</span>
                            <div className={`w-5 h-5 mt-0.5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                              isChecked
                                ? 'bg-indigo-500 border-indigo-500'
                                : 'border-gray-600'
                            }`}>
                              {isChecked && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-semibold ${isChecked ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                                {taskDef.title}
                              </div>
                              <div className="flex gap-1.5 mt-1 flex-wrap">
                                {taskDef.badges.map((b, i) => (
                                  <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${BADGE_COLORS[b.color] || 'bg-gray-700 text-gray-300'}`}>
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[11px] text-gray-500 mt-1">{taskDef.note}</p>
                              {/* Completion info */}
                              {isChecked && taskData?.completed_by && (
                                <p className="text-[11px] text-indigo-400 font-medium mt-1.5">
                                  {taskData.completed_by}
                                  {taskData.completed_at && ` — ${formatHebDate(new Date(taskData.completed_at))}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Notes */}
            <div className="admin-card p-5 mt-8">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">הערות ופרטים נוספים</h3>
              <textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); saveBrandInfo(brandName, brandDomain, e.target.value); }}
                placeholder="רשום כאן הערות, בעיות שנתקלת בהן, דברים לזכור..."
                className="w-full min-h-[80px] px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            </div>

            {/* Send */}
            <div className="admin-card p-5 mt-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">שליחת סטטוס</h3>
              <div className="flex gap-3 flex-wrap">
                <button onClick={sendEmail} className="flex-1 min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-all">
                  <Send className="w-4 h-4" />
                  מייל
                </button>
                <button onClick={sendWhatsApp} className="flex-1 min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-xl transition-all">
                  <MessageCircle className="w-4 h-4" />
                  וואטסאפ
                </button>
                <button onClick={copyText} className="flex-1 min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-xl transition-all">
                  <Copy className="w-4 h-4" />
                  העתק
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {!currentId && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
              <Check className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">צ&apos;קליסט קליטת מותג</h2>
            <p className="text-sm text-gray-500 mb-6">בחר צ&apos;קליסט קיים מהרשימה, או צור חדש</p>
            <button
              onClick={createNew}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25"
            >
              <Plus className="w-5 h-5" />
              צור צ&apos;קליסט חדש
            </button>
          </div>
        )}
      </main>

      {/* ─── Confirmation Modal ─── */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => { setModalOpen(false); setPendingTaskNum(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-[90%] max-w-[400px] shadow-2xl"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-white">סימון משימה #{pendingTaskNum}</h3>
                <button onClick={() => { setModalOpen(false); setPendingTaskNum(null); }} className="text-gray-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-indigo-400 font-medium mb-5">
                {TASKS.find(t => t.num === pendingTaskNum)?.title}
              </p>

              <label className="text-xs font-semibold text-gray-400 mb-1.5 block">מי ביצע?</label>
              <input
                ref={nameInputRef}
                type="text"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmTask(); }}
                placeholder="הקלד את שמך..."
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-base font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
              />

              <div className="px-4 py-3 bg-gray-800/50 rounded-xl text-sm text-gray-400 mb-5">
                <span className="font-semibold text-gray-300">תאריך ושעה: </span>
                {formatHebDate(modalNow)}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={confirmTask}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all"
                >
                  אישור
                </button>
                <button
                  onClick={() => { setModalOpen(false); setPendingTaskNum(null); }}
                  className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 font-semibold rounded-xl transition-all"
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-gray-800 text-white text-sm font-medium rounded-xl shadow-xl border border-gray-700"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
