'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Tag,
  Package,
  Store,
  MessageSquare,
  Sparkles,
  LogOut,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function BotContentPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [influencer, setInfluencer] = useState<any>(null);
  const [persona, setPersona] = useState<any>(null);
  
  // Content states
  const [coupons, setCoupons] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [greetingMessage, setGreetingMessage] = useState('');
  
  // UI states
  const [activeTab, setActiveTab] = useState<'coupons' | 'products' | 'brands' | 'config'>('coupons');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    coupons: true,
    products: false,
    brands: false,
  });

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    try {
      // Check auth
      const authRes = await fetch(`/api/influencer/auth?username=${username}`);
      const authData = await authRes.json();
      
      if (!authData.authenticated) {
        router.push(`/influencer/${username}/login`);
        return;
      }

      // Load influencer & persona
      const infRes = await fetch(`/api/admin/influencers?username=${username}`);
      const infData = await infRes.json();
      const inf = infData.influencers?.[0];
      
      if (!inf) {
        router.push(`/influencer/${username}/login`);
        return;
      }

      setInfluencer(inf);
      setPersona(inf.persona);
      
      // Parse Gemini output for products/brands
      if (inf.persona?.gemini_raw_output) {
        const geminiData = inf.persona.gemini_raw_output;
        setProducts(geminiData.products || []);
        setBrands(geminiData.brands || []);
      }

      // Load coupons
      const couponsRes = await fetch(`/api/influencer/partnerships?username=${username}&limit=100`);
      if (couponsRes.ok) {
        const couponsData = await couponsRes.json();
        const partnerships = couponsData.partnerships || [];
        
        // Get all coupons from partnerships
        const allCoupons: any[] = [];
        await Promise.all(
          partnerships.map(async (p: any) => {
            try {
              const couponRes = await fetch(
                `/api/influencer/partnerships/${p.id}/coupons?username=${username}`
              );
              if (couponRes.ok) {
                const couponData = await couponRes.json();
                (couponData.coupons || []).forEach((c: any) => {
                  allCoupons.push({
                    ...c,
                    partnership: p.brand_name,
                    partnership_id: p.id,
                  });
                });
              }
            } catch (err) {
              console.error('Error loading coupons:', err);
            }
          })
        );
        setCoupons(allCoupons);
      }

      // Load config
      setSuggestedQuestions(inf.suggested_questions || []);
      setGreetingMessage(inf.greeting_message || '');
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
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
        alert('✅ הגדרות נשמרו בהצלחה!');
      } else {
        alert('❌ שגיאה בשמירה');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      alert('❌ שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
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

  const handleAddBrand = async () => {
    const name = prompt('שם המותג:');
    if (!name) return;
    
    const category = prompt('קטגוריה (אופציונלי):');
    const relationship_type = prompt('סוג קשר (אופציונלי):');
    
    try {
      const res = await fetch('/api/influencer/content/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: influencer.id,
          brand: { name, category, relationship_type },
        }),
      });
      
      if (res.ok) {
        alert('✅ מותג נוסף!');
        loadData();
      } else {
        alert('❌ שגיאה בהוספה');
      }
    } catch (error) {
      console.error('Error adding brand:', error);
      alert('❌ שגיאה בהוספה');
    }
  };

  const handleDeleteBrand = async (brandId: string) => {
    if (!confirm('למחוק מותג?')) return;
    
    try {
      const res = await fetch(
        `/api/influencer/content/brands?accountId=${influencer.id}&brandId=${brandId}`,
        { method: 'DELETE' }
      );
      
      if (res.ok) {
        alert('✅ מותג נמחק!');
        loadData();
      } else {
        alert('❌ שגיאה במחיקה');
      }
    } catch (error) {
      console.error('Error deleting brand:', error);
      alert('❌ שגיאה במחיקה');
    }
  };

  const handleAddCoupon = () => {
    router.push(`/influencer/${username}/partnerships`);
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

  const handleLogout = async () => {
    await fetch('/api/influencer/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, action: 'logout' }),
    });
    router.push(`/influencer/${username}/login`);
  };

  const toggleSection = (section: string) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section],
    });
  };

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

            <div className="flex items-center gap-2">
              <Link
                href={`/influencer/${username}/dashboard`}
                className="px-3 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                חזרה לדשבורד
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Tag className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{coupons.length}</p>
                <p className="text-sm text-gray-400">קופונים</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Package className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{products.length}</p>
                <p className="text-sm text-gray-400">מוצרים</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Store className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{brands.length}</p>
                <p className="text-sm text-gray-400">מותגים</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Coupons Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6 mb-6"
        >
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => toggleSection('coupons')}
          >
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-green-400" />
              קופונים ({coupons.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddCoupon();
                }}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
              {expandedSections.coupons ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </div>

          {expandedSections.coupons && (
            <div className="space-y-3">
              {coupons.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">אין קופונים</p>
              ) : (
                coupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="flex items-center justify-between p-4 bg-gray-700/30 rounded-xl hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded font-mono font-bold">
                          {coupon.code}
                        </span>
                        <span className="text-sm text-gray-400">{coupon.partnership}</span>
                      </div>
                      <p className="text-sm text-white">{coupon.description}</p>
                      {coupon.discount_type && (
                        <p className="text-xs text-gray-500 mt-1">
                          {coupon.discount_type === 'percentage' && `${coupon.discount_value}% הנחה`}
                          {coupon.discount_type === 'fixed' && `₪${coupon.discount_value} הנחה`}
                          {coupon.discount_type === 'free_shipping' && 'משלוח חינם'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </motion.div>

        {/* Products Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6 mb-6"
        >
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => toggleSection('products')}
          >
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-400" />
              מוצרים ({products.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddProduct();
                }}
                className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
              {expandedSections.products ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </div>

          {expandedSections.products && (
            <div className="space-y-3">
              {products.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">אין מוצרים</p>
              ) : (
                products.map((product, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 bg-gray-700/30 rounded-xl hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{product.name || product.product_name}</p>
                      {product.brand && (
                        <p className="text-xs text-gray-400 mt-1">מותג: {product.brand}</p>
                      )}
                      {product.category && (
                        <p className="text-xs text-gray-500">קטגוריה: {product.category}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteProduct(product.id || product.product_id)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </motion.div>

        {/* Brands Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6 mb-6"
        >
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => toggleSection('brands')}
          >
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Store className="w-5 h-5 text-blue-400" />
              מותגים ({brands.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddBrand();
                }}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
              {expandedSections.brands ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </div>

          {expandedSections.brands && (
            <div className="space-y-3">
              {brands.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">אין מותגים</p>
              ) : (
                brands.map((brand, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 bg-gray-700/30 rounded-xl hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{brand.name || brand.brand_name}</p>
                      {brand.category && (
                        <p className="text-xs text-gray-400 mt-1">קטגוריה: {brand.category}</p>
                      )}
                      {brand.relationship_type && (
                        <p className="text-xs text-gray-500">סוג: {brand.relationship_type}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteBrand(brand.id || brand.brand_id)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </motion.div>

        {/* Chat Config Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
        >
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            הגדרות צ'אט
          </h3>

          {/* Greeting Message */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              הודעת ברכה
            </label>
            <textarea
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={3}
              placeholder="היי! אני הבוט של..."
            />
          </div>

          {/* Suggested Questions */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                שאלות מוצעות
              </label>
              <button
                onClick={handleAddQuestion}
                className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                הוסף שאלה
              </button>
            </div>
            <div className="space-y-2">
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
            onClick={handleSaveConfig}
            disabled={saving}
            className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl transition-all font-medium flex items-center justify-center gap-2"
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
        </motion.div>

        {/* Rebuild Persona */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-6 flex justify-center"
        >
          <button
            onClick={async () => {
              if (confirm('לסרוק מחדש את הפרופיל? זה ייקח מספר דקות')) {
                try {
                  const res = await fetch('/api/persona/rebuild', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: influencer.id }),
                  });
                  if (res.ok) {
                    alert('✅ הסריקה הופעלה! תהליך הבנייה רץ ברקע.');
                    setTimeout(() => loadData(), 5000);
                  } else {
                    alert('❌ שגיאה בהפעלת סריקה');
                  }
                } catch (error) {
                  console.error('Error triggering rebuild:', error);
                  alert('❌ שגיאה בהפעלת סריקה');
                }
              }
            }}
            className="px-6 py-3 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white rounded-xl transition-all font-medium flex items-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            סרוק מחדש ועדכן ידע
          </button>
        </motion.div>
      </main>
    </div>
  );
}
