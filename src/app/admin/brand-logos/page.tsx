'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Upload, Trash2, Check, X, Image, Search, ExternalLink } from 'lucide-react';

interface BrandLogo {
  id: string;
  brand_name_normalized: string;
  display_name: string;
  logo_url: string | null;
  aliases: string[];
  website: string | null;
  category: string | null;
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
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-6">
          <ArrowRight className="w-4 h-4" /> חזרה לדשבורד
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">ניהול לוגואים למותגים</h1>
            <p className="text-white/50 text-sm mt-1">
              {withLogo} עם לוגו · {withoutLogo} ללא לוגו · {brands.length} סה״כ
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="חיפוש מותג..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {(['all', 'without', 'with'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                  filter === f ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
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
              className={`rounded-2xl border p-4 transition-all ${
                brand.logo_url
                  ? 'border-white/10 bg-white/5'
                  : 'border-orange-500/30 bg-orange-500/5'
              }`}
            >
              {/* Logo preview */}
              <div className="w-full h-24 rounded-xl mb-3 flex items-center justify-center overflow-hidden bg-white/[0.03]">
                {brand.logo_url ? (
                  <img
                    src={brand.logo_url}
                    alt={brand.display_name}
                    className="max-h-20 max-w-full object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-white/20">
                    <Image className="w-8 h-8" />
                    <span className="text-[10px]">חסר לוגו</span>
                  </div>
                )}
              </div>

              {/* Name & info */}
              <h3 className="font-semibold text-sm truncate">{brand.display_name}</h3>
              {brand.category && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 mt-1 inline-block">
                  {brand.category}
                </span>
              )}
              <p className="text-[10px] text-white/30 mt-1">
                {brand.partnerships?.length || 0} משפיענים
              </p>

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => triggerUpload(brand.id)}
                  disabled={uploading === brand.id}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 transition-colors disabled:opacity-50"
                >
                  {uploading === brand.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {brand.logo_url ? 'החלף' : 'העלה'}
                </button>
                {brand.logo_url && (
                  <button
                    onClick={() => handleDelete(brand.id)}
                    className="px-3 py-2 rounded-lg text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-white/30 py-20">
            לא נמצאו מותגים
          </div>
        )}
      </div>
    </div>
  );
}
