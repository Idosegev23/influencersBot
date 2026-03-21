'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
  section_title: string | null;
  note: string | null;
  badges: { label: string; color: string }[] | null;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
}

// ─── Badge colors (neon pastel pills) ───
const BC: Record<string, string> = {
  data: 'bg-[#B0E0FF]/20 text-[#3b82c8]',
  admin: 'bg-[#FF76B0]/15 text-[#d64580]',
  content: 'bg-[#69FFC7]/15 text-[#2d8a62]',
  scan: 'bg-[#69FFC7]/20 text-[#2d8a62]',
  local: 'bg-[#69FFC7]/20 text-[#2d8a62]',
  ai: 'bg-[#AEB0E8]/20 text-[#6b6db0]',
  persona: 'bg-[#FF76B0]/15 text-[#d64580]',
  policy: 'bg-[#FF76B0]/20 text-[#d64580]',
  ux: 'bg-[#FFD9B0]/30 text-[#b07830]',
  design: 'bg-[#AEB0E8]/20 text-[#6b6db0]',
  test: 'bg-[#FFD9B0]/30 text-[#b07830]',
  deploy: 'bg-[#FF76B0]/15 text-[#d64580]',
  social: 'bg-[#B0E0FF]/20 text-[#3b82c8]',
  brands: 'bg-[#FFD9B0]/30 text-[#b07830]',
  graphic: 'bg-[#AEB0E8]/15 text-[#6b6db0]',
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
    tasks.push({
      title: 'הוספת לוגו למותגים שהתגלו בסריקה',
      badges: [{ label: 'מותגים', color: 'brands' }, { label: 'גרפיקה', color: 'graphic' }],
      note: 'טבלת brand_logos — לבדוק אם הלוגו כבר קיים לפני הוספה',
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

// ─── Asset display config (icon = Material Symbols name) ───
const ASSET_OPTIONS: { key: keyof DigitalAssets; label: string; icon: string; desc: string }[] = [
  { key: 'instagram', label: 'Instagram', icon: 'photo_camera', desc: 'חשבון אינסטגרם' },
  { key: 'website', label: 'אתר', icon: 'language', desc: 'אתר אינטרנט' },
  { key: 'tiktok', label: 'TikTok', icon: 'movie', desc: 'חשבון טיקטוק' },
  { key: 'youtube', label: 'YouTube', icon: 'play_circle', desc: 'ערוץ יוטיוב' },
  { key: 'facebook', label: 'Facebook', icon: 'group', desc: 'עמוד פייסבוק' },
  { key: 'documents', label: 'מסמכים', icon: 'description', desc: 'PDF, קטלוג, FAQ' },
];

// ─── Section icons ───
const SECTION_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  A: { icon: 'inventory_2', color: '#3b82c8', bg: 'rgba(176, 224, 255, 0.25)' },
  B: { icon: 'radar', color: '#2d8a62', bg: 'rgba(105, 255, 199, 0.15)' },
  C: { icon: 'smart_toy', color: '#6b6db0', bg: 'rgba(174, 176, 232, 0.2)' },
  D: { icon: 'widgets', color: '#d64580', bg: 'rgba(255, 118, 176, 0.15)' },
  E: { icon: 'bug_report', color: '#b07830', bg: 'rgba(255, 217, 176, 0.3)' },
  F: { icon: 'verified', color: '#69FFC7', bg: 'rgba(105, 255, 199, 0.15)' },
};

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
      section_title: t.sectionTitle,
      note: t.note,
      badges: t.badges,
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
  const saveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
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

  tasks.forEach(t => {
    const s = t.section || '?';
    if (!sectionMap.has(s)) sectionMap.set(s, []);
    sectionMap.get(s)!.push(t);
    if (t.section_title && !sectionTitles.has(s)) sectionTitles.set(s, t.section_title);
  });

  if (currentRecord && sectionTitles.size === 0) {
    const tpls = buildTaskList(currentRecord.digital_assets || DEFAULT_ASSETS, currentRecord.wants_widget);
    tpls.forEach(t => { if (!sectionTitles.has(t.section)) sectionTitles.set(t.section, t.sectionTitle); });
  }

  sectionMap.forEach((st, key) => sections.push({ key, title: sectionTitles.get(key) || key, tasks: st }));

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

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-[#AEB0E8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* ─── Page Header ─── */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(174, 176, 232, 0.15)' }}>
            <span className="material-symbols-outlined text-[28px]" style={{ color: '#AEB0E8' }}>checklist</span>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight font-headline" style={{ color: '#373226' }}>
              אונבורדינג לקוחות
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#655e51' }}>
              מעקב קליטת לקוחות למערכת
              {currentRecord && (
                <span className="mr-2" style={{ color: '#bab1a1' }}>
                  {assetTags(currentRecord.digital_assets || DEFAULT_ASSETS)}
                  {currentRecord.wants_widget ? ' + Widget' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openWizard}
            className="neon-pill neon-pill-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            צ&apos;קליסט חדש
          </button>
        </div>
      </div>

      {/* ─── Stats Bento Grid ─── */}
      <div className="grid grid-cols-12 gap-4 mb-8">
        {/* Main stat card */}
        <div className="col-span-8 neon-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px]" style={{ color: '#655e51' }}>analytics</span>
              <span className="text-sm font-semibold" style={{ color: '#373226' }}>התקדמות</span>
            </div>
            {currentRecord && (
              <span
                className="text-xs font-bold px-3 py-1 rounded-full"
                style={currentRecord.status === 'completed'
                  ? { background: 'rgba(105, 255, 199, 0.15)', color: '#2d8a62' }
                  : { background: 'rgba(174, 176, 232, 0.15)', color: '#6b6db0' }
                }
              >
                {currentRecord.status === 'completed' ? 'הושלם' : 'בתהליך'}
              </span>
            )}
          </div>
          {currentId ? (
            <>
              <div className="flex items-end gap-3 mb-3">
                <span className="text-4xl font-extrabold font-headline" style={{ color: '#373226' }}>{progressPct}%</span>
                <span className="text-sm mb-1.5" style={{ color: '#bab1a1' }}>{completedCount} / {totalCount} משימות</span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: '#faf2e9' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #69FFC7, #AEB0E8)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: '#bab1a1' }}>בחר צ&apos;קליסט להצגת התקדמות</p>
          )}
        </div>

        {/* Accent card */}
        <div className="col-span-4 neon-card p-6 flex flex-col justify-between" style={{ background: 'rgba(174, 176, 232, 0.08)' }}>
          <span className="material-symbols-outlined text-[24px] mb-3" style={{ color: '#AEB0E8' }}>folder_open</span>
          <div>
            <span className="text-3xl font-extrabold font-headline" style={{ color: '#373226' }}>{checklists.length}</span>
            <p className="text-xs mt-1" style={{ color: '#655e51' }}>סה״כ צ&apos;קליסטים</p>
          </div>
        </div>
      </div>

      {/* ─── Checklist Selector ─── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={currentId || ''}
          onChange={(e) => { if (e.target.value) loadChecklist(e.target.value); else { setCurrentId(null); setCurrentRecord(null); setTasks([]); } }}
          className="neon-input flex-1 min-w-[200px]"
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
        {currentId && (
          <button
            onClick={deleteChecklist}
            className="neon-pill neon-pill-danger flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            מחק
          </button>
        )}
      </div>

      {/* ═══ Content ═══ */}
      {currentId && currentRecord && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {/* Brand Info Card */}
          <div className="neon-card p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold mb-1.5 mr-1" style={{ color: '#655e51' }}>שם הלקוח</label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => { setBrandName(e.target.value); saveBrandInfo(e.target.value, brandDomain, notes); }}
                  placeholder="שם הלקוח"
                  className="neon-input w-full text-lg font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 mr-1" style={{ color: '#655e51' }}>Handle / דומיין</label>
                <input
                  type="text"
                  value={brandDomain}
                  onChange={(e) => { setBrandDomain(e.target.value); saveBrandInfo(brandName, e.target.value, notes); }}
                  placeholder="@handle או domain.com"
                  dir="ltr"
                  className="neon-input w-full"
                />
              </div>
            </div>
          </div>

          {/* Sections (Accordion) */}
          <div className="neon-card p-6 mb-6">
            <div className="space-y-4">
              {sections.map(sec => {
                const secDone = sec.tasks.filter(t => t.completed).length;
                const secTotal = sec.tasks.length;
                const secPct = secTotal > 0 ? Math.round((secDone / secTotal) * 100) : 0;
                const secStyle = SECTION_ICONS[sec.key] || { icon: 'task_alt', color: '#655e51', bg: 'rgba(186, 177, 161, 0.15)' };

                return (
                  <details key={sec.key} className="group" open>
                    <summary className="flex items-center gap-3 cursor-pointer select-none list-none py-3 px-2 rounded-xl hover:bg-[#faf2e9]/60 transition-colors">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: secStyle.bg }}
                      >
                        <span className="material-symbols-outlined text-[20px]" style={{ color: secStyle.color }}>{secStyle.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: '#373226' }}>{sec.key}. {sec.title}</span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#faf2e9', color: '#655e51' }}>
                            {secDone}/{secTotal}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: '#faf2e9' }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${secPct}%`,
                              background: secPct === 100 ? '#69FFC7' : `linear-gradient(90deg, ${secStyle.color}88, ${secStyle.color})`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-[20px] transition-transform group-open:rotate-180" style={{ color: '#bab1a1' }}>
                        expand_more
                      </span>
                    </summary>

                    <div className="mt-2 mr-12 space-y-1.5">
                      {sec.tasks.map(task => {
                        const badges = task.badges || [];
                        return (
                          <div
                            key={task.task_number}
                            onClick={() => handleTaskClick(task.task_number)}
                            className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all hover:bg-[#faf2e9]/80 ${task.completed ? 'opacity-60' : ''}`}
                          >
                            {/* Checkbox */}
                            <div
                              className="w-5 h-5 mt-0.5 rounded-md flex-shrink-0 border-2 flex items-center justify-center transition-all"
                              style={task.completed
                                ? { background: '#AEB0E8', borderColor: '#AEB0E8' }
                                : { borderColor: '#ddd5c8' }
                              }
                            >
                              {task.completed && (
                                <span className="material-symbols-outlined text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-semibold ${task.completed ? 'line-through' : ''}`} style={{ color: task.completed ? '#bab1a1' : '#373226' }}>
                                {task.task_title}
                              </div>
                              {badges.length > 0 && (
                                <div className="flex gap-1.5 mt-1 flex-wrap">
                                  {badges.map((b, i) => (
                                    <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${BC[b.color] || 'bg-[#faf2e9] text-[#655e51]'}`}>
                                      {b.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {task.note && (
                                <p className="text-[11px] mt-1" style={{ color: '#bab1a1' }}>{task.note}</p>
                              )}
                              {task.completed && task.completed_by && (
                                <p className="text-[11px] font-medium mt-1.5" style={{ color: '#AEB0E8' }}>
                                  {task.completed_by}{task.completed_at && ` — ${formatHebDate(new Date(task.completed_at))}`}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="neon-card p-6 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px]" style={{ color: '#655e51' }}>notes</span>
              <h3 className="text-sm font-bold" style={{ color: '#373226' }}>הערות</h3>
            </div>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); saveBrandInfo(brandName, brandDomain, e.target.value); }}
              placeholder="הערות, בעיות, דברים לזכור..."
              className="neon-input w-full min-h-[80px] resize-y"
              style={{ borderRadius: '1rem' }}
            />
          </div>

          {/* Send Footer */}
          <div className="neon-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[18px]" style={{ color: '#655e51' }}>send</span>
              <h3 className="text-sm font-bold" style={{ color: '#373226' }}>שליחת סטטוס</h3>
            </div>
            <div className="flex gap-3 flex-wrap">
              <button onClick={sendEmail} className="neon-pill neon-pill-outline flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 text-sm font-semibold">
                <span className="material-symbols-outlined text-[18px]">mail</span>
                מייל
              </button>
              <button onClick={sendWhatsApp} className="neon-pill neon-pill-outline flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 text-sm font-semibold">
                <span className="material-symbols-outlined text-[18px]">phone_android</span>
                וואטסאפ
              </button>
              <button onClick={copyText} className="neon-pill neon-pill-outline flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 text-sm font-semibold">
                <span className="material-symbols-outlined text-[18px]">content_copy</span>
                העתק
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Empty state ─── */}
      {!currentId && (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(174, 176, 232, 0.12)' }}>
            <span className="material-symbols-outlined text-[40px]" style={{ color: '#AEB0E8' }}>checklist</span>
          </div>
          <h2 className="text-xl font-extrabold mb-2 font-headline" style={{ color: '#373226' }}>צ&apos;קליסט אונבורדינג</h2>
          <p className="text-sm mb-6" style={{ color: '#655e51' }}>בחר צ&apos;קליסט קיים או צור חדש להתחיל מעקב</p>
          <button onClick={openWizard} className="neon-pill neon-pill-primary inline-flex items-center gap-2 px-7 py-3 font-bold text-base">
            <span className="material-symbols-outlined text-[20px]">add</span>
            צור צ&apos;קליסט חדש
          </button>
        </div>
      )}

      {/* ═══ Create Wizard Modal ═══ */}
      <AnimatePresence>
        {showWizard && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowWizard(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="neon-card p-8 w-[90%] max-w-[480px] shadow-2xl"
            >
              {/* Step 1: Pick digital assets */}
              {wizStep === 1 && (
                <>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(174, 176, 232, 0.15)' }}>
                      <span className="material-symbols-outlined text-[22px]" style={{ color: '#AEB0E8' }}>inventory_2</span>
                    </div>
                    <h3 className="text-lg font-extrabold font-headline" style={{ color: '#373226' }}>צ&apos;קליסט חדש</h3>
                  </div>
                  <p className="text-sm mb-5 mr-[52px]" style={{ color: '#655e51' }}>מה הנכסים הדיגיטליים של הלקוח?</p>
                  <div className="grid grid-cols-2 gap-2.5 mb-6">
                    {ASSET_OPTIONS.map(opt => {
                      const active = wizAssets[opt.key];
                      return (
                        <button
                          key={opt.key}
                          onClick={() => toggleAsset(opt.key)}
                          className="p-3.5 rounded-xl transition-all text-right"
                          style={active
                            ? { border: '2px solid rgba(174, 176, 232, 0.5)', background: 'rgba(174, 176, 232, 0.08)' }
                            : { border: '2px solid #ede8df', background: '#faf2e9' }
                          }
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-[22px] flex-shrink-0" style={{ color: active ? '#AEB0E8' : '#bab1a1' }}>
                              {opt.icon}
                            </span>
                            <div>
                              <div className="text-sm font-semibold" style={{ color: active ? '#373226' : '#655e51' }}>{opt.label}</div>
                              <div className="text-[11px]" style={{ color: '#bab1a1' }}>{opt.desc}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { if (anyAsset) setWizStep(2); else showToast('בחר לפחות נכס אחד'); }}
                      className={`neon-pill flex-1 py-2.5 font-bold ${anyAsset ? 'neon-pill-primary' : 'neon-pill-ghost opacity-50 cursor-not-allowed'}`}
                    >
                      המשך
                    </button>
                    <button onClick={() => setShowWizard(false)} className="neon-pill neon-pill-ghost flex-1 py-2.5 font-bold">
                      ביטול
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Widget? */}
              {wizStep === 2 && (
                <>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(105, 255, 199, 0.12)' }}>
                      <span className="material-symbols-outlined text-[22px]" style={{ color: '#69FFC7' }}>widgets</span>
                    </div>
                    <h3 className="text-lg font-extrabold font-headline" style={{ color: '#373226' }}>וידג&apos;ט באתר?</h3>
                  </div>
                  <p className="text-sm mb-5 mr-[52px]" style={{ color: '#655e51' }}>האם הלקוח צריך צ&apos;אט מוטמע באתר שלו?</p>
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <button
                      onClick={() => setWizWidget(true)}
                      className="p-5 rounded-xl transition-all text-center"
                      style={wizWidget
                        ? { border: '2px solid rgba(105, 255, 199, 0.5)', background: 'rgba(105, 255, 199, 0.08)' }
                        : { border: '2px solid #ede8df', background: '#faf2e9' }
                      }
                    >
                      <span className="material-symbols-outlined text-[32px] mx-auto mb-2 block" style={{ color: wizWidget ? '#69FFC7' : '#bab1a1' }}>desktop_windows</span>
                      <div className="text-sm font-bold" style={{ color: wizWidget ? '#373226' : '#655e51' }}>כן, עם וידג&apos;ט</div>
                      <div className="text-[11px] mt-1" style={{ color: '#bab1a1' }}>צ&apos;אט מוטמע באתר</div>
                    </button>
                    <button
                      onClick={() => setWizWidget(false)}
                      className="p-5 rounded-xl transition-all text-center"
                      style={!wizWidget
                        ? { border: '2px solid rgba(174, 176, 232, 0.5)', background: 'rgba(174, 176, 232, 0.08)' }
                        : { border: '2px solid #ede8df', background: '#faf2e9' }
                      }
                    >
                      <span className="material-symbols-outlined text-[32px] mx-auto mb-2 block" style={{ color: !wizWidget ? '#AEB0E8' : '#bab1a1' }}>chat_bubble_outline</span>
                      <div className="text-sm font-bold" style={{ color: !wizWidget ? '#373226' : '#655e51' }}>לא</div>
                      <div className="text-[11px] mt-1" style={{ color: '#bab1a1' }}>ללא וידג&apos;ט</div>
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={finishCreate} className="neon-pill neon-pill-primary flex-1 py-2.5 font-bold">
                      צור צ&apos;קליסט
                    </button>
                    <button onClick={() => setWizStep(1)} className="neon-pill neon-pill-ghost flex-1 py-2.5 font-bold">
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => { setModalOpen(false); setPendingTaskNum(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="neon-card p-8 w-[90%] max-w-[400px] shadow-2xl"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-extrabold font-headline" style={{ color: '#373226' }}>
                  סימון משימה #{pendingTaskNum}
                </h3>
                <button
                  onClick={() => { setModalOpen(false); setPendingTaskNum(null); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#faf2e9] transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ color: '#bab1a1' }}>close</span>
                </button>
              </div>
              <p className="text-sm font-semibold mb-5" style={{ color: '#AEB0E8' }}>
                {tasks.find(t => t.task_number === pendingTaskNum)?.task_title}
              </p>

              <label className="block text-xs font-bold mb-1.5 mr-1" style={{ color: '#655e51' }}>מי ביצע?</label>
              <input
                ref={nameInputRef}
                type="text"
                value={personName}
                onChange={e => setPersonName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmTask(); }}
                placeholder="הקלד את שמך..."
                className="neon-input w-full text-base font-medium mb-3"
              />

              <div className="px-4 py-3 rounded-xl text-sm mb-5" style={{ background: '#faf2e9', color: '#655e51' }}>
                <span className="font-bold" style={{ color: '#373226' }}>תאריך ושעה: </span>{formatHebDate(modalNow)}
              </div>

              <div className="flex gap-3">
                <button onClick={confirmTask} className="neon-pill neon-pill-primary flex-1 py-2.5 font-bold">
                  אישור
                </button>
                <button onClick={() => { setModalOpen(false); setPendingTaskNum(null); }} className="neon-pill neon-pill-ghost flex-1 py-2.5 font-bold">
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Toast ─── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full text-sm font-bold shadow-xl"
            style={{ background: '#69FFC7', color: '#1a3a2a' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
