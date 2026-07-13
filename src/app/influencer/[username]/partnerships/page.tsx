'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { getDashboardStrings } from '@/lib/i18n/dashboard';
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Users,
  Store,
  Calendar,
  DollarSign,
  FileText,
  ExternalLink,
} from 'lucide-react';

interface Partnership {
  id: string;
  brand_name: string;
  brand_contact_name: string | null;
  brand_contact_email: string | null;
  brand_contact_phone: string | null;
  status: string;
  contract_amount: number | null;
  proposal_amount: number | null;
  currency: string;
  brief: string | null;
  notes: string | null;
  category: string | null;
  start_date: string | null;
  end_date: string | null;
  link: string | null;
  is_active: boolean;
  created_at: string;
}

// Status colors only — user-facing labels come from the i18n catalog (keyed by value).
const STATUS_OPTIONS = [
  { value: 'active', color: '#17A34A' },
  { value: 'in_progress', color: '#2663EB' },
  { value: 'proposal', color: '#CB8A04' },
  { value: 'negotiation', color: '#f97316' },
  { value: 'completed', color: '#a78bfa' },
  { value: 'cancelled', color: '#ef4444' },
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'var(--dash-text-3)';
}

export default function PartnershipsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const { lang } = useDashboardLang(username);
  const isEn = lang === 'en';
  const t = getDashboardStrings(lang);
  const P = t.partnerships;
  const router = useRouter();

  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [archetype, setArchetype] = useState('influencer');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Partnership>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPartnership, setNewPartnership] = useState({
    brand_name: '',
    brand_contact_name: '',
    brand_contact_email: '',
    brand_contact_phone: '',
    status: 'active',
    contract_amount: 0,
    brief: '',
    notes: '',
  });

  const isServiceProvider = archetype === 'service_provider';
  const pageTitle = isServiceProvider ? P.titleClients : P.titlePartnerships;
  const newItemLabel = isServiceProvider ? P.newClient : P.newPartnership;
  const fieldNameLabel = isServiceProvider ? P.fieldClientName : P.fieldBrandName;
  const emptyTitle = isServiceProvider ? P.emptyClients : P.emptyPartnerships;
  const emptyHint = isServiceProvider ? P.emptyHintClients : P.emptyHintPartnerships;
  const addFirstLabel = isServiceProvider ? P.addFirstClient : P.addFirstPartnership;
  const PageIcon = isServiceProvider ? Users : Briefcase;
  const STATUS_LABELS: Record<string, string> = {
    active: P.statusActive,
    in_progress: P.statusInProgress,
    proposal: P.statusProposal,
    negotiation: P.statusNegotiation,
    completed: P.statusCompleted,
    cancelled: P.statusCancelled,
  };

  useEffect(() => {
    loadData();
  }, [username]);

  async function loadData() {
    try {
      const authRes = await fetch(`/api/influencer/auth?username=${username}`);
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.push(`/influencer/${username}`);
        return;
      }

      // Load archetype
      if (authData.influencer?.config?.archetype) {
        setArchetype(authData.influencer.config.archetype);
      }

      // Load partnerships
      const res = await fetch(`/api/influencer/partnerships?username=${username}&limit=100`);
      const data = await res.json();
      setPartnerships(data.partnerships || []);
    } catch (err) {
      console.error('Error loading partnerships:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/influencer/partnerships/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, ...editForm }),
      });
      if (res.ok) {
        const { partnership } = await res.json();
        setPartnerships(prev => prev.map(p => (p.id === id ? { ...p, ...partnership } : p)));
        setEditingId(null);
        setEditForm({});
      }
    } catch (err) {
      console.error('Error saving partnership:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!newPartnership.brand_name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/influencer/partnerships?username=${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, ...newPartnership }),
      });
      if (res.ok) {
        const { partnership } = await res.json();
        setPartnerships(prev => [partnership, ...prev]);
        setIsAdding(false);
        setNewPartnership({
          brand_name: '', brand_contact_name: '', brand_contact_email: '',
          brand_contact_phone: '', status: 'active', contract_amount: 0, brief: '', notes: '',
        });
      }
    } catch (err) {
      console.error('Error adding partnership:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(isServiceProvider ? P.confirmDeleteClient : P.confirmDeletePartnership)) return;
    try {
      const res = await fetch(`/api/influencer/partnerships/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (res.ok) {
        setPartnerships(prev => prev.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error('Error deleting:', err);
    }
  }

  function startEdit(p: Partnership) {
    setEditingId(p.id);
    setEditForm({
      brand_name: p.brand_name,
      brand_contact_name: p.brand_contact_name || '',
      brand_contact_email: p.brand_contact_email || '',
      brand_contact_phone: p.brand_contact_phone || '',
      status: p.status,
      contract_amount: p.contract_amount || 0,
      brief: p.brief || '',
      notes: p.notes || '',
    });
  }

  const activeCount = partnerships.filter(p => ['active', 'in_progress'].includes(p.status)).length;
  const totalValue = partnerships.reduce((s, p) => s + (p.contract_amount || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir={isEn ? 'ltr' : 'rtl'} style={{ background: 'transparent', color: 'var(--dash-text)', direction: isEn ? 'ltr' : 'rtl' }}>
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <PageIcon className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            {pageTitle}
          </h1>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            <Plus className="w-4 h-4" />
            {newItemLabel}
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: P.statTotal, value: partnerships.length },
            { label: P.statActive, value: activeCount },
            { label: P.statTotalValue, value: totalValue > 0 ? `${isEn ? '$' : '₪'}${totalValue.toLocaleString(isEn ? 'en-US' : 'he-IL')}` : '—' },
          ].map((s, i) => (
            <div key={i} className="glass-card rounded-xl p-3 text-center">
              <div className="text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>{s.label}</div>
              <div className="text-xl font-bold" style={{ color: 'var(--dash-text)' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Add Form */}
        {isAdding && (
          <div className="glass-card rounded-2xl p-5 mb-6 animate-slide-up" style={{ border: '1px solid var(--color-primary)' }}>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              {newItemLabel}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>
                  {fieldNameLabel} *
                </label>
                <input
                  className="input w-full py-2 px-3 text-sm"
                  value={newPartnership.brand_name}
                  onChange={e => setNewPartnership(p => ({ ...p, brand_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldStatus}</label>
                <select
                  className="input w-full py-2 px-3 text-sm"
                  value={newPartnership.status}
                  onChange={e => setNewPartnership(p => ({ ...p, status: e.target.value }))}
                >
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{STATUS_LABELS[s.value]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldContact}</label>
                <input
                  className="input w-full py-2 px-3 text-sm"
                  value={newPartnership.brand_contact_name}
                  onChange={e => setNewPartnership(p => ({ ...p, brand_contact_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldAmount}</label>
                <input
                  type="number"
                  className="input w-full py-2 px-3 text-sm"
                  value={newPartnership.contract_amount || ''}
                  onChange={e => setNewPartnership(p => ({ ...p, contract_amount: Number(e.target.value) }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldBrief}</label>
                <textarea
                  className="input w-full py-2 px-3 text-sm"
                  rows={2}
                  value={newPartnership.brief}
                  onChange={e => setNewPartnership(p => ({ ...p, brief: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldNotes}</label>
                <textarea
                  className="input w-full py-2 px-3 text-sm"
                  rows={2}
                  value={newPartnership.notes}
                  onChange={e => setNewPartnership(p => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setIsAdding(false)} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'var(--dash-text-2)' }}>
                {P.cancel}
              </button>
              <button
                onClick={handleAdd}
                disabled={!newPartnership.brand_name.trim() || saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {P.save}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {partnerships.length === 0 && !isAdding ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}>
              <PageIcon className="w-8 h-8" style={{ color: 'var(--color-primary)' }} />
            </div>
            <h3 className="text-lg font-semibold mb-2">{emptyTitle}</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--dash-text-2)' }}>
              {emptyHint}
            </p>
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              {addFirstLabel}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {partnerships.map((p) => {
              const isExpanded = expandedId === p.id;
              const isEditing = editingId === p.id;
              const statusColor = getStatusColor(p.status);
              const statusLabelText = STATUS_LABELS[p.status] || p.status;

              return (
                <div
                  key={p.id}
                  className="glass-card rounded-xl overflow-hidden transition-all duration-200"
                  style={{ border: `1px solid ${isEditing ? 'var(--color-primary)' : 'var(--dash-glass-border)'}` }}
                >
                  {/* Header row */}
                  <div
                    className="p-4 cursor-pointer hover:bg-[var(--dash-surface-hover)] transition-all duration-200"
                    onClick={() => !isEditing && setExpandedId(isExpanded ? null : p.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(160,148,224,0.15)', border: '1px solid rgba(160,148,224,0.25)' }}
                        >
                          <Store className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium" style={{ color: 'var(--dash-text)' }}>{p.brand_name}</span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: statusColor + '20', color: statusColor }}
                            >
                              {statusLabelText}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: 'var(--dash-text-3)' }}>
                            {p.contract_amount ? (
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                ₪{p.contract_amount.toLocaleString('he-IL')}
                              </span>
                            ) : null}
                            {p.brand_contact_name && (
                              <span>{p.brand_contact_name}</span>
                            )}
                            {p.category && (
                              <span>{p.category}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(p); }}
                          className="p-1.5 rounded-lg transition-all duration-200 hover:bg-[var(--dash-surface-hover)]"
                          style={{ color: 'var(--dash-text-3)' }}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                          className="p-1.5 rounded-lg transition-all duration-200 hover:bg-red-500/10"
                          style={{ color: 'var(--dash-text-3)' }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div style={{ color: 'var(--dash-text-3)' }}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && !isEditing && (
                    <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--dash-glass-border)' }}>
                      <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {p.brand_contact_email && (
                          <div>
                            <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{P.detailEmail}</span>
                            <div style={{ color: 'var(--dash-text)' }}>{p.brand_contact_email}</div>
                          </div>
                        )}
                        {p.brand_contact_phone && (
                          <div>
                            <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{P.detailPhone}</span>
                            <div style={{ color: 'var(--dash-text)' }}>{p.brand_contact_phone}</div>
                          </div>
                        )}
                        {p.start_date && (
                          <div>
                            <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{P.detailStarts}</span>
                            <div style={{ color: 'var(--dash-text)' }}>{new Date(p.start_date).toLocaleDateString('he-IL')}</div>
                          </div>
                        )}
                        {p.end_date && (
                          <div>
                            <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{P.detailEnds}</span>
                            <div style={{ color: 'var(--dash-text)' }}>{new Date(p.end_date).toLocaleDateString('he-IL')}</div>
                          </div>
                        )}
                      </div>
                      {p.brief && (
                        <div className="text-sm">
                          <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{P.detailBrief}</span>
                          <p style={{ color: 'var(--dash-text-2)' }}>{p.brief}</p>
                        </div>
                      )}
                      {p.notes && (
                        <div className="text-sm">
                          <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{P.detailNotes}</span>
                          <p style={{ color: 'var(--dash-text-2)' }}>{p.notes}</p>
                        </div>
                      )}
                      {p.link && (
                        <a
                          href={p.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs hover:underline"
                          style={{ color: 'var(--color-info)' }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          {P.linkLabel}
                        </a>
                      )}
                    </div>
                  )}

                  {/* Edit mode */}
                  {isEditing && (
                    <div className="p-4" style={{ borderTop: '1px solid var(--dash-glass-border)' }}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>
                            {fieldNameLabel}
                          </label>
                          <input
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.brand_name || ''}
                            onChange={e => setEditForm(f => ({ ...f, brand_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldStatus}</label>
                          <select
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.status || 'active'}
                            onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                          >
                            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{STATUS_LABELS[s.value]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldContact}</label>
                          <input
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.brand_contact_name || ''}
                            onChange={e => setEditForm(f => ({ ...f, brand_contact_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldAmount}</label>
                          <input
                            type="number"
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.contract_amount || ''}
                            onChange={e => setEditForm(f => ({ ...f, contract_amount: Number(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldEmail}</label>
                          <input
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.brand_contact_email || ''}
                            onChange={e => setEditForm(f => ({ ...f, brand_contact_email: e.target.value }))}
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldPhone}</label>
                          <input
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.brand_contact_phone || ''}
                            onChange={e => setEditForm(f => ({ ...f, brand_contact_phone: e.target.value }))}
                            dir="ltr"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldBrief}</label>
                          <textarea
                            className="input w-full py-2 px-3 text-sm"
                            rows={2}
                            value={editForm.brief || ''}
                            onChange={e => setEditForm(f => ({ ...f, brief: e.target.value }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>{P.fieldNotes}</label>
                          <textarea
                            className="input w-full py-2 px-3 text-sm"
                            rows={2}
                            value={editForm.notes || ''}
                            onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3 justify-end">
                        <button
                          onClick={() => { setEditingId(null); setEditForm({}); }}
                          className="px-3 py-1.5 rounded-lg text-sm"
                          style={{ color: 'var(--dash-text-2)' }}
                        >
                          {P.cancel}
                        </button>
                        <button
                          onClick={() => handleSave(p.id)}
                          disabled={saving}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                          style={{ background: 'var(--color-primary)', color: '#fff' }}
                        >
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          {P.save}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
