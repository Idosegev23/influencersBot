'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  KeyRound,
  Trash2,
  Link2,
  Check,
  Copy,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { PageHeader } from '@/components/admin/PageHeader';

interface Agent {
  id: string;
  username: string | null;
  full_name: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  status: string;
  managed_account_ids: string[];
  must_change_password: boolean;
  onboarding_completed: boolean;
  last_login_at: string | null;
}

interface AccountOption {
  id: string;
  name: string;
  crmOnly: boolean;
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newAgent, setNewAgent] = useState({ username: '', full_name: '' });
  const [createError, setCreateError] = useState('');
  const [issued, setIssued] = useState<{ username: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingAssign, setSavingAssign] = useState(false);

  const loadAgents = async () => {
    const res = await fetch('/api/admin/agents');
    const data = await res.json();
    setAgents(data.agents || []);
  };

  const loadAccounts = async () => {
    try {
      const res = await fetch('/api/admin/accounts');
      const data = await res.json();
      const list: AccountOption[] = (data.accounts || data || []).map((a: any) => ({
        id: a.id,
        name: a.config?.display_name || a.config?.username || a.display_name || a.username || a.id.slice(0, 8),
        crmOnly: a.config?.crmOnly === true,
      }));
      setAccounts(list);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    Promise.all([loadAgents(), loadAccounts()]).finally(() => setLoading(false));
  }, []);

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!newAgent.username.trim()) {
      setCreateError('שם משתמש נדרש');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAgent),
      });
      const data = await res.json();
      if (res.ok) {
        setIssued(data.credentials);
        setNewAgent({ username: '', full_name: '' });
        loadAgents();
      } else {
        setCreateError(data.error || 'שגיאה');
      }
    } catch {
      setCreateError('שגיאה ביצירה');
    } finally {
      setCreating(false);
    }
  };

  const saveAssignments = async (agentId: string, ids: string[]) => {
    setSavingAssign(true);
    try {
      await fetch(`/api/admin/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managed_account_ids: ids }),
      });
      await loadAgents();
    } finally {
      setSavingAssign(false);
    }
  };

  const resetPassword = async (agentId: string) => {
    const res = await fetch(`/api/admin/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_password: true }),
    });
    const data = await res.json();
    if (res.ok) {
      const agent = agents.find((a) => a.id === agentId);
      setIssued({ username: agent?.username || '', tempPassword: data.credentials.tempPassword });
      loadAgents();
    }
  };

  const toggleStatus = async (agent: Agent) => {
    await fetch(`/api/admin/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: agent.status === 'active' ? 'suspended' : 'active' }),
    });
    loadAgents();
  };

  const deleteAgent = async (agentId: string) => {
    if (!confirm('למחוק את הסוכן? פעולה זו בלתי הפיכה.')) return;
    await fetch(`/api/admin/agents/${agentId}`, { method: 'DELETE' });
    loadAgents();
  };

  const copyCreds = () => {
    if (!issued) return;
    navigator.clipboard.writeText(`שם משתמש: ${issued.username}\nסיסמה: ${issued.tempPassword}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div dir="rtl">
      <PageHeader eyebrow="ניהול" title="סוכנים" description="ניהול סוכני הסוכנות וחשבונות הלקוחות שלהם" />

      {/* Issued credentials banner */}
      {issued && (
        <div className="mb-5 p-4 rounded-xl border border-[color:var(--brand)]/30 bg-[color:var(--brand)]/5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-[color:var(--ink-900)]">פרטי התחברות לסוכן — העבר אליו</div>
              <div className="text-[13px] text-[color:var(--ink-700)] mt-1" dir="ltr">
                שם משתמש: <b>{issued.username}</b> · סיסמה זמנית: <b>{issued.tempPassword}</b>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyCreds} className="ui-btn ui-btn-sm ui-btn-outline gap-1.5">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'הועתק' : 'העתק'}
              </button>
              <button onClick={() => setIssued(null)} className="ui-btn ui-btn-sm ui-btn-ghost">
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create agent */}
      <form
        onSubmit={createAgent}
        className="mb-6 p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-start"
      >
        <input
          className="ui-input"
          placeholder="שם משתמש (אנגלית) *"
          dir="ltr"
          value={newAgent.username}
          onChange={(e) => setNewAgent({ ...newAgent, username: e.target.value })}
        />
        <input
          className="ui-input"
          placeholder="שם מלא / סוכנות"
          value={newAgent.full_name}
          onChange={(e) => setNewAgent({ ...newAgent, full_name: e.target.value })}
        />
        <button type="submit" disabled={creating} className="ui-btn ui-btn-solid gap-1.5">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          צור סוכן
        </button>
        {createError && <div className="sm:col-span-3 text-sm text-[color:var(--danger)]">{createError}</div>}
      </form>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-[color:var(--brand)]" />
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 text-[color:var(--ink-500)]">אין סוכנים עדיין.</div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)]">
              <div className="p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[color:var(--ink-900)]">
                      {agent.full_name || agent.username}
                    </span>
                    <span className="text-[12px] text-[color:var(--ink-500)]" dir="ltr">@{agent.username}</span>
                    {agent.status !== 'active' && (
                      <span className="pill pill-red text-[11px] px-2 py-0.5">מושהה</span>
                    )}
                    {!agent.onboarding_completed && (
                      <span className="pill text-[11px] px-2 py-0.5" style={{ background: 'rgba(245,158,11,.12)', color: '#b45309' }}>
                        טרם השלים אונבורדינג
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[color:var(--ink-500)] mt-1">
                    {agent.managed_account_ids?.length || 0} לקוחות · {agent.contact_email || 'ללא אימייל'} · {agent.whatsapp || 'ללא וואטסאפ'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setExpanded(expanded === agent.id ? null : agent.id)}
                    className="ui-btn ui-btn-sm ui-btn-outline gap-1.5"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    שיוך לקוחות
                  </button>
                  <button onClick={() => resetPassword(agent.id)} className="ui-btn ui-btn-sm ui-btn-ghost" title="אפס סיסמה">
                    <KeyRound className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggleStatus(agent)} className="ui-btn ui-btn-sm ui-btn-ghost" title={agent.status === 'active' ? 'השהה' : 'הפעל'}>
                    {agent.status === 'active' ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => deleteAgent(agent.id)} className="ui-btn ui-btn-sm ui-btn-ghost" title="מחק">
                    <Trash2 className="w-3.5 h-3.5 text-[color:var(--danger)]" />
                  </button>
                </div>
              </div>

              {expanded === agent.id && (
                <AssignPanel
                  accounts={accounts}
                  selected={agent.managed_account_ids || []}
                  saving={savingAssign}
                  onSave={(ids) => saveAssignments(agent.id, ids)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignPanel({
  accounts,
  selected,
  saving,
  onSave,
}: {
  accounts: AccountOption[];
  selected: string[];
  saving: boolean;
  onSave: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
  const [q, setQ] = useState('');

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = accounts.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="border-t border-[color:var(--line)] p-4">
      <input
        className="ui-input mb-3"
        placeholder="חיפוש חשבון/לקוח..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-64 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {filtered.map((a) => (
          <label
            key={a.id}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-[color:var(--ink-100)] cursor-pointer text-[13px]"
          >
            <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
            <span className="flex-1 truncate text-[color:var(--ink-800)]">{a.name}</span>
            {a.crmOnly && <span className="text-[10px] text-[color:var(--ink-400)]">CRM</span>}
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={() => onSave(Array.from(picked))} disabled={saving} className="ui-btn ui-btn-sm ui-btn-solid">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור שיוך'}
        </button>
      </div>
    </div>
  );
}
