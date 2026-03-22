'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Copy,
  ToggleLeft,
  ToggleRight,
  Link as LinkIcon,
  Store,
} from 'lucide-react';

interface Coupon {
  id: string;
  code: string;
  brand_name: string | null;
  description: string | null;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  partnership_id: string | null;
  copy_count: number | null;
  usage_count: number | null;
  tracking_url: string | null;
  brand_link: string | null;
  created_at: string;
}

const DISCOUNT_TYPES = [
  { value: 'percentage', label: '% אחוזים' },
  { value: 'fixed', label: '₪ סכום קבוע' },
  { value: 'free_shipping', label: 'משלוח חינם' },
  { value: 'bogo', label: '1+1' },
  { value: 'other', label: 'אחר' },
];

function formatDiscount(type: string, value: number): string {
  if (type === 'percentage') return `${value}%`;
  if (type === 'fixed') return `₪${value}`;
  if (type === 'free_shipping') return 'משלוח חינם';
  if (type === 'bogo') return '1+1';
  return value ? `${value}` : '—';
}

export default function CouponsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Coupon>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    brand_name: '',
    description: '',
    discount_type: 'percentage',
    discount_value: 0,
    tracking_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadCoupons();
  }, [username]);

  async function loadCoupons() {
    try {
      const authRes = await fetch(`/api/influencer/auth?username=${username}`);
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.push(`/influencer/${username}`);
        return;
      }

      const res = await fetch(`/api/influencer/coupons?username=${username}`);
      const data = await res.json();
      setCoupons(data.coupons || []);
    } catch (err) {
      console.error('Error loading coupons:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/influencer/coupons?username=${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm }),
      });
      if (res.ok) {
        const { coupon } = await res.json();
        setCoupons(prev => prev.map(c => (c.id === id ? { ...c, ...coupon } : c)));
        setEditingId(null);
        setEditForm({});
      }
    } catch (err) {
      console.error('Error saving coupon:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!newCoupon.code.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/influencer/coupons?username=${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCoupon),
      });
      if (res.ok) {
        const { coupon } = await res.json();
        setCoupons(prev => [coupon, ...prev]);
        setIsAdding(false);
        setNewCoupon({ code: '', brand_name: '', description: '', discount_type: 'percentage', discount_value: 0, tracking_url: '' });
      }
    } catch (err) {
      console.error('Error adding coupon:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק את הקופון?')) return;
    try {
      const res = await fetch(`/api/influencer/coupons?username=${username}&id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCoupons(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Error deleting coupon:', err);
    }
  }

  async function handleToggleActive(coupon: Coupon) {
    try {
      const res = await fetch(`/api/influencer/coupons?username=${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: coupon.id, is_active: !coupon.is_active }),
      });
      if (res.ok) {
        setCoupons(prev => prev.map(c => (c.id === coupon.id ? { ...c, is_active: !c.is_active } : c)));
      }
    } catch (err) {
      console.error('Error toggling coupon:', err);
    }
  }

  function copyCode(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function startEdit(coupon: Coupon) {
    setEditingId(coupon.id);
    setEditForm({
      code: coupon.code,
      brand_name: coupon.brand_name || '',
      description: coupon.description || '',
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      tracking_url: coupon.tracking_url || '',
    });
  }

  const activeCoupons = coupons.filter(c => c.is_active);
  const inactiveCoupons = coupons.filter(c => !c.is_active);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Tag className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            קופונים
          </h1>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            <Plus className="w-4 h-4" />
            הוספת קופון
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'סה״כ', value: coupons.length },
            { label: 'פעילים', value: activeCoupons.length },
            { label: 'הועתקו', value: coupons.reduce((s, c) => s + (c.copy_count || 0), 0) },
          ].map((s, i) => (
            <div key={i} className="glass-card rounded-xl p-3 text-center">
              <div className="text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>{s.label}</div>
              <div className="text-xl font-bold" style={{ color: 'var(--dash-text)' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Add Coupon Form */}
        {isAdding && (
          <div className="glass-card rounded-2xl p-5 mb-6 animate-slide-up" style={{ border: '1px solid var(--color-primary)' }}>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              קופון חדש
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>קוד קופון *</label>
                <input
                  className="input w-full py-2 px-3 text-sm"
                  value={newCoupon.code}
                  onChange={e => setNewCoupon(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                  placeholder="SAVE20"
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>מותג</label>
                <input
                  className="input w-full py-2 px-3 text-sm"
                  value={newCoupon.brand_name}
                  onChange={e => setNewCoupon(p => ({ ...p, brand_name: e.target.value }))}
                  placeholder="שם המותג"
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>סוג הנחה</label>
                <select
                  className="input w-full py-2 px-3 text-sm"
                  value={newCoupon.discount_type}
                  onChange={e => setNewCoupon(p => ({ ...p, discount_type: e.target.value }))}
                >
                  {DISCOUNT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>ערך הנחה</label>
                <input
                  type="number"
                  className="input w-full py-2 px-3 text-sm"
                  value={newCoupon.discount_value || ''}
                  onChange={e => setNewCoupon(p => ({ ...p, discount_value: Number(e.target.value) }))}
                  placeholder="20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>תיאור</label>
                <input
                  className="input w-full py-2 px-3 text-sm"
                  value={newCoupon.description}
                  onChange={e => setNewCoupon(p => ({ ...p, description: e.target.value }))}
                  placeholder="תיאור הקופון..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>קישור מעקב</label>
                <input
                  className="input w-full py-2 px-3 text-sm"
                  value={newCoupon.tracking_url}
                  onChange={e => setNewCoupon(p => ({ ...p, tracking_url: e.target.value }))}
                  placeholder="https://..."
                  dir="ltr"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ color: 'var(--dash-text-2)' }}
              >
                ביטול
              </button>
              <button
                onClick={handleAdd}
                disabled={!newCoupon.code.trim() || saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                שמירה
              </button>
            </div>
          </div>
        )}

        {/* Coupons List */}
        {coupons.length === 0 && !isAdding ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}>
              <Tag className="w-8 h-8" style={{ color: 'var(--color-primary)' }} />
            </div>
            <h3 className="text-lg font-semibold mb-2">אין קופונים עדיין</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--dash-text-2)' }}>הוסיפו קופונים כדי שהבוט ישתף אותם בשיחות</p>
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              הוספת קופון ראשון
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {[...activeCoupons, ...inactiveCoupons].map((coupon) => {
              const isEditing = editingId === coupon.id;

              return (
                <div
                  key={coupon.id}
                  className="glass-card rounded-xl overflow-hidden transition-all duration-200"
                  style={{
                    opacity: coupon.is_active ? 1 : 0.6,
                    border: `1px solid ${isEditing ? 'var(--color-primary)' : 'var(--dash-glass-border)'}`,
                  }}
                >
                  {isEditing ? (
                    /* Edit Mode */
                    <div className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>קוד</label>
                          <input
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.code || ''}
                            onChange={e => setEditForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>מותג</label>
                          <input
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.brand_name || ''}
                            onChange={e => setEditForm(p => ({ ...p, brand_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>סוג הנחה</label>
                          <select
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.discount_type || 'percentage'}
                            onChange={e => setEditForm(p => ({ ...p, discount_type: e.target.value }))}
                          >
                            {DISCOUNT_TYPES.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>ערך</label>
                          <input
                            type="number"
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.discount_value || ''}
                            onChange={e => setEditForm(p => ({ ...p, discount_value: Number(e.target.value) }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>תיאור</label>
                          <input
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.description || ''}
                            onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>קישור מעקב</label>
                          <input
                            className="input w-full py-2 px-3 text-sm"
                            value={editForm.tracking_url || ''}
                            onChange={e => setEditForm(p => ({ ...p, tracking_url: e.target.value }))}
                            dir="ltr"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3 justify-end">
                        <button
                          onClick={() => { setEditingId(null); setEditForm({}); }}
                          className="px-3 py-1.5 rounded-lg text-sm"
                          style={{ color: 'var(--dash-text-2)' }}
                        >
                          ביטול
                        </button>
                        <button
                          onClick={() => handleSave(coupon.id)}
                          disabled={saving}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                          style={{ background: 'var(--color-primary)', color: '#fff' }}
                        >
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          שמירה
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Code badge */}
                          <button
                            onClick={() => copyCode(coupon.code, coupon.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono font-bold transition-all duration-200"
                            style={{
                              background: 'rgba(160,148,224,0.15)',
                              color: 'var(--color-primary)',
                              border: '1px solid rgba(160,148,224,0.25)',
                            }}
                            title="העתק קוד"
                          >
                            {copiedId === coupon.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {coupon.code}
                          </button>

                          {/* Brand name */}
                          {coupon.brand_name && (
                            <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--dash-text-2)' }}>
                              <Store className="w-3.5 h-3.5" />
                              {coupon.brand_name}
                            </span>
                          )}

                          {/* Discount */}
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(23,163,74,0.15)', color: '#17A34A' }}
                          >
                            {formatDiscount(coupon.discount_type, coupon.discount_value)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Stats */}
                          {(coupon.copy_count || 0) > 0 && (
                            <span className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--dash-text-3)' }}>
                              {coupon.copy_count} העתקות
                            </span>
                          )}

                          {/* Toggle active */}
                          <button
                            onClick={() => handleToggleActive(coupon)}
                            className="p-1.5 rounded-lg transition-all duration-200"
                            title={coupon.is_active ? 'השבת' : 'הפעל'}
                          >
                            {coupon.is_active ? (
                              <ToggleRight className="w-5 h-5 text-green-400" />
                            ) : (
                              <ToggleLeft className="w-5 h-5" style={{ color: 'var(--dash-text-3)' }} />
                            )}
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => startEdit(coupon)}
                            className="p-1.5 rounded-lg transition-all duration-200 hover:bg-[var(--dash-surface-hover)]"
                            style={{ color: 'var(--dash-text-3)' }}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(coupon.id)}
                            className="p-1.5 rounded-lg transition-all duration-200 hover:bg-red-500/10"
                            style={{ color: 'var(--dash-text-3)' }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Description & Link row */}
                      {(coupon.description || coupon.tracking_url) && (
                        <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                          {coupon.description && <span>{coupon.description}</span>}
                          {coupon.tracking_url && (
                            <a
                              href={coupon.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 hover:underline"
                              style={{ color: 'var(--color-info)' }}
                            >
                              <LinkIcon className="w-3 h-3" />
                              קישור
                            </a>
                          )}
                        </div>
                      )}
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
