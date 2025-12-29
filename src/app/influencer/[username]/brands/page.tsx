'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  Search,
} from 'lucide-react';
import { getInfluencerByUsername, getBrandsByInfluencer, createBrand, updateBrand, deleteBrand, type Brand } from '@/lib/supabase';
import type { Influencer } from '@/types';

export default function BrandsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [formData, setFormData] = useState({
    brand_name: '',
    description: '',
    coupon_code: '',
    link: '',
    category: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Check authentication
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();

        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        // Load influencer data
        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);
        
        // Load brands
        const brandsData = await getBrandsByInfluencer(inf.id);
        setBrands(brandsData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setFormData({
      brand_name: brand.brand_name,
      description: brand.description || '',
      coupon_code: brand.coupon_code || '',
      link: brand.link || '',
      category: brand.category || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!influencer) return;
    
    setSaving(true);
    try {
      if (editingBrand) {
        // Update existing brand
        const success = await updateBrand(editingBrand.id, {
          brand_name: formData.brand_name,
          description: formData.description || null,
          coupon_code: formData.coupon_code || null,
          link: formData.link || null,
          category: formData.category || null,
        });
        
        if (success) {
          setBrands(prev => prev.map(b => 
            b.id === editingBrand.id 
              ? { ...b, ...formData, description: formData.description || null, coupon_code: formData.coupon_code || null, link: formData.link || null, category: formData.category || null }
              : b
          ));
        }
      } else {
        // Create new brand
        const newBrand = await createBrand({
          influencer_id: influencer.id,
          brand_name: formData.brand_name,
          description: formData.description || null,
          coupon_code: formData.coupon_code || null,
          link: formData.link || null,
          short_link: null,
          category: formData.category || null,
          is_active: true,
        });
        
        if (newBrand) {
          setBrands(prev => [...prev, newBrand]);
        }
      }
      
      // Reset form
      setShowForm(false);
      setEditingBrand(null);
      setFormData({ brand_name: '', description: '', coupon_code: '', link: '', category: '' });
    } catch (error) {
      console.error('Error saving brand:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (brandId: string) => {
    if (!confirm('האם את בטוחה שברצונך למחוק את המותג?')) return;
    
    const success = await deleteBrand(brandId);
    if (success) {
      setBrands(prev => prev.filter(b => b.id !== brandId));
    }
  };

  const filteredBrands = brands.filter(b =>
    b.brand_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href={`/influencer/${username}/dashboard`}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold">מותגים וקופונים</h1>
                <p className="text-sm text-gray-400">
                  {brands.length} מותגים • {brands.filter(b => b.coupon_code).length} עם קופון
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setEditingBrand(null);
                setFormData({ brand_name: '', description: '', coupon_code: '', link: '', category: '' });
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">הוסף מותג</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="חפש מותג..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-10 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Brands Grid */}
        {filteredBrands.length === 0 ? (
          <div className="text-center py-16">
            <Tag className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-400 mb-2">
              {brands.length === 0 ? 'אין מותגים עדיין' : 'לא נמצאו תוצאות'}
            </h2>
            <p className="text-gray-500 mb-6">
              {brands.length === 0 ? 'הוסיפי מותגים וקופונים שהצ׳אטבוט יכיר' : 'נסי חיפוש אחר'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredBrands.map((brand, index) => (
              <motion.div
                key={brand.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl hover:border-gray-600 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{brand.brand_name}</h3>
                    {brand.category && (
                      <span className="text-xs text-gray-500">{brand.category}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(brand)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(brand.id)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {brand.description && (
                  <p className="text-sm text-gray-400 mb-3">{brand.description}</p>
                )}

                <div className="flex items-center justify-between">
                  {brand.coupon_code ? (
                    <button
                      onClick={() => handleCopyCode(brand.coupon_code!)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 transition-colors"
                    >
                      {copiedCode === brand.coupon_code ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span className="font-mono text-sm">{brand.coupon_code}</span>
                    </button>
                  ) : (
                    <span className="text-sm text-gray-500">ללא קופון</span>
                  )}

                  {brand.link && (
                    <a
                      href={brand.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-400 hover:text-purple-400 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setShowForm(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto bg-gray-900 border border-gray-700 rounded-2xl z-50 max-h-[80vh] overflow-auto"
              dir="rtl"
            >
              <div className="sticky top-0 bg-gray-900 p-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="font-semibold text-lg">
                  {editingBrand ? 'עריכת מותג' : 'הוספת מותג חדש'}
                </h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">שם המותג *</label>
                  <input
                    type="text"
                    value={formData.brand_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, brand_name: e.target.value }))}
                    required
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    placeholder="למשל: פנדורה"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">תיאור</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    placeholder="למשל: תכשיטים"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">קוד קופון</label>
                  <input
                    type="text"
                    value={formData.coupon_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, coupon_code: e.target.value }))}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 font-mono"
                    placeholder="למשל: DANIT20"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">לינק</label>
                  <input
                    type="url"
                    value={formData.link}
                    onChange={(e) => setFormData(prev => ({ ...prev, link: e.target.value }))}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    placeholder="https://..."
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">קטגוריה</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">בחרי קטגוריה</option>
                    <option value="אופנה">אופנה</option>
                    <option value="ביוטי">ביוטי</option>
                    <option value="טיפוח">טיפוח</option>
                    <option value="תכשיטים">תכשיטים</option>
                    <option value="בית">בית</option>
                    <option value="מזון">מזון</option>
                    <option value="טכנולוגיה">טכנולוגיה</option>
                    <option value="ספורט">ספורט</option>
                    <option value="שירותים">שירותים</option>
                    <option value="אחר">אחר</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={saving || !formData.brand_name}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingBrand ? 'עדכן' : 'הוסף'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors"
                  >
                    ביטול
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

