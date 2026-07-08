'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Phone, Mail, Users, Pencil, Trash2, Save, X } from 'lucide-react';

interface Client {
  id: string;
  display_name: string;
  username: string | null;
  phone: string | null;
  email: string | null;
  crmOnly: boolean;
  status: string;
}

export default function AgentClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ display_name: '', phone: '', email: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', phone: '', email: '' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/clients');
      const data = await res.json();
      setClients(data.clients || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.display_name.trim()) {
      setError('שם הלקוח נדרש');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/agent/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setForm({ display_name: '', phone: '', email: '' });
        setShowForm(false);
        load();
      } else {
        setError(data.error || 'שגיאה');
      }
    } catch {
      setError('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: Client) => {
    setEditingId(c.id);
    setEditForm({ display_name: c.display_name, phone: c.phone || '', email: c.email || '' });
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/agent/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      setEditingId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const deleteClient = async (id: string) => {
    if (!confirm('להסיר את הלקוח? (לקוח CRM ללא עסקאות יימחק)')) return;
    setBusyId(id);
    try {
      await fetch(`/api/agent/clients/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--ink-900)]">המיוצגים שלי</h1>
          <p className="text-sm text-[color:var(--ink-500)] mt-1">משפיענים ומיוצגים שמנוהלים על ידך</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="ui-btn ui-btn-sm ui-btn-solid gap-1.5">
          <Plus className="w-4 h-4" />
          לקוח חדש
        </button>
      </div>

      {showForm && (
        <form onSubmit={addClient} className="mb-6 p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] grid sm:grid-cols-3 gap-3">
          <input className="ui-input" placeholder="שם הלקוח / המשפיען *" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <input className="ui-input" placeholder="טלפון" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="ui-input" placeholder="אימייל" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="sm:col-span-3 flex items-center gap-2">
            <button type="submit" disabled={saving} className="ui-btn ui-btn-sm ui-btn-solid">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הוספה'}
            </button>
            {error && <span className="text-sm text-[color:var(--danger)]">{error}</span>}
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[color:var(--brand)]" /></div>
      ) : clients.length === 0 ? (
        <div className="text-center py-20 text-[color:var(--ink-500)]">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>אין עדיין לקוחות. הוסף את הלקוח הראשון שלך.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clients.map((c) => (
            <div key={c.id} className="p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)]">
              {editingId === c.id ? (
                <div className="space-y-2">
                  <input className="ui-input" value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })} placeholder="שם" />
                  <input className="ui-input" dir="ltr" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="טלפון" />
                  <input className="ui-input" dir="ltr" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="אימייל" />
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveEdit(c.id)} disabled={busyId === c.id} className="ui-btn ui-btn-sm ui-btn-solid gap-1.5">
                      {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}שמור
                    </button>
                    <button onClick={() => setEditingId(null)} className="ui-btn ui-btn-sm ui-btn-ghost gap-1.5"><X className="w-3.5 h-3.5" />ביטול</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[color:var(--brand)]/20 to-[color:var(--accent)]/20 flex items-center justify-center text-[color:var(--ink-800)] font-semibold shrink-0">
                      {c.display_name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[color:var(--ink-900)] truncate">{c.display_name}</div>
                      <div className="text-[11px] text-[color:var(--ink-500)]">{c.crmOnly ? 'לקוח CRM' : 'חשבון בסטי'}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(c)} className="ui-btn ui-btn-sm ui-btn-ghost" title="עריכה"><Pencil className="w-3.5 h-3.5" /></button>
                      {c.crmOnly && <button onClick={() => deleteClient(c.id)} className="ui-btn ui-btn-sm ui-btn-ghost" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-[color:var(--danger)]" /></button>}
                    </div>
                  </div>
                  {(c.phone || c.email) && (
                    <div className="mt-3 space-y-1 text-[12px] text-[color:var(--ink-600)]" dir="ltr">
                      {c.phone && <div className="flex items-center gap-1.5 justify-end"><span>{c.phone}</span><Phone className="w-3.5 h-3.5" /></div>}
                      {c.email && <div className="flex items-center gap-1.5 justify-end"><span className="truncate">{c.email}</span><Mail className="w-3.5 h-3.5" /></div>}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
