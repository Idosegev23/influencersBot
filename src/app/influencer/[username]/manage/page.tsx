'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Tag,
  Package,
  Store,
  MessageSquare,
  FileText,
  Copy,
  Check,
  Search,
  Loader2,
  RefreshCw,
  ExternalLink,
  ChefHat,
  Shirt,
  Lightbulb,
  Dumbbell,
  Star,
  Settings,
  Sparkles,
} from 'lucide-react';

const contentTypeLabels: Record<string, { label: string; icon: any; color: string }> = {
  recipe: { label: 'מתכון', icon: ChefHat, color: 'text-orange-400' },
  look: { label: 'לוק', icon: Shirt, color: 'text-pink-400' },
  tip: { label: 'טיפ', icon: Lightbulb, color: 'text-yellow-400' },
  workout: { label: 'אימון', icon: Dumbbell, color: 'text-green-400' },
  review: { label: 'ביקורת', icon: Star, color: 'text-purple-400' },
  tutorial: { label: 'מדריך', icon: FileText, color: 'text-blue-400' },
};

type TabType = 'brands' | 'products' | 'content' | 'settings';

export default function ManagePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('brands');
  const [influencer, setInfluencer] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data states
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [contentItems, setContentItems] = useState<any[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [greetingMessage, setGreetingMessage] = useState('');
  
  // UI states
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);

  // Form state for brands
  const [brandForm, setBrandForm] = useState({
    brand_name: '',
    description: '',
    coupon_code: '',
    link: '',
    category: '',
  });

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    try {
      const authRes = await fetch(`/api/influencer/auth?username=${username}`);
      const authData = await authRes.json();
      
      if (!authData.authenticated) {
        router.push(`/influencer/${username}/login`);
        return;
      }

      // Load influencer & all data
      const infRes = await fetch(`/api/admin/influencers?username=${username}`);
      const infData = await infRes.json();
      const inf = infData.influencers?.[0];
      
      if (!inf) {
        router.push(`/influencer/${username}/login`);
        return;
      }

      setInfluencer(inf);
      
      // Load brands from partnerships
      const brandsRes = await fetch(`/api/influencer/partnerships?username=${username}&limit=100`);
      if (brandsRes.ok) {
        const brandsData = await brandsRes.json();
        const partnerships = brandsData.partnerships || [];
        
        // Load coupons for each partnership
        const brandsWithCoupons = await Promise.all(
          partnerships.map(async (p: any) => {
            try {
              const couponsRes = await fetch(
                `/api/influencer/partnerships/${p.id}/coupons?username=${username}`
              );
              if (couponsRes.ok) {
                const couponsData = await couponsRes.json();
                return {
                  id: p.id,
                  brand_name: p.brand_name,
                  description: p.description,
                  category: p.category,
                  link: p.website,
                  coupons: couponsData.coupons || [],
                };
              }
            } catch (err) {
              console.error('Error loading coupons:', err);
            }
            return {
              id: p.id,
              brand_name: p.brand_name,
              description: p.description,
              category: p.category,
              link: p.website,
              coupons: [],
            };
          })
        );
        setBrands(brandsWithCoupons);
      }

      // Load products from Gemini
      if (inf.persona?.gemini_raw_output) {
        setProducts(inf.persona.gemini_raw_output.products || []);
      }

      // Load content
      try {
        const contentRes = await fetch(`/api/influencer/content?username=${username}`);
        if (contentRes.ok) {
          const contentData = await contentRes.json();
          setContentItems(contentData.content || []);
        }
      } catch (err) {
        console.error('Error loading content:', err);
      }

      // Load settings
      setSuggestedQuestions(inf.suggested_questions || []);
      setGreetingMessage(inf.greeting_message || '');
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/influencer/content/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: influencer.id,
          suggested_questions: suggestedQuestions,
          greeting_message: greetingMessage,
        }),
      });

      if (res.ok) {
        alert('✅ הגדרות נשמרו!');
      } else {
        alert('❌ שגיאה בשמירה');
      }
    } catch (error) {
      console.error('Error saving:', error);
      alert('❌ שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleAddBrand = () => {
    router.push(`/influencer/${username}/partnerships/new`);
  };

  const handleAddProduct = async () => {
    const name = prompt('שם המוצר:');
    if (!name) return;
    
    const brand = prompt('מותג (אופציונלי):');
    const category = prompt('קטגוריה (אופציונלי):');
    
    try {
      const res = await fetch('/api/influencer/content/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: influencer.id,
          product: { name, brand, category },
        }),
      });
      
      if (res.ok) {
        alert('✅ מוצר נוסף!');
        loadData();
      } else {
        alert('❌ שגיאה בהוספה');
      }
    } catch (error) {
      console.error('Error adding product:', error);
      alert('❌ שגיאה בהוספה');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('למחוק מוצר?')) return;
    
    try {
      const res = await fetch(
        `/api/influencer/content/products?accountId=${influencer.id}&productId=${productId}`,
        { method: 'DELETE' }
      );
      
      if (res.ok) {
        alert('✅ מוצר נמחק!');
        loadData();
      } else {
        alert('❌ שגיאה במחיקה');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('❌ שגיאה במחיקה');
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleRescan = async () => {
    if (!confirm('לסרוק מחדש? זה ייקח מספר דקות')) return;
    
    setRescanning(true);
    try {
      const res = await fetch('/api/persona/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: influencer.id }),
      });
      if (res.ok) {
        alert('✅ הסריקה הופעלה!');
        setTimeout(() => loadData(), 5000);
      } else {
        alert('❌ שגיאה בהפעלת סריקה');
      }
    } catch (error) {
      console.error('Error rescanning:', error);
      alert('❌ שגיאה בהפעלת סריקה');
    } finally {
      setRescanning(false);
    }
  };

  const handleAddQuestion = () => {
    setSuggestedQuestions([...suggestedQuestions, '']);
  };

  const handleUpdateQuestion = (index: number, value: string) => {
    const updated = [...suggestedQuestions];
    updated[index] = value;
    setSuggestedQuestions(updated);
  };

  const handleDeleteQuestion = (index: number) => {
    setSuggestedQuestions(suggestedQuestions.filter((_, i) => i !== index));
  };

  // Filtering
  const filteredBrands = brands.filter(b =>
    b.brand_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredProducts = products.filter(p =>
    (p.name || p.product_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredContent = contentItems.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" dir="rtl">
      {/* Background */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-slate-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href={`/influencer/${username}/dashboard`}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              {influencer.avatar_url ? (
                <img
                  src={influencer.avatar_url}
                  alt={influencer.display_name}
                  className="w-10 h-10 rounded-xl object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                  {influencer.display_name?.charAt(0) || '?'}
                </div>
              )}
              <div>
                <h1 className="font-semibold text-white">ניהול תוכן הבוט</h1>
                <p className="text-xs text-gray-400">@{username}</p>
              </div>
            </div>

            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg transition-colors text-sm"
            >
              {rescanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {rescanning ? 'סורק...' : 'סריקה מחדש'}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab('brands')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === 'brands'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800/50 text-gray-400 hover:text-white'
            }`}
          >
            <Store className="w-4 h-4" />
            מותגים וקופונים ({brands.length})
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === 'products'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800/50 text-gray-400 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" />
            מוצרים ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('content')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === 'content'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800/50 text-gray-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            תוכן מפוסטים ({contentItems.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === 'settings'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800/50 text-gray-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            הגדרות צ'אט
          </button>
        </div>

        {/* Search */}
        {(activeTab === 'brands' || activeTab === 'products' || activeTab === 'content') && (
          <div className="relative mb-6">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש..."
              className="w-full pr-10 pl-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        {/* Brands Tab */}
        {activeTab === 'brands' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">מותגים וקופונים</h2>
              <button
                onClick={handleAddBrand}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                הוסף מותג
              </button>
            </div>

            {filteredBrands.length === 0 ? (
              <div className="text-center py-16 bg-gray-800/30 rounded-2xl">
                <Store className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">אין מותגים עדיין</h3>
                <p className="text-gray-400 mb-6">הוסיפי מותגים וקופונים שהבוט יכיר</p>
                <button
                  onClick={handleAddBrand}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  הוסף מותג ראשון
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBrands.map((brand) => (
                  <motion.div
                    key={brand.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl hover:border-indigo-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-white text-lg mb-1">
                          {brand.brand_name}
                        </h3>
                        {brand.category && (
                          <span className="text-xs text-gray-500">{brand.category}</span>
                        )}
                      </div>
                      <Link
                        href={`/influencer/${username}/partnerships/${brand.id}`}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>
                    </div>

                    {brand.description && (
                      <p className="text-sm text-gray-400 mb-4">{brand.description}</p>
                    )}

                    {brand.coupons && brand.coupons.length > 0 ? (
                      <div className="space-y-2">
                        {brand.coupons.map((coupon: any) => (
                          <button
                            key={coupon.id}
                            onClick={() => handleCopyCode(coupon.code)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg transition-colors"
                          >
                            <span className="font-mono text-sm font-bold">{coupon.code}</span>
                            {copiedCode === coupon.code ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-3 text-sm text-gray-500">
                        ללא קופונים
                      </div>
                    )}

                    {brand.link && (
                      <a
                        href={brand.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 mt-3 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        קישור למותג
                      </a>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">מוצרים</h2>
              <button
                onClick={handleAddProduct}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                הוסף מוצר
              </button>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="text-center py-16 bg-gray-800/30 rounded-2xl">
                <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">אין מוצרים עדיין</h3>
                <p className="text-gray-400 mb-6">הוסיפי מוצרים שהבוט ידבר עליהם</p>
                <button
                  onClick={handleAddProduct}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  הוסף מוצר ראשון
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map((product, idx) => (
                  <motion.div
                    key={product.id || idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl hover:border-purple-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-white">
                          {product.name || product.product_name}
                        </h3>
                        {product.brand && (
                          <p className="text-sm text-gray-400 mt-1">מותג: {product.brand}</p>
                        )}
                        {product.category && (
                          <p className="text-xs text-gray-500 mt-1">קטגוריה: {product.category}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteProduct(product.id || product.product_id)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-6">תוכן מפוסטים</h2>

            {filteredContent.length === 0 ? (
              <div className="text-center py-16 bg-gray-800/30 rounded-2xl">
                <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">אין תוכן עדיין</h3>
                <p className="text-gray-400">התוכן נסרק אוטומטית מהפוסטים שלך באינסטגרם</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredContent.map((item: any) => {
                  const typeInfo = contentTypeLabels[item.type] || { label: item.type, icon: FileText, color: 'text-gray-400' };
                  const TypeIcon = typeInfo.icon;

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all"
                    >
                      {item.image_url && (
                        <div className="relative h-40 bg-gray-900">
                          <Image
                            src={item.image_url}
                            alt={item.title}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      )}

                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <TypeIcon className={`w-4 h-4 ${typeInfo.color}`} />
                          <span className="text-xs text-gray-400">{typeInfo.label}</span>
                        </div>

                        <h3 className="font-semibold text-white mb-2 line-clamp-2">
                          {item.title}
                        </h3>
                        
                        {item.description && (
                          <p className="text-sm text-gray-400 line-clamp-3">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-bold text-white mb-6">הגדרות צ'אט</h2>

            <div className="space-y-6">
              {/* Greeting Message */}
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  הודעת ברכה
                </label>
                <textarea
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={4}
                  placeholder="היי! אני הבוט של..."
                />
              </div>

              {/* Suggested Questions */}
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-gray-300">
                    שאלות מוצעות
                  </label>
                  <button
                    onClick={handleAddQuestion}
                    className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    הוסף שאלה
                  </button>
                </div>
                
                <div className="space-y-3">
                  {suggestedQuestions.map((question, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => handleUpdateQuestion(idx, e.target.value)}
                        className="flex-1 px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder={`שאלה ${idx + 1}`}
                      />
                      <button
                        onClick={() => handleDeleteQuestion(idx)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {suggestedQuestions.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">אין שאלות מוצעות</p>
                  )}
                </div>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl transition-all font-medium flex items-center justify-center gap-2 text-lg"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    שומר...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    שמור הגדרות
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
