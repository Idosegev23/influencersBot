'use client';

import { use, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface ChecklistTask {
  id: string;
  account_id: string;
  task_key: string;
  section: string;
  task_title: string;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  note: string | null;
}

const SECTION_ICONS: Record<string, string> = {
  'הקמת חשבון': 'person_add',
  'חיבורים ואינטגרציות': 'link',
  'סריקות תוכן': 'radar',
  'עיבוד AI': 'psychology',
  'הגדרת צ׳אטבוט': 'smart_toy',
  'וידג׳ט (אם רלוונטי)': 'widgets',
  'בדיקות ואימות': 'verified',
  'אישור סופי והעברה': 'rocket_launch',
};

const SECTION_COLORS: Record<string, string> = {
  'הקמת חשבון': '#9334EB',
  'חיבורים ואינטגרציות': '#2663EB',
  'סריקות תוכן': '#059669',
  'עיבוד AI': '#DC2627',
  'הגדרת צ׳אטבוט': '#b07830',
  'וידג׳ט (אם רלוונטי)': '#6b6db0',
  'בדיקות ואימות': '#3b82c8',
  'אישור סופי והעברה': '#17a34a',
};

export default function AccountChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const accountId = resolvedParams.id;

  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountName, setAccountName] = useState('');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    loadChecklist();
    loadAccountName();
  }, [accountId]);

  async function loadAccountName() {
    try {
      const res = await fetch(`/api/admin/influencers/${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setAccountName(data.influencer?.displayName || data.influencer?.username || '');
      }
    } catch { /* ignore */ }
  }

  async function loadChecklist() {
    try {
      const res = await fetch(`/api/admin/checklist?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error loading checklist:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleTask(task: ChecklistTask) {
    setTogglingId(task.id);
    try {
      const res = await fetch('/api/admin/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          completed: !task.completed,
          completed_by: 'admin',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => prev.map(t => t.id === task.id ? data.task : t));
      }
    } catch (error) {
      console.error('Error toggling task:', error);
    } finally {
      setTogglingId(null);
    }
  }

  async function saveNote(taskId: string) {
    try {
      const res = await fetch('/api/admin/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, note: noteText }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => prev.map(t => t.id === taskId ? data.task : t));
      }
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setEditingNote(null);
      setNoteText('');
    }
  }

  async function resetChecklist() {
    if (!confirm('לאפס את כל הצ׳קליסט? כל הסימונים וההערות יימחקו.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action: 'reset' }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error resetting:', error);
    } finally {
      setLoading(false);
    }
  }

  // Group tasks by section (preserve order)
  const sections = useMemo(() => {
    const map = new Map<string, ChecklistTask[]>();
    tasks.forEach(t => {
      if (!map.has(t.section)) map.set(t.section, []);
      map.get(t.section)!.push(t);
    });
    return Array.from(map.entries());
  }, [tasks]);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-full border-[3px] border-[#9334EB] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/admin/influencers/${accountId}`}
          className="w-11 h-11 flex items-center justify-center rounded-full border border-[#d1d5db]/30 bg-white hover:shadow-md transition-all"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ color: '#474747' }}>arrow_forward</span>
        </Link>

        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-[#474747]">
            צ׳קליסט טכני {accountName && `— ${accountName}`}
          </h1>
          <p className="text-sm text-[#4b5563] mt-0.5">מעקב אחר כל שלבי קליטת הלקוח</p>
        </div>

        <button
          onClick={resetChecklist}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-[#d1d5db]/40 text-[#4b5563] bg-white hover:border-[#DC2627] hover:text-[#DC2627] transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">restart_alt</span>
          איפוס
        </button>
      </div>

      {/* ─── Progress Bar ─── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(147, 52, 235, 0.12)' }}>
              <span className="material-symbols-outlined text-[22px]" style={{ color: '#9334EB' }}>checklist</span>
            </div>
            <div>
              <span className="text-lg font-extrabold text-[#474747]">{completedTasks}</span>
              <span className="text-sm text-[#4b5563] mr-1">/ {totalTasks} משימות</span>
            </div>
          </div>
          <span className="text-2xl font-black" style={{ color: progress === 100 ? '#059669' : '#9334EB' }}>
            {progress}%
          </span>
        </div>
        <div className="h-3 rounded-full bg-[#f3f4f6] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress}%`,
              background: progress === 100
                ? 'linear-gradient(90deg, #059669, #17a34a)'
                : 'linear-gradient(90deg, #9334EB, #2663EB)',
            }}
          />
        </div>
        {progress === 100 && (
          <div className="mt-3 flex items-center gap-2 text-sm font-bold" style={{ color: '#059669' }}>
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            כל המשימות הושלמו — הלקוח מוכן!
          </div>
        )}
      </div>

      {/* ─── Sections ─── */}
      {sections.map(([sectionName, sectionTasks]) => {
        const sectionCompleted = sectionTasks.filter(t => t.completed).length;
        const sectionTotal = sectionTasks.length;
        const sectionDone = sectionCompleted === sectionTotal;
        const icon = SECTION_ICONS[sectionName] || 'task';
        const color = SECTION_COLORS[sectionName] || '#9334EB';

        return (
          <div key={sectionName} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Section header */}
            <div className="px-6 py-4 flex items-center gap-3 border-b border-[#f3f4f6]">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${color}15` }}
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ color, fontVariationSettings: sectionDone ? "'FILL' 1" : undefined }}
                >
                  {sectionDone ? 'check_circle' : icon}
                </span>
              </div>
              <h2 className="text-base font-extrabold text-[#474747] flex-1">{sectionName}</h2>
              <span
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: sectionDone ? 'rgba(5, 150, 105, 0.12)' : 'rgba(147, 52, 235, 0.1)',
                  color: sectionDone ? '#059669' : '#9334EB',
                }}
              >
                {sectionCompleted}/{sectionTotal}
              </span>
            </div>

            {/* Tasks */}
            <div className="divide-y divide-[#f3f4f6]">
              {sectionTasks.map((task) => (
                <div key={task.id} className="px-6 py-3.5 flex items-start gap-3 group hover:bg-[#fafafa] transition-colors">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleTask(task)}
                    disabled={togglingId === task.id}
                    className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all"
                    style={{
                      borderColor: task.completed ? '#059669' : '#d1d5db',
                      backgroundColor: task.completed ? '#059669' : 'transparent',
                    }}
                  >
                    {togglingId === task.id ? (
                      <div className="w-3 h-3 rounded-full border-2 border-[#9334EB] border-t-transparent animate-spin" />
                    ) : task.completed ? (
                      <span className="material-symbols-outlined text-[16px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                    ) : null}
                  </button>

                  {/* Task content */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${task.completed ? 'line-through text-[#d1d5db]' : 'text-[#474747]'}`}>
                      {task.task_title}
                    </div>

                    {/* Note display */}
                    {task.note && editingNote !== task.id && (
                      <div className="mt-1 text-xs text-[#4b5563] bg-[#f3f4f6] rounded-lg px-3 py-1.5 inline-block">
                        {task.note}
                      </div>
                    )}

                    {/* Note editor */}
                    {editingNote === task.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder="הוסף הערה..."
                          className="flex-1 text-sm border border-[#d1d5db]/50 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#9334EB]"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveNote(task.id);
                            if (e.key === 'Escape') { setEditingNote(null); setNoteText(''); }
                          }}
                        />
                        <button
                          onClick={() => saveNote(task.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                          style={{ backgroundColor: '#9334EB' }}
                        >
                          שמור
                        </button>
                        <button
                          onClick={() => { setEditingNote(null); setNoteText(''); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#4b5563] bg-[#f3f4f6]"
                        >
                          ביטול
                        </button>
                      </div>
                    )}

                    {/* Completion info */}
                    {task.completed && task.completed_at && (
                      <div className="mt-1 text-[10px] text-[#d1d5db]">
                        הושלם {new Date(task.completed_at).toLocaleDateString('he-IL')} {task.completed_by && `ע״י ${task.completed_by}`}
                      </div>
                    )}
                  </div>

                  {/* Note button */}
                  {editingNote !== task.id && (
                    <button
                      onClick={() => { setEditingNote(task.id); setNoteText(task.note || ''); }}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-[#f3f4f6]"
                      title="הוסף הערה"
                    >
                      <span className="material-symbols-outlined text-[16px] text-[#4b5563]">
                        {task.note ? 'edit_note' : 'add_comment'}
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ─── Footer spacer ─── */}
      <div className="h-8" />
    </div>
  );
}
