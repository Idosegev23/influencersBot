'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Upload, Trash2, Check, X, Image, Search, ExternalLink, Phone, Mail, Save } from 'lucide-react';

interface BrandLogo {
  id: string;
  brand_name_normalized: string;
  display_name: string;
  logo_url: string | null;
  aliases: string[];
  website: string | null;
  category: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  partnerships: { id: string; brand_name: string; account_id: string }[];
}

export default function BrandLogosPage() {
  const [brands, setBrands] = useState<BrandLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all');
  const [uploading, setUploading] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadBrands();
  }, []);

  async function loadBrands() {
    const res = await fetch('/api/admin/brand-logos');
    if (!res.ok) { router.push('/admin'); return; }
    const data = await res.json();
    setBrands(data.brands || []);
    setLoading(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleUpload(brandId: string, file: File) {
    setUploading(brandId);
    const form = new FormData();
    form.append('brandId', brandId);
    form.append('logo', file);

    const res = await fetch('/api/admin/brand-logos', { method: 'POST', body: form });
    const data = await res.json();

    if (data.success) {
      setBrands(prev => prev.map(b => b.id === brandId ? { ...b, logo_url: data.logo_url } : b));
      showToast('לוגו הועלה בהצלחה');
    } else {
      showToast('שגיאה: ' + data.error);
    }
    setUploading(null);
  }

  async function handleDelete(brandId: string) {
    if (!confirm('למחוק את הלוגו?')) return;
    const res = await fetch('/api/admin/brand-logos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId }),
    });
    const data = await res.json();
    if (data.success) {
      setBrands(prev => prev.map(b => b.id === brandId ? { ...b, logo_url: null } : b));
      showToast('הלוגו נמחק');
    }
  }

  function startEditing(brand: BrandLogo) {
    setEditingBrand(brand.id);
    setEditPhone(brand.whatsapp_phone || '');
    setEditEmail(brand.email || '');
  }

  async function handleSaveContact(brandId: string) {
    setSaving(true);
    const res = await fetch('/api/admin/brand-logos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, whatsapp_phone: editPhone, email: editEmail }),
    });
    const data = await res.json();
    if (data.success) {
      setBrands(prev => prev.map(b => b.id === brandId ? { ...b, whatsapp_phone: editPhone || null, email: editEmail || null } : b));
      showToast('פרטי קשר עודכנו');
      setEditingBrand(null);
    } else {
      showToast('שגיאה: ' + data.error);
    }
    setSaving(false);
  }

  function triggerUpload(brandId: string) {
    setSelectedBrand(brandId);
    fileRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && selectedBrand) {
      handleUpload(selectedBrand, file);
    }
    e.target.value = '';
  }

  const filtered = brands.filter(b => {
    const matchSearch = !search ||
      b.display_name.toLowerCase().includes(search.toLowerCase()) ||
      b.brand_name_normalized.includes(search.toLowerCase()) ||
      b.aliases?.some(a => a.toLowerCase().includes(search.toLowerCase()));
    const matchFilter = filter === 'all' ||
      (filter === 'with' && b.logo_url) ||
      (filter === 'without' && !b.logo_url);
    return matchSearch && matchFilter;
  });

  const withLogo = brands.filter(b => b.logo_url).length;
  const withoutLogo = brands.length - withLogo;

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#a094e0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel p-6" dir="rtl">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pill pill-green px-6 py-3 text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-2 text-sm mb-6 transition-colors" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
          <ArrowRight className="w-4 h-4" /> חזרה לדשבורד
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#ede9f8' }}>ניהול מותגים</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
              {withLogo} עם לוגו · {withoutLogo} ללא לוגו · {brands.length} סה״כ
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(237, 233, 248, 0.25)' }} />
            <input
              type="text"
              placeholder="חיפוש מותג..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="admin-input pr-10"
            />
          </div>
          <div className="flex rounded-full overflow-hidden" style={{ border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            {(['all', 'without', 'with'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-2.5 text-xs font-medium transition-all"
                style={filter === f
                  ? { background: 'rgba(160, 148, 224, 0.15)', color: '#a094e0' }
                  : { background: 'rgba(255, 255, 255, 0.02)', color: 'rgba(237, 233, 248, 0.35)' }
                }
              >
                {f === 'all' ? 'הכל' : f === 'with' ? 'עם לוגו' : 'חסר לוגו'}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(brand => (
            <div
              key={brand.id}
              className="admin-card p-4 transition-all"
              style={!brand.logo_url ? { borderColor: 'rgba(224, 164, 148, 0.15)' } : {}}
            >
              {/* Logo preview */}
              <div className="w-full h-24 rounded-xl mb-3 flex items-center justify-center overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                {brand.logo_url ? (
                  <img
                    src={brand.logo_url}
                    alt={brand.display_name}
                    className="max-h-20 max-w-full object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1" style={{ color: 'rgba(237, 233, 248, 0.15)' }}>
                    <Image className="w-8 h-8" />
                    <span className="text-[10px]">חסר לוגו</span>
                  </div>
                )}
              </div>

              {/* Name & info */}
              <h3 className="font-semibold text-sm truncate" style={{ color: '#ede9f8' }}>{brand.display_name}</h3>
              {brand.category && (
                <span className="pill pill-neutral text-[10px] mt-1 inline-block">
                  {brand.category}
                </span>
              )}
              <p className="text-[10px] mt-1" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>
                {brand.partnerships?.length || 0} משפיענים
              </p>

              {/* Contact info */}
              {editingBrand === brand.id ? (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <Phone className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'rgba(237, 233, 248, 0.25)' }} />
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                      placeholder="972501234567"
                      className="admin-input pr-8 text-xs py-1.5 !rounded-lg text-left"
                      dir="ltr"
                    />
                  </div>
                  <div className="relative">
                    <Mail className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'rgba(237, 233, 248, 0.25)' }} />
                    <input
                      type="email"
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      placeholder="contact@brand.com"
                      className="admin-input pr-8 text-xs py-1.5 !rounded-lg text-left"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleSaveContact(brand.id)}
                      disabled={saving}
                      className="btn-teal flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" />
                      שמור
                    </button>
                    <button
                      onClick={() => setEditingBrand(null)}
                      className="btn-ghost py-1.5 text-[11px]"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-1">
                  {brand.whatsapp_phone && (
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>
                      <Phone className="w-2.5 h-2.5" />
                      <span dir="ltr">{brand.whatsapp_phone}</span>
                    </div>
                  )}
                  {brand.email && (
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>
                      <Mail className="w-2.5 h-2.5" />
                      <span>{brand.email}</span>
                    </div>
                  )}
                  {!brand.whatsapp_phone && !brand.email && (
                    <p className="text-[10px]" style={{ color: 'rgba(224, 164, 148, 0.5)' }}>חסר פרטי קשר</p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => triggerUpload(brand.id)}
                  disabled={uploading === brand.id}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium disabled:opacity-50"
                >
                  {uploading === brand.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {brand.logo_url ? 'החלף' : 'העלה'}
                </button>
                {editingBrand !== brand.id && (
                  <button
                    onClick={() => startEditing(brand)}
                    className="px-3 py-2 rounded-full text-xs transition-all"
                    style={{ background: 'rgba(94, 234, 212, 0.08)', color: '#5eead4', border: '1px solid rgba(94, 234, 212, 0.12)' }}
                    title="ערוך פרטי קשר"
                  >
                    <Mail className="w-3.5 h-3.5" />
                  </button>
                )}
                {brand.logo_url && (
                  <button
                    onClick={() => handleDelete(brand.id)}
                    className="px-3 py-2 rounded-full text-xs transition-all"
                    style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.12)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>
            לא נמצאו מותגים
          </div>
        )}
      </div>
    </div>
  );
}
