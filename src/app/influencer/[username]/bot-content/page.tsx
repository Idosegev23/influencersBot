'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
      <div
        className="min-h-screen flex items-center justify-center"
        dir="rtl"
        style={{ background: 'var(--dash-bg)' }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div
      className="min-h-screen"
      dir="rtl"
      style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}
    >
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div
            className="rounded-xl border p-5"
            style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                <Tag className="w-6 h-6" style={{ color: 'var(--dash-positive)' }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>{coupons.length}</p>
                <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>קופונים</p>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl border p-5"
            style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.15)' }}>
                <Package className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>{products.length}</p>
                <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>מוצרים</p>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl border p-5"
            style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
                <Store className="w-6 h-6" style={{ color: 'var(--color-info)' }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>{brands.length}</p>
                <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>מותגים</p>
              </div>
            </div>
          </div>
        </div>

        {/* Coupons Section */}
        <div
          className="rounded-xl border p-6 mb-6"
          style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
        >
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => toggleSection('coupons')}
          >
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
              <Tag className="w-5 h-5" style={{ color: 'var(--dash-positive)' }} />
              קופונים ({coupons.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddCoupon();
                }}
                className="px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1"
                style={{ background: 'var(--dash-positive)', color: 'white' }}
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
              {expandedSections.coupons ? (
                <ChevronUp className="w-5 h-5" style={{ color: 'var(--dash-text-2)' }} />
              ) : (
                <ChevronDown className="w-5 h-5" style={{ color: 'var(--dash-text-2)' }} />
              )}
            </div>
          </div>

          {expandedSections.coupons && (
            <div className="space-y-3">
              {coupons.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--dash-text-2)' }}>אין קופונים</p>
              ) : (
                coupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="flex items-center justify-between p-4 rounded-xl transition-colors"
                    style={{ background: 'var(--dash-surface-hover)' }}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="px-2 py-1 text-xs rounded font-mono font-bold"
                          style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--dash-positive)' }}
                        >
                          {coupon.code}
                        </span>
                        <span className="text-sm" style={{ color: 'var(--dash-text-2)' }}>{coupon.partnership}</span>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--dash-text)' }}>{coupon.description}</p>
                      {coupon.discount_type && (
                        <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>
                          {coupon.discount_type === 'percentage' && `${coupon.discount_value}% הנחה`}
                          {coupon.discount_type === 'fixed' && `₪${coupon.discount_value} הנחה`}
                          {coupon.discount_type === 'free_shipping' && 'משלוח חינם'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 rounded-lg transition-colors" style={{ color: 'var(--dash-text-2)' }}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 rounded-lg transition-colors" style={{ color: 'var(--dash-negative)' }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Products Section */}
        <div
          className="rounded-xl border p-6 mb-6"
          style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
        >
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => toggleSection('products')}
          >
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
              <Package className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
              מוצרים ({products.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddProduct();
                }}
                className="px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
              {expandedSections.products ? (
                <ChevronUp className="w-5 h-5" style={{ color: 'var(--dash-text-2)' }} />
              ) : (
                <ChevronDown className="w-5 h-5" style={{ color: 'var(--dash-text-2)' }} />
              )}
            </div>
          </div>

          {expandedSections.products && (
            <div className="space-y-3">
              {products.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--dash-text-2)' }}>אין מוצרים</p>
              ) : (
                products.map((product, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 rounded-xl transition-colors"
                    style={{ background: 'var(--dash-surface-hover)' }}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>{product.name || product.product_name}</p>
                      {product.brand && (
                        <p className="text-xs mt-1" style={{ color: 'var(--dash-text-2)' }}>מותג: {product.brand}</p>
                      )}
                      {product.category && (
                        <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>קטגוריה: {product.category}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteProduct(product.id || product.product_id)}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--dash-negative)' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Brands Section */}
        <div
          className="rounded-xl border p-6 mb-6"
          style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
        >
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => toggleSection('brands')}
          >
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
              <Store className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
              מותגים ({brands.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddBrand();
                }}
                className="px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1"
                style={{ background: 'var(--color-info)', color: 'white' }}
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
              {expandedSections.brands ? (
                <ChevronUp className="w-5 h-5" style={{ color: 'var(--dash-text-2)' }} />
              ) : (
                <ChevronDown className="w-5 h-5" style={{ color: 'var(--dash-text-2)' }} />
              )}
            </div>
          </div>

          {expandedSections.brands && (
            <div className="space-y-3">
              {brands.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--dash-text-2)' }}>אין מותגים</p>
              ) : (
                brands.map((brand, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 rounded-xl transition-colors"
                    style={{ background: 'var(--dash-surface-hover)' }}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>{brand.name || brand.brand_name}</p>
                      {brand.category && (
                        <p className="text-xs mt-1" style={{ color: 'var(--dash-text-2)' }}>קטגוריה: {brand.category}</p>
                      )}
                      {brand.relationship_type && (
                        <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>סוג: {brand.relationship_type}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteBrand(brand.id || brand.brand_id)}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--dash-negative)' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Chat Config Section */}
        <div
          className="rounded-xl border p-6"
          style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
        >
          <h3 className="font-semibold flex items-center gap-2 mb-4" style={{ color: 'var(--dash-text)' }}>
            <MessageSquare className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            הגדרות צ'אט
          </h3>

          {/* Greeting Message */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>
              הודעת ברכה
            </label>
            <textarea
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2"
              style={{
                background: 'var(--dash-surface)',
                borderColor: 'var(--dash-border)',
                color: 'var(--dash-text)',
                border: '1px solid var(--dash-border)',
              }}
              rows={3}
              placeholder="היי! אני הבוט של..."
            />
          </div>

          {/* Suggested Questions */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--dash-text-2)' }}>
                שאלות מוצעות
              </label>
              <button
                onClick={handleAddQuestion}
                className="px-2 py-1 text-xs rounded transition-colors flex items-center gap-1"
                style={{ background: 'var(--color-primary)', color: 'white' }}
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
                    className="flex-1 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 text-sm"
                    style={{
                      background: 'var(--dash-surface)',
                      borderColor: 'var(--dash-border)',
                      color: 'var(--dash-text)',
                      border: '1px solid var(--dash-border)',
                    }}
                    placeholder={`שאלה ${idx + 1}`}
                  />
                  <button
                    onClick={() => handleDeleteQuestion(idx)}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--dash-negative)' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {suggestedQuestions.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--dash-text-2)' }}>אין שאלות מוצעות</p>
              )}
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="w-full px-6 py-3 disabled:opacity-50 rounded-xl transition-all font-medium flex items-center justify-center gap-2"
            style={{ background: 'var(--color-primary)', color: 'white' }}
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

        {/* Rebuild Persona */}
        <div className="mt-6 flex justify-center">
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
            className="px-6 py-3 rounded-xl transition-all font-medium flex items-center gap-2"
            style={{ background: 'var(--dash-positive)', color: 'white' }}
          >
            <RefreshCw className="w-5 h-5" />
            סרוק מחדש ועדכן ידע
          </button>
        </div>
      </main>
    </div>
  );
}
