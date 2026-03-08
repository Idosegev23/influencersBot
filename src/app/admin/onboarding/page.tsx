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
  User,
  Building2,
  Monitor,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase ───
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ───
type AccountType = 'creator' | 'brand';

interface OnboardingRecord {
  id: string;
  brand_name: string;
  brand_domain: string | null;
  notes: string | null;
  status: 'in_progress' | 'completed';
  account_type: AccountType;
  wants_widget: boolean;
  created_at: string;
}

interface TaskRecord {
  id: string;
  onboarding_id: string;
  task_number: number;
  task_title: string;
  section: string | null;
  note: string | null;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
}

// ─── Badge colors ───
const BC: Record<string, string> = {
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
  'social': 'bg-indigo-500/20 text-indigo-300',
  'brands': 'bg-yellow-500/20 text-yellow-300',
  'graphic': 'bg-rose-500/20 text-rose-300',
};

// ─── Task Templates ───
interface TaskTemplate {
  title: string;
  badges: { label: string; color: string }[];
  note: string;
  section: string;
  sectionTitle: string;
}

// ─── Build tasks dynamically ───
function buildTaskList(accountType: AccountType, wantsWidget: boolean): TaskTemplate[] {
  const tasks: TaskTemplate[] = [];

  // ─── A: הכנה ואיסוף מידע (All) ───
  const secA = 'A';
  const secATitle = 'הכנה ואיסוף מידע';
  tasks.push({
    title: 'יצירת חשבון בסופאבייס',
    badges: [{ label: 'דאטה', color: 'data' }, { label: 'אדמין', color: 'admin' }],
    note: `POST /api/admin/accounts עם type: '${accountType}' — או ישירות ב-DB`,
    section: secA, sectionTitle: secATitle,
  });
  tasks.push({
    title: accountType === 'creator'
      ? 'מילוי פרטי משפיען: שם, שם משתמש, שפה, לוגו'
      : 'מילוי פרטי מותג: שם, דומיין, שפה, סוג עסק, לוגו',
    badges: [{ label: 'דאטה', color: 'data' }],
    note: 'config: { username, display_name, language, logo_url }',
    section: secA, sectionTitle: secATitle,
  });
  tasks.push({
    title: 'קבלת חומרי רקע מהלקוח (PDF, מסמכים, שאלות נפוצות)',
    badges: [{ label: 'תוכן', color: 'content' }],
    note: 'לבקש: קטלוג, FAQ, מדריכי שימוש, מדיניות החזרות, מידע על החברה',
    section: secA, sectionTitle: secATitle,
  });

  // ─── B: סריקה ───
  if (accountType === 'creator') {
    const secB = 'B';
    const secBTitle = 'סריקה ואיסוף נתונים';
    tasks.push({
      title: 'סריקת חשבון אינסטגרם של המשפיען',
      badges: [{ label: 'סריקה', color: 'scan' }, { label: 'סושיאל', color: 'social' }],
      note: 'הרצת סקריפט סריקה — node scripts/scan-account.ts --username HANDLE',
      section: secB, sectionTitle: secBTitle,
    });
    tasks.push({
      title: 'גילוי נוכחות דיגיטלית מלאה (אתר, טיקטוק, פייסבוק, יוטיוב)',
      badges: [{ label: 'מחקר', color: 'content' }],
      note: 'לבדוק ביו, לינקים, חיפוש ידני ברשתות',
      section: secB, sectionTitle: secBTitle,
    });
    tasks.push({
      title: 'וידוא כניסת תמלולים ונתונים למאגר',
      badges: [{ label: 'דאטה', color: 'data' }],
      note: 'SELECT count(*) FROM instagram_posts WHERE account_id = \'UUID\'',
      section: secB, sectionTitle: secBTitle,
    });
    tasks.push({
      title: 'סריקה ושמירת תמונת פרופיל למסד הנתונים',
      badges: [{ label: 'גרפיקה', color: 'graphic' }, { label: 'דאטה', color: 'data' }],
      note: 'profile_pic_url ב-accounts — וידוא שהתמונה נטענת',
      section: secB, sectionTitle: secBTitle,
    });
    tasks.push({
      title: 'וידוא תקינות קופונים ומותגים משויכים',
      badges: [{ label: 'קשרי מותגים', color: 'brands' }],
      note: 'בדיקת טבלת coupons + partnerships עבור ה-account',
      section: secB, sectionTitle: secBTitle,
    });
  } else {
    // Brand
    const secB = 'B';
    const secBTitle = 'סריקה מקומית של האתר';
    tasks.push({
      title: 'הרצת סקריפט סריקה מקומי (deep-scrape-website)',
      badges: [{ label: 'סריקה', color: 'scan' }, { label: 'לוקאלי', color: 'local' }],
      note: 'node scripts/deep-scrape-website.mjs --url https://domain.com --account-id UUID',
      section: secB, sectionTitle: secBTitle,
    });
    tasks.push({
      title: 'וידוא שכל העמודים נסרקו ונשמרו ב-DB (website_pages)',
      badges: [{ label: 'דאטה', color: 'data' }, { label: 'סריקה', color: 'scan' }],
      note: 'SELECT count(*) FROM website_pages WHERE account_id = \'UUID\'',
      section: secB, sectionTitle: secBTitle,
    });
    tasks.push({
      title: 'יצירת RAG chunks מתוכן האתר (וקטורים)',
      badges: [{ label: 'AI / RAG', color: 'ai' }, { label: 'לוקאלי', color: 'local' }],
      note: 'SELECT count(*) FROM rag_chunks WHERE account_id = \'UUID\'',
      section: secB, sectionTitle: secBTitle,
    });
    tasks.push({
      title: 'העלאה ופרסור מסמכי לקוח (PDF/DOCX) דרך AI Parser',
      badges: [{ label: 'AI', color: 'ai' }, { label: 'תוכן', color: 'content' }],
      note: 'GPT-5.2 → Gemini 3 fallback. בדיקת confidence > 0.7',
      section: secB, sectionTitle: secBTitle,
    });
  }

  // ─── C: הגדרת פרסונה (All) ───
  const secC = 'C';
  const secCTitle = 'הגדרת הצ\'אטבוט (פרסונה)';
  tasks.push({
    title: 'הגדרת פרסונה: טון דיבור, סגנון, שפה, אימוג\'י',
    badges: [{ label: 'AI', color: 'ai' }, { label: 'פרסונה', color: 'persona' }],
    note: '/admin/chatbot-persona/[accountId] — או ישירות בטבלת chatbot_persona',
    section: secC, sectionTitle: secCTitle,
  });
  tasks.push({
    title: 'הגדרת גבולות: מה הבוט לא עונה, הפניות לנציג, נושאים חסומים',
    badges: [{ label: 'AI', color: 'ai' }, { label: 'מדיניות', color: 'policy' }],
    note: 'למשל: לא לתת מחירים, לא להבטיח זמני משלוח, להפנות לטלפון במקרי חירום',
    section: secC, sectionTitle: secCTitle,
  });
  tasks.push({
    title: 'הגדרת הודעת פתיחה + שאלות מהירות (Quick Actions)',
    badges: [{ label: 'תוכן', color: 'content' }, { label: 'UX', color: 'ux' }],
    note: 'welcomeMessage + suggested actions',
    section: secC, sectionTitle: secCTitle,
  });

  // ─── D: וידג'ט (Brand + wants_widget only) ───
  if (accountType === 'brand' && wantsWidget) {
    const secD = 'D';
    const secDTitle = 'הגדרת וידג\'ט (עיצוב)';
    tasks.push({
      title: 'הגדרת צבעים: primaryColor לפי מיתוג הלקוח',
      badges: [{ label: 'עיצוב', color: 'design' }],
      note: 'config.widget.primaryColor — צבע ראשי של הבועה, כפתורים ואלמנטים',
      section: secD, sectionTitle: secDTitle,
    });
    tasks.push({
      title: 'הגדרת פונט, מיקום (bottom-right/left), מצב כהה/בהיר',
      badges: [{ label: 'עיצוב', color: 'design' }],
      note: 'fontFamily, position, darkMode — בהתאם לעיצוב האתר של הלקוח',
      section: secD, sectionTitle: secDTitle,
    });
    tasks.push({
      title: 'העלאת לוגו / אוואטר לבועת הצ\'אט',
      badges: [{ label: 'עיצוב', color: 'design' }, { label: 'דאטה', color: 'data' }],
      note: 'config.logo_url — מוצג בחלון הצ\'אט ובבועה',
      section: secD, sectionTitle: secDTitle,
    });
    tasks.push({
      title: 'הוספת דומיין הלקוח ל-CORS whitelist',
      badges: [{ label: 'הטמעה', color: 'deploy' }],
      note: 'widget config API + chat API — Access-Control-Allow-Origin',
      section: secD, sectionTitle: secDTitle,
    });
    tasks.push({
      title: 'שליחת קוד הטמעה ללקוח + הוראות התקנה',
      badges: [{ label: 'הטמעה', color: 'deploy' }, { label: 'תוכן', color: 'content' }],
      note: '<script src=".../widget.js" data-account-id="UUID"></script> — WordPress / Shopify / Wix',
      section: secD, sectionTitle: secDTitle,
    });
  }

  // ─── E: בדיקות (All) ───
  const secE = 'E';
  const secETitle = 'בדיקות ואימות';
  tasks.push({
    title: 'בדיקת צ\'אט בסיסית: שאלה כללית + תשובה רלוונטית',
    badges: [{ label: 'בדיקה', color: 'test' }, { label: 'AI', color: 'ai' }],
    note: 'לשאול לפחות 3 שאלות שונות ולוודא שהתשובות מבוססות על התוכן',
    section: secE, sectionTitle: secETitle,
  });
  tasks.push({
    title: 'בדיקת גבולות: שאלה מחוץ לתחום — תגובה מתאימה',
    badges: [{ label: 'בדיקה', color: 'test' }, { label: 'מדיניות', color: 'policy' }],
    note: 'לשאול משהו שלא קיים — הבוט צריך להגיד שהוא לא יודע או להפנות',
    section: secE, sectionTitle: secETitle,
  });
  tasks.push({
    title: 'בדיקות תוכן ראשוניות (איכות ורלוונטיות)',
    badges: [{ label: 'בדיקה', color: 'test' }, { label: 'תוכן', color: 'content' }],
    note: 'לוודא שהבוט לא ממציא מידע ושהתוכן מדויק',
    section: secE, sectionTitle: secETitle,
  });

  if (accountType === 'brand' && wantsWidget) {
    tasks.push({
      title: 'בדיקת עיצוב הוידג\'ט: צבעים, RTL, מובייל, דסקטופ',
      badges: [{ label: 'בדיקה', color: 'test' }, { label: 'עיצוב', color: 'design' }],
      note: 'לבדוק ב-Preview page + ישירות על האתר של הלקוח',
      section: secE, sectionTitle: secETitle,
    });
    tasks.push({
      title: 'בדיקת streaming: תגובות זורמות, typing indicator, ללא שגיאות',
      badges: [{ label: 'בדיקה', color: 'test' }],
      note: 'לפתוח Network tab ולוודא NDJSON events: meta → delta → done',
      section: secE, sectionTitle: secETitle,
    });
    tasks.push({
      title: 'אימות סופי: הוידג\'ט עובד על האתר החי של הלקוח',
      badges: [{ label: 'הטמעה', color: 'deploy' }, { label: 'בדיקה', color: 'test' }],
      note: 'לפתוח את האתר, לראות את הבועה, לשלוח הודעה, לוודא תשובה תקינה',
      section: secE, sectionTitle: secETitle,
    });
  }

  // ─── F: אישור סופי (All) ───
  const secF = 'F';
  const secFTitle = 'אישור סופי';
  tasks.push({
    title: 'אישור סופי והעברת החשבון למערכת הפעילה',
    badges: [{ label: 'אדמין', color: 'admin' }],
    note: 'שינוי סטטוס ל-active, וידוא שהכל תקין',
    section: secF, sectionTitle: secFTitle,
  });

  return tasks;
}

// ─── Helpers ───
function formatHebDate(date: Date) {
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

// Badge lookup by task title — for display on loaded tasks
function findTemplate(title: string, allTemplates: TaskTemplate[]) {
  return allTemplates.find(t => t.title === title);
}

// ─── Main Component ───
export default function OnboardingChecklistPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [checklists, setChecklists] = useState<OnboardingRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentRecord, setCurrentRecord] = useState<OnboardingRecord | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [brandName, setBrandName] = useState('');
  const [brandDomain, setBrandDomain] = useState('');
  const [notes, setNotes] = useState('');

  // Create-new wizard
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [wizardType, setWizardType] = useState<AccountType>('creator');
  const [wizardWidget, setWizardWidget] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1); // 1=type, 2=widget (brand only)

  // Task confirmation modal
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingTaskNum, setPendingTaskNum] = useState<number | null>(null);
  const [personName, setPersonName] = useState('');
  const [modalNow, setModalNow] = useState(new Date());
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState('');
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // ─── Auth ───
  useEffect(() => {
    fetch('/api/admin').then(r => r.json()).then(d => {
      if (!d.authenticated) router.push('/admin');
    });
  }, [router]);

  useEffect(() => {
    const saved = localStorage.getItem('onboarding-user-name');
    if (saved) setPersonName(saved);
  }, []);

  // ─── Load list ───
  const loadChecklists = useCallback(async () => {
    const { data } = await supabase
      .from('brand_onboarding')
      .select('*')
      .order('created_at', { ascending: false });
    setChecklists(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadChecklists(); }, [loadChecklists]);

  useEffect(() => {
    if (checklists.length > 0 && !currentId) {
      const lastId = localStorage.getItem('onboarding-last-id');
      if (lastId && checklists.find(c => c.id === lastId)) {
        loadChecklist(lastId);
      }
    }
  }, [checklists]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load checklist ───
  async function loadChecklist(id: string) {
    const rec = checklists.find(c => c.id === id);
    if (!rec) {
      // If not in cache yet, fetch
      const { data } = await supabase.from('brand_onboarding').select('*').eq('id', id).single();
      if (data) {
        setCurrentRecord(data as OnboardingRecord);
        setBrandName(data.brand_name || '');
        setBrandDomain(data.brand_domain || '');
        setNotes(data.notes || '');
      }
    } else {
      setCurrentRecord(rec);
      setBrandName(rec.brand_name || '');
      setBrandDomain(rec.brand_domain || '');
      setNotes(rec.notes || '');
    }

    setCurrentId(id);
    localStorage.setItem('onboarding-last-id', id);

    const { data: taskData } = await supabase
      .from('brand_onboarding_tasks')
      .select('*')
      .eq('onboarding_id', id)
      .order('task_number', { ascending: true });
    setTasks(taskData || []);
  }

  // ─── Create new ───
  function openCreateWizard() {
    setWizardType('creator');
    setWizardWidget(false);
    setWizardStep(1);
    setShowCreateWizard(true);
  }

  async function finishCreate() {
    setShowCreateWizard(false);

    const isWidget = wizardType === 'brand' && wizardWidget;
    const { data, error } = await supabase
      .from('brand_onboarding')
      .insert({
        brand_name: wizardType === 'creator' ? 'משפיען חדש' : 'מותג חדש',
        brand_domain: '',
        notes: '',
        status: 'in_progress',
        account_type: wizardType,
        wants_widget: isWidget,
      })
      .select()
      .single();

    if (error || !data) { showToast('שגיאה ביצירה'); return; }

    // Generate tasks
    const templates = buildTaskList(wizardType, isWidget);
    const rows = templates.map((t, i) => ({
      onboarding_id: data.id,
      task_number: i + 1,
      task_title: t.title,
      section: t.section,
      note: t.note,
      completed: false,
    }));

    await supabase.from('brand_onboarding_tasks').insert(rows);
    await loadChecklists();

    // Need to wait for checklists to refresh, then load
    setCurrentId(data.id);
    setCurrentRecord(data as OnboardingRecord);
    setBrandName(data.brand_name);
    setBrandDomain('');
    setNotes('');
    localStorage.setItem('onboarding-last-id', data.id);

    const { data: taskData } = await supabase
      .from('brand_onboarding_tasks')
      .select('*')
      .eq('onboarding_id', data.id)
      .order('task_number', { ascending: true });
    setTasks(taskData || []);

    showToast('נוצר צ\'קליסט חדש');
  }

  // ─── Delete ───
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

  // ─── Save info (debounced) ───
  const saveRef = useRef<ReturnType<typeof setTimeout>>();
  function saveBrandInfo(name: string, domain: string, noteVal: string) {
    if (!currentId) return;
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      await supabase
        .from('brand_onboarding')
        .update({ brand_name: name, brand_domain: domain, notes: noteVal, updated_at: new Date().toISOString() })
        .eq('id', currentId);
    }, 800);
  }

  // ─── Task click ───
  function handleTaskClick(taskNum: number) {
    const existing = tasks.find(t => t.task_number === taskNum);
    if (existing?.completed) {
      if (confirm('לבטל את הסימון של משימה זו?')) uncheckTask(taskNum);
      return;
    }
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
    if (!personName.trim()) { nameInputRef.current?.focus(); return; }
    if (!currentId || pendingTaskNum === null) return;

    localStorage.setItem('onboarding-user-name', personName.trim());
    const now = new Date().toISOString();

    await supabase
      .from('brand_onboarding_tasks')
      .update({ completed: true, completed_by: personName.trim(), completed_at: now })
      .eq('onboarding_id', currentId)
      .eq('task_number', pendingTaskNum);

    const updated = tasks.map(t =>
      t.task_number === pendingTaskNum ? { ...t, completed: true, completed_by: personName.trim(), completed_at: now } : t
    );
    setTasks(updated);
    setModalOpen(false);
    setPendingTaskNum(null);

    if (updated.every(t => t.completed)) {
      await supabase.from('brand_onboarding').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', currentId);
      showToast('כל המשימות הושלמו!');
    }
  }

  // ─── Progress ───
  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // ─── Group tasks by section ───
  const sections: { key: string; title: string; tasks: TaskRecord[] }[] = [];
  const sectionMap = new Map<string, TaskRecord[]>();
  const sectionTitles = new Map<string, string>();

  // Build from templates for section titles
  if (currentRecord) {
    const templates = buildTaskList(currentRecord.account_type, currentRecord.wants_widget);
    templates.forEach(t => { if (!sectionTitles.has(t.section)) sectionTitles.set(t.section, t.sectionTitle); });
  }

  tasks.forEach(t => {
    const sec = t.section || '?';
    if (!sectionMap.has(sec)) sectionMap.set(sec, []);
    sectionMap.get(sec)!.push(t);
  });

  sectionMap.forEach((secTasks, key) => {
    sections.push({ key, title: sectionTitles.get(key) || key, tasks: secTasks });
  });

  // Template lookup for badges
  const templateList = currentRecord
    ? buildTaskList(currentRecord.account_type, currentRecord.wants_widget)
    : [];

  // ─── Summary builder ───
  function buildSummary() {
    const typeLabel = currentRecord?.account_type === 'creator' ? 'משפיען' : 'מותג';
    const lines: string[] = [];
    lines.push(`צ׳קליסט קליטת ${typeLabel}: ${brandName || 'לא צוין'}${brandDomain ? ` (${brandDomain})` : ''}`);
    if (currentRecord?.wants_widget) lines.push('כולל וידג\'ט: כן');
    lines.push('═'.repeat(35));

    let curSec = '';
    for (const task of tasks) {
      if (task.section !== curSec) {
        curSec = task.section || '';
        const secTitle = sectionTitles.get(curSec) || curSec;
        lines.push('');
        lines.push(`[ ${curSec} ${secTitle} ]`);
      }
      const done = task.completed;
      let line = `${done ? '\u2705' : '\u2B1C'} ${task.task_number}. ${task.task_title}`;
      if (done && task.completed_by) {
        const when = task.completed_at ? formatHebDate(new Date(task.completed_at)) : '';
        line += `\n     \u2514 ${task.completed_by}${when ? ' — ' + when : ''}`;
      }
      lines.push(line);
    }

    lines.push('');
    lines.push('═'.repeat(35));
    lines.push(`סה״כ: ${completedCount} / ${totalCount} הושלמו (${progressPct}%)`);
    if (notes) { lines.push(''); lines.push(`הערות: ${notes}`); }
    return lines.join('\n');
  }

  function sendEmail() {
    const subject = encodeURIComponent(`סטטוס קליטה - ${brandName || 'חשבון'}`);
    const body = encodeURIComponent(buildSummary());
    window.open(`mailto:cto@ldrsgroup.com,yoav@ldrsgroup.com?subject=${subject}&body=${body}`, '_blank');
  }
  function sendWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildSummary())}`, '_blank');
  }
  function copyText() {
    navigator.clipboard.writeText(buildSummary()).then(() => showToast('הועתק ללוח!'));
  }

  // ─── Loading ───
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
            <h1 className="font-semibold text-white text-lg">צ&apos;קליסט אונבורדינג</h1>
            {currentRecord && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                currentRecord.account_type === 'creator'
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}>
                {currentRecord.account_type === 'creator' ? 'משפיען' : 'מותג'}
                {currentRecord.wants_widget ? ' + וידג\'ט' : ''}
              </span>
            )}
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
        {/* Selector */}
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
              const typeEmoji = c.account_type === 'creator' ? '\uD83D\uDC64' : '\uD83C\uDFE2';
              const widgetTag = c.wants_widget ? ' +Widget' : '';
              const statusTag = c.status === 'completed' ? ' [הושלם]' : '';
              return (
                <option key={c.id} value={c.id}>
                  {typeEmoji} {c.brand_name || 'ללא שם'} — {c.brand_domain || ''} ({date}){widgetTag}{statusTag}
                </option>
              );
            })}
          </select>
          <button
            onClick={openCreateWizard}
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
            </button>
          )}
        </div>

        {/* Checklist content */}
        {currentId && currentRecord && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Info header */}
            <div className="admin-card p-5 mb-6 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border-indigo-500/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">
                    {currentRecord.account_type === 'creator' ? 'שם המשפיען' : 'שם המותג'}
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => { setBrandName(e.target.value); saveBrandInfo(e.target.value, brandDomain, notes); }}
                    placeholder={currentRecord.account_type === 'creator' ? 'למשל: נועה קירל' : 'למשל: ארגניה'}
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white font-semibold text-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">
                    {currentRecord.account_type === 'creator' ? 'שם משתמש (Instagram)' : 'דומיין / אתר'}
                  </label>
                  <input
                    type="text"
                    value={brandDomain}
                    onChange={(e) => { setBrandDomain(e.target.value); saveBrandInfo(brandName, e.target.value, notes); }}
                    placeholder={currentRecord.account_type === 'creator' ? '@username' : 'example.co.il'}
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

            {/* Task sections */}
            {sections.map(sec => (
              <div key={sec.key} className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center">
                    {sec.key}
                  </span>
                  <span className="text-sm font-semibold text-gray-400">{sec.title}</span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>
                <div className="space-y-2">
                  {sec.tasks.map(task => {
                    const tpl = templateList.find(t => t.title === task.task_title);
                    const badges = tpl?.badges || [];

                    return (
                      <div
                        key={task.task_number}
                        onClick={() => handleTaskClick(task.task_number)}
                        className={`admin-card p-4 cursor-pointer transition-all hover:border-indigo-500/40 ${task.completed ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-bold text-gray-600 mt-1 min-w-[20px] text-center">{task.task_number}</span>
                          <div className={`w-5 h-5 mt-0.5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                            task.completed ? 'bg-indigo-500 border-indigo-500' : 'border-gray-600'
                          }`}>
                            {task.completed && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-semibold ${task.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                              {task.task_title}
                            </div>
                            {badges.length > 0 && (
                              <div className="flex gap-1.5 mt-1 flex-wrap">
                                {badges.map((b, i) => (
                                  <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${BC[b.color] || 'bg-gray-700 text-gray-300'}`}>
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            {task.note && <p className="text-[11px] text-gray-500 mt-1">{task.note}</p>}
                            {task.completed && task.completed_by && (
                              <p className="text-[11px] text-indigo-400 font-medium mt-1.5">
                                {task.completed_by}
                                {task.completed_at && ` — ${formatHebDate(new Date(task.completed_at))}`}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Notes */}
            <div className="admin-card p-5 mt-8">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">הערות</h3>
              <textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); saveBrandInfo(brandName, brandDomain, e.target.value); }}
                placeholder="הערות, בעיות, דברים לזכור..."
                className="w-full min-h-[80px] px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            </div>

            {/* Send */}
            <div className="admin-card p-5 mt-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">שליחת סטטוס</h3>
              <div className="flex gap-3 flex-wrap">
                <button onClick={sendEmail} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-all">
                  <Send className="w-4 h-4" /> מייל
                </button>
                <button onClick={sendWhatsApp} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-xl transition-all">
                  <MessageCircle className="w-4 h-4" /> וואטסאפ
                </button>
                <button onClick={copyText} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-xl transition-all">
                  <Copy className="w-4 h-4" /> העתק
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
            <h2 className="text-lg font-semibold text-white mb-2">צ&apos;קליסט אונבורדינג</h2>
            <p className="text-sm text-gray-500 mb-6">מעקב קליטת משפיענים ומותגים למערכת</p>
            <button
              onClick={openCreateWizard}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25"
            >
              <Plus className="w-5 h-5" />
              צור צ&apos;קליסט חדש
            </button>
          </div>
        )}
      </main>

      {/* ═══ Create Wizard Modal ═══ */}
      <AnimatePresence>
        {showCreateWizard && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateWizard(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-[90%] max-w-[440px] shadow-2xl"
            >
              {/* Step 1: Choose type */}
              {wizardStep === 1 && (
                <>
                  <h3 className="text-lg font-bold text-white mb-2">צ&apos;קליסט חדש</h3>
                  <p className="text-sm text-gray-400 mb-5">מה סוג החשבון?</p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <button
                      onClick={() => setWizardType('creator')}
                      className={`p-4 rounded-xl border-2 transition-all text-center ${
                        wizardType === 'creator'
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <User className={`w-8 h-8 mx-auto mb-2 ${wizardType === 'creator' ? 'text-indigo-400' : 'text-gray-500'}`} />
                      <div className={`text-sm font-semibold ${wizardType === 'creator' ? 'text-white' : 'text-gray-400'}`}>משפיען</div>
                      <div className="text-[11px] text-gray-500 mt-1">Creator / Instagram</div>
                    </button>
                    <button
                      onClick={() => setWizardType('brand')}
                      className={`p-4 rounded-xl border-2 transition-all text-center ${
                        wizardType === 'brand'
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <Building2 className={`w-8 h-8 mx-auto mb-2 ${wizardType === 'brand' ? 'text-emerald-400' : 'text-gray-500'}`} />
                      <div className={`text-sm font-semibold ${wizardType === 'brand' ? 'text-white' : 'text-gray-400'}`}>מותג</div>
                      <div className="text-[11px] text-gray-500 mt-1">Brand / אתר</div>
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (wizardType === 'brand') {
                          setWizardStep(2);
                        } else {
                          setWizardWidget(false);
                          finishCreate();
                        }
                      }}
                      className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all"
                    >
                      {wizardType === 'brand' ? 'המשך' : 'צור צ\'קליסט'}
                    </button>
                    <button onClick={() => setShowCreateWizard(false)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 font-semibold rounded-xl transition-all">
                      ביטול
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Widget? (brand only) */}
              {wizardStep === 2 && (
                <>
                  <h3 className="text-lg font-bold text-white mb-2">הגדרות מותג</h3>
                  <p className="text-sm text-gray-400 mb-5">האם המותג צריך וידג&apos;ט באתר?</p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <button
                      onClick={() => setWizardWidget(true)}
                      className={`p-4 rounded-xl border-2 transition-all text-center ${
                        wizardWidget
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <Monitor className={`w-8 h-8 mx-auto mb-2 ${wizardWidget ? 'text-emerald-400' : 'text-gray-500'}`} />
                      <div className={`text-sm font-semibold ${wizardWidget ? 'text-white' : 'text-gray-400'}`}>כן, עם וידג&apos;ט</div>
                      <div className="text-[11px] text-gray-500 mt-1">צ&apos;אט מוטמע באתר</div>
                    </button>
                    <button
                      onClick={() => setWizardWidget(false)}
                      className={`p-4 rounded-xl border-2 transition-all text-center ${
                        !wizardWidget
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <MessageCircle className={`w-8 h-8 mx-auto mb-2 ${!wizardWidget ? 'text-indigo-400' : 'text-gray-500'}`} />
                      <div className={`text-sm font-semibold ${!wizardWidget ? 'text-white' : 'text-gray-400'}`}>לא, רק צ&apos;אט</div>
                      <div className="text-[11px] text-gray-500 mt-1">ללא הטמעת וידג&apos;ט</div>
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={finishCreate} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all">
                      צור צ&apos;קליסט
                    </button>
                    <button onClick={() => setWizardStep(1)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 font-semibold rounded-xl transition-all">
                      חזרה
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Task Confirm Modal ═══ */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => { setModalOpen(false); setPendingTaskNum(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
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
                {tasks.find(t => t.task_number === pendingTaskNum)?.task_title}
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
                <button onClick={confirmTask} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all">
                  אישור
                </button>
                <button onClick={() => { setModalOpen(false); setPendingTaskNum(null); }} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 font-semibold rounded-xl transition-all">
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
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-gray-800 text-white text-sm font-medium rounded-xl shadow-xl border border-gray-700"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
