'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-[#AEB0E8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium shadow-lg"
          style={{ background: '#69FFC7', color: '#373226' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
          {toast}
        </div>
      )}

      <div className="max-w-6xl mx-auto" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#FF76B0' }}>
              <span className="material-symbols-outlined text-white" style={{ fontSize: 24 }}>palette</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#373226' }}>ניהול לוגואים</h1>
              <p className="text-sm mt-0.5" style={{ color: '#bab1a1' }}>
                {withLogo} עם לוגו · {withoutLogo} ללא לוגו · {brands.length} סה״כ
              </p>
            </div>
          </div>
          <Link href="/admin/dashboard" className="neon-pill neon-pill-outline flex items-center gap-1.5 text-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
            חזרה לדשבורד
          </Link>
        </div>

        {/* Search & Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2" style={{ fontSize: 18, color: '#bab1a1' }}>search</span>
            <input
              type="text"
              placeholder="חיפוש מותג..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="neon-input w-full pr-11 shadow-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`neon-pill ${filter === 'all' ? 'neon-pill-secondary' : 'neon-pill-outline'} text-xs`}
            >
              הכל
            </button>
            <button
              onClick={() => setFilter('with')}
              className={`neon-pill text-xs ${filter === 'with' ? 'neon-pill-primary' : ''}`}
              style={filter !== 'with' ? { border: '1.5px solid #69FFC7', color: '#655e51', background: 'transparent' } : {}}
            >
              עם לוגו
            </button>
            <button
              onClick={() => setFilter('without')}
              className={`neon-pill text-xs ${filter === 'without' ? 'neon-pill-danger' : ''}`}
              style={filter !== 'without' ? { border: '1.5px solid #FFB89A', color: '#655e51', background: 'transparent' } : {}}
            >
              בלי לוגו
            </button>
          </div>
        </div>

        {/* Brand Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(brand => (
            <div
              key={brand.id}
              className="neon-card p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              style={!brand.logo_url ? { border: '2px dashed #AEB0E8' } : {}}
            >
              {/* Logo preview */}
              <div className="w-[120px] h-[120px] rounded-2xl mx-auto mb-4 flex items-center justify-center overflow-hidden"
                style={{ background: '#FAF8F5' }}
              >
                {brand.logo_url ? (
                  <img
                    src={brand.logo_url}
                    alt={brand.display_name}
                    className="max-h-[100px] max-w-[100px] object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1" style={{ color: '#bab1a1' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36 }}>photo_camera</span>
                    <span className="text-[10px]">חסר לוגו</span>
                  </div>
                )}
              </div>

              {/* Name & info */}
              <div className="text-center mb-3">
                <h3 className="font-semibold text-sm truncate" style={{ color: '#373226' }}>{brand.display_name}</h3>
                {brand.category && (
                  <span className="neon-pill neon-pill-outline text-[10px] mt-1.5 inline-block px-2 py-0.5">
                    {brand.category}
                  </span>
                )}
                <p className="text-[11px] mt-1.5 flex items-center justify-center gap-1" style={{ color: '#bab1a1' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>handshake</span>
                  {brand.partnerships?.length || 0} משפיענים
                </p>
              </div>

              {/* Contact info */}
              {editingBrand === brand.id ? (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2" style={{ fontSize: 14, color: '#bab1a1' }}>phone</span>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                      placeholder="972501234567"
                      className="neon-input w-full pr-8 text-xs py-2 text-left"
                      dir="ltr"
                    />
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2" style={{ fontSize: 14, color: '#bab1a1' }}>mail</span>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      placeholder="contact@brand.com"
                      className="neon-input w-full pr-8 text-xs py-2 text-left"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveContact(brand.id)}
                      disabled={saving}
                      className="neon-pill neon-pill-primary flex-1 flex items-center justify-center gap-1 text-[11px] font-medium disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>
                      שמור
                    </button>
                    <button
                      onClick={() => setEditingBrand(null)}
                      className="neon-pill neon-pill-ghost text-[11px]"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-1 text-center">
                  {brand.whatsapp_phone && (
                    <div className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: '#655e51' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>phone</span>
                      <span dir="ltr">{brand.whatsapp_phone}</span>
                    </div>
                  )}
                  {brand.email && (
                    <div className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: '#655e51' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>mail</span>
                      <span>{brand.email}</span>
                    </div>
                  )}
                  {!brand.whatsapp_phone && !brand.email && (
                    <p className="text-[11px]" style={{ color: '#FF76B0' }}>חסר פרטי קשר</p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-4 justify-center">
                <button
                  onClick={() => triggerUpload(brand.id)}
                  disabled={uploading === brand.id}
                  className="neon-pill neon-pill-secondary flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {uploading === brand.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>swap_horiz</span>
                  )}
                  {brand.logo_url ? 'החלף' : 'העלה'}
                </button>
                {editingBrand !== brand.id && (
                  <button
                    onClick={() => startEditing(brand)}
                    className="neon-pill text-xs"
                    style={{ border: '1.5px solid #7DD3FC', color: '#655e51', background: 'transparent' }}
                    title="ערוך פרטי קשר"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                  </button>
                )}
                {brand.logo_url && (
                  <button
                    onClick={() => handleDelete(brand.id)}
                    className="neon-pill text-xs"
                    style={{ border: '1.5px solid #FF76B0', color: '#FF76B0', background: 'transparent' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20" style={{ color: '#bab1a1' }}>
            <span className="material-symbols-outlined block mx-auto mb-2" style={{ fontSize: 48 }}>search_off</span>
            לא נמצאו מותגים
          </div>
        )}

        {/* Quick Upload Zone */}
        <div className="mt-10 mb-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: '#373226' }}>העלאה מהירה</h2>
          <div
            className="rounded-[3rem] flex flex-col items-center justify-center py-16 cursor-pointer transition-all hover:shadow-md"
            style={{ border: '4px dashed #AEB0E8', background: 'transparent' }}
            onClick={() => {
              if (filtered.length > 0) {
                triggerUpload(filtered[0].id);
              }
            }}
          >
            <span className="material-symbols-outlined mb-3" style={{ fontSize: 48, color: '#AEB0E8' }}>cloud_upload</span>
            <p className="text-sm font-medium" style={{ color: '#655e51' }}>גרור לוגו לכאן או לחץ להעלאה</p>
            <p className="text-xs mt-1" style={{ color: '#bab1a1' }}>PNG, JPG, SVG עד 5MB</p>
          </div>
        </div>
      </div>
    </>
  );
}
