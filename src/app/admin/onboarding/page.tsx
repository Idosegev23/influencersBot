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
  Instagram,
  Globe,
  Monitor,
  FileText,
  Video,
  Youtube,
  Facebook,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ───
interface DigitalAssets {
  instagram: boolean;
  website: boolean;
  tiktok: boolean;
  youtube: boolean;
  facebook: boolean;
  documents: boolean;
}

interface OnboardingRecord {
  id: string;
  brand_name: string;
  brand_domain: string | null;
  notes: string | null;
  status: 'in_progress' | 'completed';
  wants_widget: boolean;
  digital_assets: DigitalAssets;
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
  data: 'bg-blue-500/20 text-blue-300',
  admin: 'bg-red-500/20 text-red-300',
  content: 'bg-cyan-500/20 text-cyan-300',
  scan: 'bg-green-500/20 text-green-300',
  local: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30',
  ai: 'bg-purple-500/20 text-purple-300',
  persona: 'bg-pink-500/20 text-pink-300',
  policy: 'bg-red-500/20 text-red-300',
  ux: 'bg-pink-500/20 text-pink-300',
  design: 'bg-fuchsia-500/20 text-fuchsia-300',
  test: 'bg-amber-500/20 text-amber-300',
  deploy: 'bg-orange-500/20 text-orange-300',
  social: 'bg-indigo-500/20 text-indigo-300',
  brands: 'bg-yellow-500/20 text-yellow-300',
  graphic: 'bg-rose-500/20 text-rose-300',
};

interface TaskTemplate {
  title: string;
  badges: { label: string; color: string }[];
  note: string;
  section: string;
  sectionTitle: string;
}

// ─── Build task list dynamically ───
function buildTaskList(assets: DigitalAssets, wantsWidget: boolean): TaskTemplate[] {
  const tasks: TaskTemplate[] = [];

  // ═══ A: איסוף נכסים דיגיטליים ═══
  const A = 'A';
  const AT = 'איסוף נכסים דיגיטליים';

  tasks.push({
    title: 'יצירת חשבון בסופאבייס + מילוי פרטי לקוח',
    badges: [{ label: 'דאטה', color: 'data' }, { label: 'אדמין', color: 'admin' }],
    note: 'שם, שפה, סוג עסק, לוגו, פרטי קשר',
    section: A, sectionTitle: AT,
  });

  tasks.push({
    title: 'מיפוי כל הנכסים הדיגיטליים של הלקוח',
    badges: [{ label: 'מחקר', color: 'content' }],
    note: 'אינסטגרם, אתר, טיקטוק, יוטיוב, פייסבוק — לתעד הכל',
    section: A, sectionTitle: AT,
  });

  if (assets.instagram) {
    tasks.push({
      title: 'קבלת שם משתמש Instagram + אימות החשבון',
      badges: [{ label: 'סושיאל', color: 'social' }],
      note: '@username — לוודא שהחשבון ציבורי ופעיל',
      section: A, sectionTitle: AT,
    });
  }
  if (assets.website) {
    tasks.push({
      title: 'קבלת כתובת אתר + זיהוי טכנולוגיה',
      badges: [{ label: 'אתר', color: 'scan' }],
      note: 'דומיין מלא, וורדפרס / שופיפיי / ריאקט / אחר',
      section: A, sectionTitle: AT,
    });
  }
  if (assets.tiktok) {
    tasks.push({
      title: 'קבלת לינק TikTok',
      badges: [{ label: 'סושיאל', color: 'social' }],
      note: 'tiktok.com/@handle',
      section: A, sectionTitle: AT,
    });
  }
  if (assets.youtube) {
    tasks.push({
      title: 'קבלת לינק YouTube',
      badges: [{ label: 'סושיאל', color: 'social' }],
      note: 'youtube.com/@channel',
      section: A, sectionTitle: AT,
    });
  }
  if (assets.facebook) {
    tasks.push({
      title: 'קבלת לינק Facebook',
      badges: [{ label: 'סושיאל', color: 'social' }],
      note: 'facebook.com/page',
      section: A, sectionTitle: AT,
    });
  }
  if (assets.documents) {
    tasks.push({
      title: 'קבלת חומרי רקע מהלקוח (PDF, מסמכים, FAQ)',
      badges: [{ label: 'תוכן', color: 'content' }],
      note: 'קטלוג, מדריכי שימוש, מדיניות החזרות, מידע על החברה',
      section: A, sectionTitle: AT,
    });
  }

  // ═══ B: סריקות ═══
  const B = 'B';
  const BT = 'סריקות';

  if (assets.instagram) {
    tasks.push({
      title: 'סריקת חשבון אינסטגרם (פוסטים, סטוריז, ריליז)',
      badges: [{ label: 'סריקה', color: 'scan' }, { label: 'סושיאל', color: 'social' }],
      note: 'node scripts/scan-account.ts --username HANDLE',
      section: B, sectionTitle: BT,
    });
    tasks.push({
      title: 'וידוא כניסת תמלולים ונתוני IG למאגר',
      badges: [{ label: 'דאטה', color: 'data' }],
      note: 'SELECT count(*) FROM instagram_posts WHERE account_id = \'UUID\'',
      section: B, sectionTitle: BT,
    });
    tasks.push({
      title: 'סריקה ושמירת תמונת פרופיל',
      badges: [{ label: 'גרפיקה', color: 'graphic' }, { label: 'דאטה', color: 'data' }],
      note: 'profile_pic_url — וידוא שהתמונה נטענת',
      section: B, sectionTitle: BT,
    });
    tasks.push({
      title: 'וידוא תקינות קופונים ומותגים משויכים',
      badges: [{ label: 'מותגים', color: 'brands' }],
      note: 'טבלת coupons + partnerships',
      section: B, sectionTitle: BT,
    });
  }

  if (assets.website) {
    tasks.push({
      title: 'הרצת סריקה מקומית של האתר (deep-scrape)',
      badges: [{ label: 'סריקה', color: 'scan' }, { label: 'לוקאלי', color: 'local' }],
      note: 'node scripts/deep-scrape-website.mjs --url https://domain --account-id UUID',
      section: B, sectionTitle: BT,
    });
    tasks.push({
      title: 'וידוא שכל העמודים נשמרו ב-DB',
      badges: [{ label: 'דאטה', color: 'data' }, { label: 'סריקה', color: 'scan' }],
      note: 'SELECT count(*) FROM website_pages WHERE account_id = \'UUID\'',
      section: B, sectionTitle: BT,
    });
    tasks.push({
      title: 'יצירת RAG chunks מתוכן האתר (וקטורים)',
      badges: [{ label: 'AI / RAG', color: 'ai' }, { label: 'לוקאלי', color: 'local' }],
      note: 'SELECT count(*) FROM rag_chunks WHERE account_id = \'UUID\'',
      section: B, sectionTitle: BT,
    });
  }

  if (assets.documents) {
    tasks.push({
      title: 'העלאה ופרסור מסמכי לקוח דרך AI Parser',
      badges: [{ label: 'AI', color: 'ai' }, { label: 'תוכן', color: 'content' }],
      note: 'GPT-5.2 → Gemini 3 fallback. בדיקת confidence > 0.7',
      section: B, sectionTitle: BT,
    });
  }

  if (assets.tiktok) {
    tasks.push({
      title: 'איסוף נתוני TikTok (ידני / סריקה)',
      badges: [{ label: 'סריקה', color: 'scan' }, { label: 'סושיאל', color: 'social' }],
      note: 'תוכן עיקרי, מספר עוקבים, נישה',
      section: B, sectionTitle: BT,
    });
  }

  if (assets.youtube) {
    tasks.push({
      title: 'איסוף נתוני YouTube (ידני / סריקה)',
      badges: [{ label: 'סריקה', color: 'scan' }, { label: 'סושיאל', color: 'social' }],
      note: 'סרטונים עיקריים, מנויים, תיאור ערוץ',
      section: B, sectionTitle: BT,
    });
  }

  if (assets.facebook) {
    tasks.push({
      title: 'איסוף נתוני Facebook (ידני / סריקה)',
      badges: [{ label: 'סריקה', color: 'scan' }, { label: 'סושיאל', color: 'social' }],
      note: 'עמוד עסקי, ביקורות, תוכן עיקרי',
      section: B, sectionTitle: BT,
    });
  }

  // ═══ C: פרסונה ═══
  const C = 'C';
  const CT = 'הגדרת צ\'אטבוט (פרסונה)';

  tasks.push({
    title: 'הגדרת פרסונה: טון דיבור, סגנון, שפה, אימוג\'י',
    badges: [{ label: 'AI', color: 'ai' }, { label: 'פרסונה', color: 'persona' }],
    note: '/admin/chatbot-persona/[accountId]',
    section: C, sectionTitle: CT,
  });
  tasks.push({
    title: 'הגדרת גבולות: מה הבוט לא עונה, הפניות, נושאים חסומים',
    badges: [{ label: 'AI', color: 'ai' }, { label: 'מדיניות', color: 'policy' }],
    note: 'לא לתת מחירים, לא להבטיח זמני משלוח, להפנות לטלפון',
    section: C, sectionTitle: CT,
  });
  tasks.push({
    title: 'הגדרת הודעת פתיחה + שאלות מהירות',
    badges: [{ label: 'תוכן', color: 'content' }, { label: 'UX', color: 'ux' }],
    note: 'welcomeMessage + suggested actions',
    section: C, sectionTitle: CT,
  });

  // ═══ D: וידג'ט (אם רוצה) ═══
  if (wantsWidget) {
    const D = 'D';
    const DT = 'הגדרת וידג\'ט';

    tasks.push({
      title: 'הגדרת צבעים לפי מיתוג הלקוח',
      badges: [{ label: 'עיצוב', color: 'design' }],
      note: 'config.widget.primaryColor',
      section: D, sectionTitle: DT,
    });
    tasks.push({
      title: 'הגדרת פונט, מיקום, מצב כהה/בהיר',
      badges: [{ label: 'עיצוב', color: 'design' }],
      note: 'fontFamily, position, darkMode',
      section: D, sectionTitle: DT,
    });
    tasks.push({
      title: 'העלאת לוגו / אוואטר לבועת הצ\'אט',
      badges: [{ label: 'עיצוב', color: 'design' }, { label: 'דאטה', color: 'data' }],
      note: 'config.logo_url',
      section: D, sectionTitle: DT,
    });
    tasks.push({
      title: 'הוספת דומיין ל-CORS whitelist',
      badges: [{ label: 'הטמעה', color: 'deploy' }],
      note: 'Access-Control-Allow-Origin',
      section: D, sectionTitle: DT,
    });
    tasks.push({
      title: 'שליחת קוד הטמעה + הוראות התקנה',
      badges: [{ label: 'הטמעה', color: 'deploy' }, { label: 'תוכן', color: 'content' }],
      note: '<script src=".../widget.js" data-account-id="UUID"></script>',
      section: D, sectionTitle: DT,
    });
  }

  // ═══ E: בדיקות ═══
  const E = 'E';
  const ET = 'בדיקות ואימות';

  tasks.push({
    title: 'בדיקת צ\'אט: שאלה כללית + תשובה מבוססת תוכן',
    badges: [{ label: 'בדיקה', color: 'test' }, { label: 'AI', color: 'ai' }],
    note: 'לפחות 3 שאלות שונות',
    section: E, sectionTitle: ET,
  });
  tasks.push({
    title: 'בדיקת גבולות: שאלה מחוץ לתחום',
    badges: [{ label: 'בדיקה', color: 'test' }, { label: 'מדיניות', color: 'policy' }],
    note: 'הבוט צריך להגיד שהוא לא יודע או להפנות',
    section: E, sectionTitle: ET,
  });
  tasks.push({
    title: 'בדיקות תוכן (איכות ורלוונטיות)',
    badges: [{ label: 'בדיקה', color: 'test' }, { label: 'תוכן', color: 'content' }],
    note: 'לא ממציא מידע, תוכן מדויק',
    section: E, sectionTitle: ET,
  });

  if (wantsWidget) {
    tasks.push({
      title: 'בדיקת עיצוב וידג\'ט: צבעים, RTL, מובייל, דסקטופ',
      badges: [{ label: 'בדיקה', color: 'test' }, { label: 'עיצוב', color: 'design' }],
      note: 'Preview + ישירות על האתר',
      section: E, sectionTitle: ET,
    });
    tasks.push({
      title: 'בדיקת streaming + typing indicator',
      badges: [{ label: 'בדיקה', color: 'test' }],
      note: 'Network tab — NDJSON events: meta → delta → done',
      section: E, sectionTitle: ET,
    });
    tasks.push({
      title: 'אימות: הוידג\'ט עובד על האתר החי',
      badges: [{ label: 'הטמעה', color: 'deploy' }, { label: 'בדיקה', color: 'test' }],
      note: 'לפתוח את האתר, בועה, הודעה, תשובה תקינה',
      section: E, sectionTitle: ET,
    });
  }

  // ═══ F: אישור סופי ═══
  tasks.push({
    title: 'אישור סופי והעברה למערכת הפעילה',
    badges: [{ label: 'אדמין', color: 'admin' }],
    note: 'שינוי סטטוס ל-active, וידוא שהכל תקין',
    section: 'F', sectionTitle: 'אישור סופי',
  });

  return tasks;
}

// ─── Helpers ───
function formatHebDate(date: Date) {
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

const DEFAULT_ASSETS: DigitalAssets = { instagram: false, website: false, tiktok: false, youtube: false, facebook: false, documents: false };

// ─── Asset display config ───
const ASSET_OPTIONS: { key: keyof DigitalAssets; label: string; icon: typeof Instagram; desc: string }[] = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, desc: 'חשבון אינסטגרם' },
  { key: 'website', label: 'אתר', icon: Globe, desc: 'אתר אינטרנט' },
  { key: 'tiktok', label: 'TikTok', icon: Video, desc: 'חשבון טיקטוק' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, desc: 'ערוץ יוטיוב' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, desc: 'עמוד פייסבוק' },
  { key: 'documents', label: 'מסמכים', icon: FileText, desc: 'PDF, קטלוג, FAQ' },
];

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════
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

  // Create wizard
  const [showWizard, setShowWizard] = useState(false);
  const [wizStep, setWizStep] = useState<1 | 2>(1);
  const [wizAssets, setWizAssets] = useState<DigitalAssets>({ ...DEFAULT_ASSETS });
  const [wizWidget, setWizWidget] = useState(false);

  // Task modal
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingTaskNum, setPendingTaskNum] = useState<number | null>(null);
  const [personName, setPersonName] = useState('');
  const [modalNow, setModalNow] = useState(new Date());
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState('');
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  // ─── Auth ───
  useEffect(() => {
    fetch('/api/admin').then(r => r.json()).then(d => { if (!d.authenticated) router.push('/admin'); });
  }, [router]);

  useEffect(() => {
    const saved = localStorage.getItem('onboarding-user-name');
    if (saved) setPersonName(saved);
  }, []);

  // ─── Load list ───
  const loadChecklists = useCallback(async () => {
    const { data } = await supabase.from('brand_onboarding').select('*').order('created_at', { ascending: false });
    setChecklists(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadChecklists(); }, [loadChecklists]);

  useEffect(() => {
    if (checklists.length > 0 && !currentId) {
      const lastId = localStorage.getItem('onboarding-last-id');
      if (lastId && checklists.find(c => c.id === lastId)) loadChecklist(lastId);
    }
  }, [checklists]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load checklist ───
  async function loadChecklist(id: string) {
    let rec = checklists.find(c => c.id === id);
    if (!rec) {
      const { data } = await supabase.from('brand_onboarding').select('*').eq('id', id).single();
      if (data) rec = data as OnboardingRecord;
    }
    if (!rec) return;
    setCurrentRecord(rec);
    setBrandName(rec.brand_name || '');
    setBrandDomain(rec.brand_domain || '');
    setNotes(rec.notes || '');
    setCurrentId(id);
    localStorage.setItem('onboarding-last-id', id);

    const { data: td } = await supabase.from('brand_onboarding_tasks').select('*').eq('onboarding_id', id).order('task_number', { ascending: true });
    setTasks(td || []);
  }

  // ─── Create wizard ───
  function openWizard() {
    setWizAssets({ ...DEFAULT_ASSETS });
    setWizWidget(false);
    setWizStep(1);
    setShowWizard(true);
  }

  function toggleAsset(key: keyof DigitalAssets) {
    setWizAssets(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const anyAsset = Object.values(wizAssets).some(Boolean);

  async function finishCreate() {
    setShowWizard(false);
    const assets = { ...wizAssets };
    const widget = wizWidget;

    const { data, error } = await supabase
      .from('brand_onboarding')
      .insert({
        brand_name: 'לקוח חדש',
        brand_domain: '',
        notes: '',
        status: 'in_progress',
        wants_widget: widget,
        digital_assets: assets,
      })
      .select()
      .single();

    if (error || !data) { showToast('שגיאה ביצירה'); return; }

    const templates = buildTaskList(assets, widget);
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
    setCurrentId(data.id);
    setCurrentRecord(data as OnboardingRecord);
    setBrandName('');
    setBrandDomain('');
    setNotes('');
    localStorage.setItem('onboarding-last-id', data.id);

    const { data: td } = await supabase.from('brand_onboarding_tasks').select('*').eq('onboarding_id', data.id).order('task_number', { ascending: true });
    setTasks(td || []);
    showToast('נוצר צ\'קליסט חדש');
  }

  // ─── Delete ───
  async function deleteChecklist() {
    if (!currentId || !confirm('למחוק את הצ\'קליסט הזה?')) return;
    await supabase.from('brand_onboarding').delete().eq('id', currentId);
    setCurrentId(null); setCurrentRecord(null); setTasks([]);
    localStorage.removeItem('onboarding-last-id');
    await loadChecklists();
    showToast('נמחק');
  }

  // ─── Save info ───
  const saveRef = useRef<ReturnType<typeof setTimeout>>();
  function saveBrandInfo(name: string, domain: string, noteVal: string) {
    if (!currentId) return;
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      await supabase.from('brand_onboarding')
        .update({ brand_name: name, brand_domain: domain, notes: noteVal, updated_at: new Date().toISOString() })
        .eq('id', currentId);
    }, 800);
  }

  // ─── Task click ───
  function handleTaskClick(taskNum: number) {
    const t = tasks.find(t => t.task_number === taskNum);
    if (t?.completed) {
      if (confirm('לבטל את הסימון?')) uncheckTask(taskNum);
      return;
    }
    setPendingTaskNum(taskNum);
    setModalNow(new Date());
    setModalOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }

  async function uncheckTask(n: number) {
    if (!currentId) return;
    await supabase.from('brand_onboarding_tasks').update({ completed: false, completed_by: null, completed_at: null }).eq('onboarding_id', currentId).eq('task_number', n);
    setTasks(prev => prev.map(t => t.task_number === n ? { ...t, completed: false, completed_by: null, completed_at: null } : t));
  }

  async function confirmTask() {
    if (!personName.trim()) { nameInputRef.current?.focus(); return; }
    if (!currentId || pendingTaskNum === null) return;
    localStorage.setItem('onboarding-user-name', personName.trim());
    const now = new Date().toISOString();

    await supabase.from('brand_onboarding_tasks')
      .update({ completed: true, completed_by: personName.trim(), completed_at: now })
      .eq('onboarding_id', currentId).eq('task_number', pendingTaskNum);

    const updated = tasks.map(t => t.task_number === pendingTaskNum ? { ...t, completed: true, completed_by: personName.trim(), completed_at: now } : t);
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

  if (currentRecord) {
    const tpls = buildTaskList(currentRecord.digital_assets || DEFAULT_ASSETS, currentRecord.wants_widget);
    tpls.forEach(t => { if (!sectionTitles.has(t.section)) sectionTitles.set(t.section, t.sectionTitle); });
  }
  tasks.forEach(t => {
    const s = t.section || '?';
    if (!sectionMap.has(s)) sectionMap.set(s, []);
    sectionMap.get(s)!.push(t);
  });
  sectionMap.forEach((st, key) => sections.push({ key, title: sectionTitles.get(key) || key, tasks: st }));

  const templateList = currentRecord ? buildTaskList(currentRecord.digital_assets || DEFAULT_ASSETS, currentRecord.wants_widget) : [];

  // ─── Asset tags display ───
  function assetTags(assets: DigitalAssets) {
    const tags: string[] = [];
    if (assets.instagram) tags.push('IG');
    if (assets.website) tags.push('Web');
    if (assets.tiktok) tags.push('TT');
    if (assets.youtube) tags.push('YT');
    if (assets.facebook) tags.push('FB');
    if (assets.documents) tags.push('Docs');
    return tags.join(' / ');
  }

  // ─── Summary ───
  function buildSummary() {
    const lines: string[] = [];
    const at = currentRecord?.digital_assets ? assetTags(currentRecord.digital_assets) : '';
    lines.push(`צ׳קליסט אונבורדינג: ${brandName || 'לא צוין'}${brandDomain ? ` (${brandDomain})` : ''}`);
    if (at) lines.push(`נכסים: ${at}${currentRecord?.wants_widget ? ' + וידג\'ט' : ''}`);
    lines.push('═'.repeat(35));
    let curSec = '';
    for (const task of tasks) {
      if (task.section !== curSec) {
        curSec = task.section || '';
        lines.push('');
        lines.push(`[ ${curSec} ${sectionTitles.get(curSec) || ''} ]`);
      }
      let line = `${task.completed ? '\u2705' : '\u2B1C'} ${task.task_number}. ${task.task_title}`;
      if (task.completed && task.completed_by) {
        const when = task.completed_at ? formatHebDate(new Date(task.completed_at)) : '';
        line += `\n     \u2514 ${task.completed_by}${when ? ' — ' + when : ''}`;
      }
      lines.push(line);
    }
    lines.push('');
    lines.push('═'.repeat(35));
    lines.push(`סה״כ: ${completedCount} / ${totalCount} (${progressPct}%)`);
    if (notes) { lines.push(''); lines.push(`הערות: ${notes}`); }
    return lines.join('\n');
  }

  function sendEmail() {
    window.open(`mailto:cto@ldrsgroup.com,yoav@ldrsgroup.com?subject=${encodeURIComponent(`אונבורדינג - ${brandName || 'לקוח'}`)}&body=${encodeURIComponent(buildSummary())}`, '_blank');
  }
  function sendWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent(buildSummary())}`, '_blank'); }
  function copyText() { navigator.clipboard.writeText(buildSummary()).then(() => showToast('הועתק!')); }

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
              <span className="text-xs font-medium text-gray-500">
                {assetTags(currentRecord.digital_assets || DEFAULT_ASSETS)}
                {currentRecord.wants_widget ? ' + Widget' : ''}
              </span>
            )}
          </div>
          <Link href="/admin/dashboard" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors">
            <ArrowRight className="w-4 h-4" /> חזרה לדאשבורד
          </Link>
        </div>
      </header>

      <main className="relative z-10 p-6 max-w-3xl mx-auto">
        {/* Selector */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <select
            value={currentId || ''}
            onChange={(e) => { if (e.target.value) loadChecklist(e.target.value); else { setCurrentId(null); setCurrentRecord(null); setTasks([]); } }}
            className="flex-1 min-w-[200px] px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">בחר צ&apos;קליסט...</option>
            {checklists.map(c => {
              const date = new Date(c.created_at).toLocaleDateString('he-IL');
              const at = c.digital_assets ? assetTags(c.digital_assets) : '';
              return (
                <option key={c.id} value={c.id}>
                  {c.brand_name || 'ללא שם'} — {at}{c.wants_widget ? ' +W' : ''} ({date}) {c.status === 'completed' ? '[V]' : ''}
                </option>
              );
            })}
          </select>
          <button onClick={openWizard} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25">
            <Plus className="w-4 h-4" /> חדש
          </button>
          {currentId && (
            <button onClick={deleteChecklist} className="px-3 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ═══ Content ═══ */}
        {currentId && currentRecord && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Info */}
            <div className="admin-card p-5 mb-6 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border-indigo-500/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">שם הלקוח</label>
                  <input type="text" value={brandName} onChange={(e) => { setBrandName(e.target.value); saveBrandInfo(e.target.value, brandDomain, notes); }} placeholder="שם הלקוח" className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white font-semibold text-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">Handle / דומיין</label>
                  <input type="text" value={brandDomain} onChange={(e) => { setBrandDomain(e.target.value); saveBrandInfo(brandName, e.target.value, notes); }} placeholder="@handle או domain.com" dir="ltr" className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white font-medium placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-400">{completedCount} / {totalCount}</span>
              <span className="text-sm font-medium text-gray-400">{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full mb-8 overflow-hidden">
              <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.4 }} />
            </div>

            {/* Sections */}
            {sections.map(sec => (
              <div key={sec.key} className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center">{sec.key}</span>
                  <span className="text-sm font-semibold text-gray-400">{sec.title}</span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>
                <div className="space-y-2">
                  {sec.tasks.map(task => {
                    const tpl = templateList.find(t => t.title === task.task_title);
                    const badges = tpl?.badges || [];
                    return (
                      <div key={task.task_number} onClick={() => handleTaskClick(task.task_number)} className={`admin-card p-4 cursor-pointer transition-all hover:border-indigo-500/40 ${task.completed ? 'opacity-50' : ''}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-bold text-gray-600 mt-1 min-w-[20px] text-center">{task.task_number}</span>
                          <div className={`w-5 h-5 mt-0.5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${task.completed ? 'bg-indigo-500 border-indigo-500' : 'border-gray-600'}`}>
                            {task.completed && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-semibold ${task.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>{task.task_title}</div>
                            {badges.length > 0 && (
                              <div className="flex gap-1.5 mt-1 flex-wrap">
                                {badges.map((b, i) => (
                                  <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${BC[b.color] || 'bg-gray-700 text-gray-300'}`}>{b.label}</span>
                                ))}
                              </div>
                            )}
                            {task.note && <p className="text-[11px] text-gray-500 mt-1">{task.note}</p>}
                            {task.completed && task.completed_by && (
                              <p className="text-[11px] text-indigo-400 font-medium mt-1.5">
                                {task.completed_by}{task.completed_at && ` — ${formatHebDate(new Date(task.completed_at))}`}
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
              <textarea value={notes} onChange={(e) => { setNotes(e.target.value); saveBrandInfo(brandName, brandDomain, e.target.value); }} placeholder="הערות, בעיות, דברים לזכור..." className="w-full min-h-[80px] px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
            </div>

            {/* Send */}
            <div className="admin-card p-5 mt-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">שליחת סטטוס</h3>
              <div className="flex gap-3 flex-wrap">
                <button onClick={sendEmail} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-all"><Send className="w-4 h-4" /> מייל</button>
                <button onClick={sendWhatsApp} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-xl transition-all"><MessageCircle className="w-4 h-4" /> וואטסאפ</button>
                <button onClick={copyText} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-xl transition-all"><Copy className="w-4 h-4" /> העתק</button>
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
            <p className="text-sm text-gray-500 mb-6">מעקב קליטת לקוחות למערכת</p>
            <button onClick={openWizard} className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25">
              <Plus className="w-5 h-5" /> צור צ&apos;קליסט חדש
            </button>
          </div>
        )}
      </main>

      {/* ═══ Create Wizard ═══ */}
      <AnimatePresence>
        {showWizard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowWizard(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-[90%] max-w-[480px] shadow-2xl">

              {/* Step 1: Pick digital assets */}
              {wizStep === 1 && (
                <>
                  <h3 className="text-lg font-bold text-white mb-1">צ&apos;קליסט חדש</h3>
                  <p className="text-sm text-gray-400 mb-5">מה הנכסים הדיגיטליים של הלקוח?</p>
                  <div className="grid grid-cols-2 gap-2.5 mb-5">
                    {ASSET_OPTIONS.map(opt => {
                      const active = wizAssets[opt.key];
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => toggleAsset(opt.key)}
                          className={`p-3.5 rounded-xl border-2 transition-all text-right ${
                            active ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-indigo-400' : 'text-gray-500'}`} />
                            <div>
                              <div className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-400'}`}>{opt.label}</div>
                              <div className="text-[11px] text-gray-500">{opt.desc}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { if (anyAsset) setWizStep(2); else showToast('בחר לפחות נכס אחד'); }}
                      className={`flex-1 px-4 py-2.5 font-semibold rounded-xl transition-all ${anyAsset ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
                    >
                      המשך
                    </button>
                    <button onClick={() => setShowWizard(false)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 font-semibold rounded-xl transition-all">ביטול</button>
                  </div>
                </>
              )}

              {/* Step 2: Widget? */}
              {wizStep === 2 && (
                <>
                  <h3 className="text-lg font-bold text-white mb-1">וידג&apos;ט באתר?</h3>
                  <p className="text-sm text-gray-400 mb-5">האם הלקוח צריך צ&apos;אט מוטמע באתר שלו?</p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <button onClick={() => setWizWidget(true)} className={`p-4 rounded-xl border-2 transition-all text-center ${wizWidget ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}>
                      <Monitor className={`w-8 h-8 mx-auto mb-2 ${wizWidget ? 'text-emerald-400' : 'text-gray-500'}`} />
                      <div className={`text-sm font-semibold ${wizWidget ? 'text-white' : 'text-gray-400'}`}>כן, עם וידג&apos;ט</div>
                      <div className="text-[11px] text-gray-500 mt-1">צ&apos;אט מוטמע באתר</div>
                    </button>
                    <button onClick={() => setWizWidget(false)} className={`p-4 rounded-xl border-2 transition-all text-center ${!wizWidget ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}>
                      <MessageCircle className={`w-8 h-8 mx-auto mb-2 ${!wizWidget ? 'text-indigo-400' : 'text-gray-500'}`} />
                      <div className={`text-sm font-semibold ${!wizWidget ? 'text-white' : 'text-gray-400'}`}>לא</div>
                      <div className="text-[11px] text-gray-500 mt-1">ללא וידג&apos;ט</div>
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={finishCreate} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all">צור צ&apos;קליסט</button>
                    <button onClick={() => setWizStep(1)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 font-semibold rounded-xl transition-all">חזרה</button>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setModalOpen(false); setPendingTaskNum(null); }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-[90%] max-w-[400px] shadow-2xl">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-white">סימון משימה #{pendingTaskNum}</h3>
                <button onClick={() => { setModalOpen(false); setPendingTaskNum(null); }} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-indigo-400 font-medium mb-5">{tasks.find(t => t.task_number === pendingTaskNum)?.task_title}</p>

              <label className="text-xs font-semibold text-gray-400 mb-1.5 block">מי ביצע?</label>
              <input ref={nameInputRef} type="text" value={personName} onChange={e => setPersonName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmTask(); }} placeholder="הקלד את שמך..." className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-base font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3" />

              <div className="px-4 py-3 bg-gray-800/50 rounded-xl text-sm text-gray-400 mb-5">
                <span className="font-semibold text-gray-300">תאריך ושעה: </span>{formatHebDate(modalNow)}
              </div>

              <div className="flex gap-3">
                <button onClick={confirmTask} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all">אישור</button>
                <button onClick={() => { setModalOpen(false); setPendingTaskNum(null); }} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 font-semibold rounded-xl transition-all">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-gray-800 text-white text-sm font-medium rounded-xl shadow-xl border border-gray-700">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
