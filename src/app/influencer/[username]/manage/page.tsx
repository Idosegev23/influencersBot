'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Tag,
  Package,
  Store,
  FileText,
  Copy,
  Check,
  Search,
  Loader2,
  Settings,
  ChefHat,
  Shirt,
  Lightbulb,
  Dumbbell,
  Star,
  ExternalLink,
  Users,
  Percent,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

const contentTypeLabels: Record<string, { label: string; icon: any; color: string }> = {
  recipe: { label: 'מתכון', icon: ChefHat, color: 'text-orange-400' },
  look: { label: 'לוק', icon: Shirt, color: 'text-pink-400' },
  tip: { label: 'טיפ', icon: Lightbulb, color: 'text-yellow-400' },
  workout: { label: 'אימון', icon: Dumbbell, color: 'text-green-400' },
  review: { label: 'ביקורת', icon: Star, color: 'text-purple-400' },
  tutorial: { label: 'מדריך', icon: FileText, color: 'text-blue-400' },
};

// ─── Archetype-specific tab config ───
const ARCHETYPE_TABS: Record<string, { id: string; label: string; icon: any }[]> = {
  influencer: [
    { id: 'coupons', label: 'קופונים', icon: Tag },
    { id: 'brands', label: 'שיתופי פעולה', icon: Store },
    { id: 'content', label: 'תוכן', icon: FileText },
    { id: 'settings', label: 'הגדרות צ׳אט', icon: Settings },
  ],
  brand: [
    { id: 'coupons', label: 'מבצעים וקופונים', icon: Tag },
    { id: 'products', label: 'מוצרים', icon: Package },
    { id: 'content', label: 'תוכן', icon: FileText },
    { id: 'settings', label: 'הגדרות צ׳אט', icon: Settings },
  ],
  service_provider: [
    { id: 'brands', label: 'לקוחות', icon: Users },
    { id: 'content', label: 'תוכן', icon: FileText },
    { id: 'settings', label: 'הגדרות צ׳אט', icon: Settings },
  ],
  media_news: [
    { id: 'content', label: 'תוכן', icon: FileText },
    { id: 'settings', label: 'הגדרות צ׳אט', icon: Settings },
  ],
  local_business: [
    { id: 'coupons', label: 'הטבות וקופונים', icon: Tag },
    { id: 'products', label: 'מוצרים', icon: Package },
    { id: 'content', label: 'תוכן', icon: FileText },
    { id: 'settings', label: 'הגדרות צ׳אט', icon: Settings },
  ],
  tech_creator: [
    { id: 'coupons', label: 'דילים וקופונים', icon: Tag },
    { id: 'content', label: 'תוכן', icon: FileText },
    { id: 'settings', label: 'הגדרות צ׳אט', icon: Settings },
  ],
};

const ARCHETYPE_LABELS: Record<string, { brandsTitle: string; brandsEmpty: string; couponsTitle: string }> = {
  influencer: { brandsTitle: 'שיתופי פעולה', brandsEmpty: 'אין שיתופי פעולה עדיין', couponsTitle: 'קופונים' },
  brand: { brandsTitle: 'שותפים', brandsEmpty: 'אין שותפים עדיין', couponsTitle: 'מבצעים וקופונים' },
  service_provider: { brandsTitle: 'לקוחות', brandsEmpty: 'אין לקוחות עדיין', couponsTitle: 'קופונים' },
  media_news: { brandsTitle: 'שותפים', brandsEmpty: 'אין שותפים עדיין', couponsTitle: 'קופונים' },
  local_business: { brandsTitle: 'שותפים', brandsEmpty: 'אין שותפים עדיין', couponsTitle: 'הטבות וקופונים' },
  tech_creator: { brandsTitle: 'שותפים', brandsEmpty: 'אין שותפים עדיין', couponsTitle: 'דילים וקופונים' },
};

interface CouponItem {
  id: string;
  code: string;
  brand_name: string | null;
  description: string | null;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
}

type TabType = 'coupons' | 'brands' | 'products' | 'content' | 'settings';

export default function ManagePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('coupons');
  const [influencer, setInfluencer] = useState<any>(null);
  const [archetype, setArchetype] = useState<string>('influencer');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [contentItems, setContentItems] = useState<any[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [greetingMessage, setGreetingMessage] = useState('');

  // Coupon editing
  const [editingCoupon, setEditingCoupon] = useState<string | null>(null);
  const [couponForm, setCouponForm] = useState<Partial<CouponItem>>({});
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [showAddCoupon, setShowAddCoupon] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const authRes = await fetch(`/api/influencer/auth?username=${username}`);
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.push(`/influencer/${username}/login`);
        return;
      }

      const infRes = await fetch(`/api/admin/influencers?username=${username}`);
      const infData = await infRes.json();
      const inf = infData.influencers?.[0];
      if (!inf) {
        router.push(`/influencer/${username}/login`);
        return;
      }

      setInfluencer(inf);
      const acct = inf.config || inf;
      const arch = acct.archetype || 'influencer';
      setArchetype(arch);

      // Set default tab based on archetype
      const tabs = ARCHETYPE_TABS[arch] || ARCHETYPE_TABS.influencer;
      setActiveTab(tabs[0].id as TabType);

      // Load coupons (direct, not partnership-scoped)
      const couponsRes = await fetch(`/api/influencer/coupons?username=${username}`);
      if (couponsRes.ok) {
        const couponsData = await couponsRes.json();
        setCoupons(couponsData.coupons || []);
      }

      // Load partnerships/brands (not for brands — they are the brand)
      if (arch !== 'brand') {
        const brandsRes = await fetch(`/api/influencer/partnerships?username=${username}&limit=100`);
        if (brandsRes.ok) {
          const brandsData = await brandsRes.json();
          setBrands(brandsData.partnerships || []);
        }
      }

      // Load products
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
      } catch {}

      setSuggestedQuestions(inf.suggested_questions || []);
      setGreetingMessage(inf.greeting_message || '');
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [username, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Coupon handlers ───

  const handleEditCoupon = (coupon: CouponItem) => {
    setEditingCoupon(coupon.id);
    setCouponForm({
      code: coupon.code,
      brand_name: coupon.brand_name || '',
      description: coupon.description || '',
      discount_type: coupon.discount_type || 'percentage',
      discount_value: coupon.discount_value || 0,
      is_active: coupon.is_active,
    });
  };

  const handleSaveCoupon = async (couponId: string) => {
    setSavingCoupon(true);
    try {
      const res = await fetch(`/api/influencer/coupons?username=${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: couponId, ...couponForm }),
      });
      if (res.ok) {
        const data = await res.json();
        setCoupons(prev => prev.map(c => c.id === couponId ? data.coupon : c));
        setEditingCoupon(null);
      }
    } catch (error) {
      console.error('Error saving coupon:', error);
    } finally {
      setSavingCoupon(false);
    }
  };

  const handleAddCoupon = async () => {
    if (!couponForm.code) return;
    setSavingCoupon(true);
    try {
      const res = await fetch(`/api/influencer/coupons?username=${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(couponForm),
      });
      if (res.ok) {
        const data = await res.json();
        setCoupons(prev => [...prev, data.coupon]);
        setShowAddCoupon(false);
        setCouponForm({});
      }
    } catch (error) {
      console.error('Error adding coupon:', error);
    } finally {
      setSavingCoupon(false);
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (!confirm('למחוק קופון?')) return;
    try {
      const res = await fetch(`/api/influencer/coupons?username=${username}&id=${couponId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCoupons(prev => prev.filter(c => c.id !== couponId));
      }
    } catch (error) {
      console.error('Error deleting coupon:', error);
    }
  };

  const handleToggleCoupon = async (coupon: CouponItem) => {
    try {
      const res = await fetch(`/api/influencer/coupons?username=${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: coupon.id, is_active: !coupon.is_active }),
      });
      if (res.ok) {
        const data = await res.json();
        setCoupons(prev => prev.map(c => c.id === coupon.id ? data.coupon : c));
      }
    } catch (error) {
      console.error('Error toggling coupon:', error);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // ─── Other handlers ───

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
        alert('הגדרות נשמרו!');
      } else {
        alert('שגיאה בשמירה');
      }
    } catch {
      alert('שגיאה בשמירה');
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
      if (res.ok) loadData();
    } catch {}
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('למחוק מוצר?')) return;
    try {
      const res = await fetch(
        `/api/influencer/content/products?accountId=${influencer.id}&productId=${productId}`,
        { method: 'DELETE' }
      );
      if (res.ok) loadData();
    } catch {}
  };

  // ─── Filtering ───

  const filteredCoupons = coupons.filter(c =>
    (c.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.brand_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredBrands = brands.filter(b =>
    (b.brand_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProducts = products.filter(p =>
    (p.name || p.product_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredContent = contentItems.filter(c =>
    (c.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── Resolve tabs ───

  const tabs = ARCHETYPE_TABS[archetype] || ARCHETYPE_TABS.influencer;
  const labels = ARCHETYPE_LABELS[archetype] || ARCHETYPE_LABELS.influencer;

  const inputStyle = {
    background: 'rgba(255,255,255,0.03)',
    borderColor: 'var(--dash-glass-border)',
    color: 'var(--dash-text)',
    border: '1px solid var(--dash-glass-border)',
  };

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    borderColor: 'var(--dash-glass-border)',
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl" style={{ background: 'transparent' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (!influencer) return null;

  // ─── Coupon edit form (shared between add/edit) ───
  const renderCouponForm = (onSave: () => void, onCancel: () => void) => (
    <div className="rounded-xl border p-4 space-y-3" style={cardStyle}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-2)' }}>קוד קופון</label>
          <input
            type="text"
            value={couponForm.code || ''}
            onChange={e => setCouponForm(f => ({ ...f, code: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={inputStyle}
            placeholder="COUPON10"
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-2)' }}>מותג</label>
          <input
            type="text"
            value={couponForm.brand_name || ''}
            onChange={e => setCouponForm(f => ({ ...f, brand_name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={inputStyle}
            placeholder="שם המותג"
          />
        </div>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-2)' }}>תיאור ההנחה</label>
        <input
          type="text"
          value={couponForm.description || ''}
          onChange={e => setCouponForm(f => ({ ...f, description: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          style={inputStyle}
          placeholder="לדוגמא: 20% הנחה על כל המוצרים"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-2)' }}>סוג הנחה</label>
          <select
            value={couponForm.discount_type || 'percentage'}
            onChange={e => setCouponForm(f => ({ ...f, discount_type: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={inputStyle}
          >
            <option value="percentage">אחוז (%)</option>
            <option value="fixed">סכום קבוע (₪)</option>
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-2)' }}>ערך הנחה</label>
          <input
            type="number"
            value={couponForm.discount_value || ''}
            onChange={e => setCouponForm(f => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={inputStyle}
            placeholder="10"
            dir="ltr"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={savingCoupon}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm btn-primary disabled:opacity-50"
        >
          {savingCoupon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          שמור
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm"
          style={{ color: 'var(--dash-text-2)' }}
        >
          <X className="w-3.5 h-3.5" />
          ביטול
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Dynamic Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            const count = tab.id === 'coupons' ? coupons.length
              : tab.id === 'brands' ? brands.length
              : tab.id === 'products' ? products.length
              : tab.id === 'content' ? contentItems.length
              : null;

            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as TabType); setSearchQuery(''); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id ? 'btn-primary' : 'pill pill-neutral'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}{count !== null ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* Search (for data tabs) */}
        {['coupons', 'brands', 'products', 'content'].includes(activeTab) && (
          <div className="relative mb-6">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--dash-text-2)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="חיפוש..."
              className="w-full pr-10 pl-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={inputStyle}
            />
          </div>
        )}

        {/* ═══ COUPONS TAB ═══ */}
        {activeTab === 'coupons' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold" style={{ color: 'var(--dash-text)' }}>{labels.couponsTitle}</h2>
              <button
                onClick={() => {
                  setShowAddCoupon(true);
                  setCouponForm({ discount_type: 'percentage', is_active: true });
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors btn-primary"
              >
                <Plus className="w-4 h-4" />
                הוסף קופון
              </button>
            </div>

            {/* Add coupon form */}
            {showAddCoupon && renderCouponForm(
              handleAddCoupon,
              () => { setShowAddCoupon(false); setCouponForm({}); }
            )}

            {filteredCoupons.length === 0 && !showAddCoupon ? (
              <div className="text-center py-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Tag className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dash-text-3)' }} />
                <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--dash-text)' }}>אין קופונים עדיין</h3>
                <p className="mb-6" style={{ color: 'var(--dash-text-2)' }}>הוסיפו קופונים שהבוט יציג לעוקבים</p>
              </div>
            ) : (
              <div className="space-y-3 mt-4">
                {filteredCoupons.map(coupon => (
                  <div key={coupon.id}>
                    {editingCoupon === coupon.id ? (
                      renderCouponForm(
                        () => handleSaveCoupon(coupon.id),
                        () => { setEditingCoupon(null); setCouponForm({}); }
                      )
                    ) : (
                      <div
                        className="rounded-xl border p-4 transition-all"
                        style={{
                          ...cardStyle,
                          opacity: coupon.is_active ? 1 : 0.5,
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span
                                className="font-mono text-sm font-bold px-2.5 py-1 rounded-lg cursor-pointer"
                                style={{ background: coupon.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(128,128,128,0.1)', color: coupon.is_active ? '#22c55e' : 'var(--dash-text-3)' }}
                                onClick={() => handleCopyCode(coupon.code)}
                              >
                                {coupon.code}
                                {copiedCode === coupon.code && <Check className="w-3 h-3 inline mr-1" />}
                              </span>

                              {coupon.brand_name && (
                                <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                                  {coupon.brand_name}
                                </span>
                              )}

                              {coupon.discount_value > 0 && (
                                <span className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
                                  {coupon.discount_type === 'fixed' ? `₪${coupon.discount_value}` : `${coupon.discount_value}%`}
                                </span>
                              )}
                            </div>

                            {coupon.description && (
                              <p className="text-sm mt-1" style={{ color: 'var(--dash-text-2)' }}>
                                {coupon.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 mr-2 flex-shrink-0">
                            <button
                              onClick={() => handleToggleCoupon(coupon)}
                              className="p-1.5 rounded-lg transition-colors"
                              title={coupon.is_active ? 'כבה' : 'הפעל'}
                              style={{ color: coupon.is_active ? '#22c55e' : 'var(--dash-text-3)' }}
                            >
                              {coupon.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                            </button>
                            <button
                              onClick={() => handleEditCoupon(coupon)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--dash-text-2)' }}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCoupon(coupon.id)}
                              className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ BRANDS/PARTNERSHIPS TAB ═══ */}
        {activeTab === 'brands' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold" style={{ color: 'var(--dash-text)' }}>{labels.brandsTitle}</h2>
              <button
                onClick={() => router.push(`/influencer/${username}/partnerships/new`)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors btn-primary"
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
            </div>

            {filteredBrands.length === 0 ? (
              <div className="text-center py-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Store className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dash-text-3)' }} />
                <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--dash-text)' }}>{labels.brandsEmpty}</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBrands.map(brand => (
                  <div key={brand.id} className="p-5 rounded-xl border transition-all" style={cardStyle}>
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-lg" style={{ color: 'var(--dash-text)' }}>
                        {brand.brand_name}
                      </h3>
                      <Link
                        href={`/influencer/${username}/partnerships/${brand.id}`}
                        className="p-2 rounded-xl transition-colors"
                        style={{ color: 'var(--dash-text-2)' }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>
                    </div>
                    {brand.category && (
                      <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{brand.category}</span>
                    )}
                    {brand.description && (
                      <p className="text-sm mt-2 line-clamp-2" style={{ color: 'var(--dash-text-2)' }}>{brand.description}</p>
                    )}
                    {brand.website && (
                      <a
                        href={brand.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 mt-2 text-xs"
                        style={{ color: 'var(--dash-text-3)' }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        אתר
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ PRODUCTS TAB ═══ */}
        {activeTab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold" style={{ color: 'var(--dash-text)' }}>מוצרים</h2>
              <button onClick={handleAddProduct} className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors btn-primary">
                <Plus className="w-4 h-4" />
                הוסף מוצר
              </button>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="text-center py-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Package className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dash-text-3)' }} />
                <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--dash-text)' }}>אין מוצרים עדיין</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map((product, idx) => (
                  <div key={product.id || idx} className="p-4 rounded-xl border transition-all" style={cardStyle}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold" style={{ color: 'var(--dash-text)' }}>
                          {product.name || product.product_name}
                        </h3>
                        {product.brand && (
                          <p className="text-sm mt-1" style={{ color: 'var(--dash-text-2)' }}>מותג: {product.brand}</p>
                        )}
                        {product.category && (
                          <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>קטגוריה: {product.category}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteProduct(product.id || product.product_id)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ CONTENT TAB ═══ */}
        {activeTab === 'content' && (
          <div>
            <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--dash-text)' }}>תוכן מפוסטים</h2>

            {filteredContent.length === 0 ? (
              <div className="text-center py-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <FileText className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dash-text-3)' }} />
                <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--dash-text)' }}>אין תוכן עדיין</h3>
                <p style={{ color: 'var(--dash-text-2)' }}>התוכן נסרק אוטומטית מהפוסטים שלך באינסטגרם</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredContent.map((item: any) => {
                  const typeInfo = contentTypeLabels[item.type] || { label: item.type, icon: FileText, color: 'text-gray-400' };
                  const TypeIcon = typeInfo.icon;
                  return (
                    <div key={item.id} className="rounded-xl border overflow-hidden transition-all" style={cardStyle}>
                      {item.image_url && (
                        <div className="relative h-40" style={{ background: 'transparent' }}>
                          <Image src={item.image_url} alt={item.title} fill className="object-cover" unoptimized />
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <TypeIcon className={`w-4 h-4 ${typeInfo.color}`} />
                          <span className="text-xs" style={{ color: 'var(--dash-text-2)' }}>{typeInfo.label}</span>
                        </div>
                        <h3 className="font-semibold mb-2 line-clamp-2" style={{ color: 'var(--dash-text)' }}>
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="text-sm line-clamp-3" style={{ color: 'var(--dash-text-2)' }}>{item.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ SETTINGS TAB ═══ */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--dash-text)' }}>הגדרות צ׳אט</h2>

            <div className="space-y-6">
              <div className="rounded-xl border p-6" style={cardStyle}>
                <label className="block text-sm font-medium mb-3" style={{ color: 'var(--dash-text-2)' }}>
                  הודעת ברכה
                </label>
                <textarea
                  value={greetingMessage}
                  onChange={e => setGreetingMessage(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={4}
                  placeholder="היי! אני הבוט של..."
                  style={inputStyle}
                />
              </div>

              <div className="rounded-xl border p-6" style={cardStyle}>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium" style={{ color: 'var(--dash-text-2)' }}>
                    שאלות מוצעות
                  </label>
                  <button
                    onClick={() => setSuggestedQuestions([...suggestedQuestions, ''])}
                    className="px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1 btn-primary"
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
                        onChange={e => {
                          const updated = [...suggestedQuestions];
                          updated[idx] = e.target.value;
                          setSuggestedQuestions(updated);
                        }}
                        className="flex-1 px-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder={`שאלה ${idx + 1}`}
                        style={inputStyle}
                      />
                      <button
                        onClick={() => setSuggestedQuestions(suggestedQuestions.filter((_, i) => i !== idx))}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
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

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full px-6 py-4 disabled:opacity-50 rounded-xl transition-all font-medium flex items-center justify-center gap-2 text-lg btn-primary"
              >
                {saving ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />שומר...</>
                ) : (
                  <><Save className="w-5 h-5" />שמור הגדרות</>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
