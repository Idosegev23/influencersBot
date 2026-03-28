'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

// ============================================
// Types
// ============================================

interface WidgetSettings {
  welcomeMessage?: string;
  placeholder?: string;
  position?: 'bottom-right' | 'bottom-left';
  prompt?: {
    additionalInstructions?: string;
    tone?: 'friendly' | 'professional' | 'casual' | 'formal';
    focusTopics?: string[];
    bannedTopics?: string[];
    faq?: Array<{ question: string; answer: string }>;
  };
}

interface KnowledgeEntry {
  id: string;
  knowledge_type: string;
  title: string;
  content: string;
  keywords: string[];
  is_active: boolean;
  priority: number;
  times_used: number;
  created_at: string;
}

interface ScrapedPage {
  id: string;
  url: string;
  page_title: string;
  page_description: string;
  page_content: string;
  hasFullContent: boolean;
  word_count: number;
  processing_status: string;
  scraped_at: string;
  ragChunks: number;
  thumbnail: string | null;
  productName: string | null;
}

// ============================================
// Main Component
// ============================================

export default function ManagePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const tabParam = searchParams.get('tab') as 'instructions' | 'faq' | 'pages' | 'knowledge' | 'products' | 'design' | null;

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [domain, setDomain] = useState('');

  // Tab state
  const [activeTab, setActiveTab] = useState<'instructions' | 'faq' | 'pages' | 'knowledge' | 'products' | 'design'>(tabParam || 'instructions');

  // Settings state
  const [settings, setSettings] = useState<WidgetSettings>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // FAQ state
  const [faqItems, setFaqItems] = useState<Array<{ question: string; answer: string }>>([]);
  const [newFaqQ, setNewFaqQ] = useState('');
  const [newFaqA, setNewFaqA] = useState('');

  // Instructions state
  const [instructions, setInstructions] = useState('');
  const [tone, setTone] = useState<string>('friendly');
  const [focusTopics, setFocusTopics] = useState<string[]>([]);
  const [bannedTopics, setBannedTopics] = useState<string[]>([]);
  const [newFocus, setNewFocus] = useState('');
  const [newBanned, setNewBanned] = useState('');

  // Pages state
  const [pages, setPages] = useState<ScrapedPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [expandedPage, setExpandedPage] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<string | null>(null);
  const [editPageContent, setEditPageContent] = useState('');

  // Knowledge state
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [showAddKnowledge, setShowAddKnowledge] = useState(false);
  const [newKnowledge, setNewKnowledge] = useState({ title: '', content: '', knowledge_type: 'custom', keywords: '' });

  // Products state
  const [products, setProducts] = useState<any[]>([]);
  const [productSeries, setProductSeries] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<any>(null);

  // Design state
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [widgetPosition, setWidgetPosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');

  // Live preview state
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // ============================================
  // Auth
  // ============================================

  useEffect(() => {
    async function authenticate() {
      try {
        const res = await fetch('/api/manage/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (data.success) {
          setIsAuthenticated(true);
          setAccountId(data.accountId);
          setDisplayName(data.displayName);
          setDomain(data.domain);
        }
      } catch (err) {
        console.error('Auth failed:', err);
      } finally {
        setIsLoading(false);
      }
    }
    authenticate();
  }, [token]);

  // ============================================
  // Load Settings
  // ============================================

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/manage/settings');
      const data = await res.json();
      if (data.success) {
        const w = data.widget || {};
        setSettings(w);
        setInstructions(w.prompt?.additionalInstructions || '');
        setTone(w.prompt?.tone || 'friendly');
        setFocusTopics(w.prompt?.focusTopics || []);
        setBannedTopics(w.prompt?.bannedTopics || []);
        setFaqItems(w.prompt?.faq || []);
        setWelcomeMessage(w.welcomeMessage || '');
        setWidgetPosition(w.position || 'bottom-right');
        if (data.displayName) setDisplayName(data.displayName);
        if (data.domain) setDomain(data.domain);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadSettings();
  }, [isAuthenticated, loadSettings]);

  // ============================================
  // Save helpers
  // ============================================

  const savePromptSettings = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/manage/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: {
            additionalInstructions: instructions,
            tone,
            focusTopics,
            bannedTopics,
            faq: faqItems,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMsg('נשמר בהצלחה!');
        setTimeout(() => setSaveMsg(''), 3000);
      }
    } catch {
      setSaveMsg('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const saveDesignSettings = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/manage/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          welcomeMessage,
          position: widgetPosition,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMsg('נשמר בהצלחה!');
        setTimeout(() => setSaveMsg(''), 3000);
      }
    } catch {
      setSaveMsg('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // Pages
  // ============================================

  const loadPages = async () => {
    setPagesLoading(true);
    try {
      const res = await fetch('/api/manage/pages');
      const data = await res.json();
      if (data.success) setPages(data.pages || []);
    } catch (err) {
      console.error('Failed to load pages:', err);
    } finally {
      setPagesLoading(false);
    }
  };

  const deletePage = async (id: string) => {
    if (!confirm('למחוק את הדף הזה? פעולה זו לא ניתנת לביטול.')) return;
    try {
      const res = await fetch('/api/manage/pages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if ((await res.json()).success) {
        setPages(prev => prev.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete page:', err);
    }
  };

  const savePageEdit = async (id: string) => {
    try {
      const res = await fetch('/api/manage/pages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, page_content: editPageContent }),
      });
      if ((await res.json()).success) {
        setPages(prev => prev.map(p => p.id === id ? { ...p, page_content: editPageContent.substring(0, 500) } : p));
        setEditingPage(null);
        setEditPageContent('');
      }
    } catch (err) {
      console.error('Failed to save page:', err);
    }
  };

  // ============================================
  // Knowledge
  // ============================================

  const loadKnowledge = async () => {
    setKnowledgeLoading(true);
    try {
      const res = await fetch('/api/manage/knowledge?active_only=false');
      const data = await res.json();
      if (data.success) setKnowledge(data.entries || []);
    } catch (err) {
      console.error('Failed to load knowledge:', err);
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const addKnowledge = async () => {
    if (!newKnowledge.title || !newKnowledge.content) return;
    try {
      const res = await fetch('/api/manage/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newKnowledge,
          keywords: newKnowledge.keywords.split(',').map(k => k.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setKnowledge(prev => [data.entry, ...prev]);
        setNewKnowledge({ title: '', content: '', knowledge_type: 'custom', keywords: '' });
        setShowAddKnowledge(false);
      }
    } catch (err) {
      console.error('Failed to add knowledge:', err);
    }
  };

  const toggleKnowledge = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch('/api/manage/knowledge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      });
      if ((await res.json()).success) {
        setKnowledge(prev => prev.map(k => k.id === id ? { ...k, is_active: !currentActive } : k));
      }
    } catch (err) {
      console.error('Failed to toggle knowledge:', err);
    }
  };

  const deleteKnowledge = async (id: string) => {
    if (!confirm('למחוק את הערך הזה?')) return;
    try {
      const res = await fetch('/api/manage/knowledge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if ((await res.json()).success) {
        setKnowledge(prev => prev.filter(k => k.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete knowledge:', err);
    }
  };

  // ============================================
  // Products
  // ============================================

  const loadProducts = async () => {
    setProductsLoading(true);
    try {
      const res = await fetch('/api/manage/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
        setProductSeries(data.series || []);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setProductsLoading(false);
    }
  };

  const extractProducts = async () => {
    setExtracting(true);
    setExtractResult(null);
    try {
      const res = await fetch('/api/manage/products/extract', { method: 'POST' });
      const data = await res.json();
      setExtractResult(data);
      if (data.success) {
        loadProducts(); // Refresh list
      }
    } catch (err) {
      console.error('Failed to extract products:', err);
      setExtractResult({ error: 'שגיאה בחילוץ מוצרים' });
    } finally {
      setExtracting(false);
    }
  };

  const toggleFeatured = async (id: string, current: boolean) => {
    try {
      const res = await fetch('/api/manage/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_featured: !current }),
      });
      if ((await res.json()).success) {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, is_featured: !current } : p));
      }
    } catch (err) {
      console.error('Failed to toggle featured:', err);
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('למחוק את המוצר הזה?')) return;
    try {
      const res = await fetch('/api/manage/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if ((await res.json()).success) {
        setProducts(prev => prev.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete product:', err);
    }
  };

  // ============================================
  // Tab loading
  // ============================================

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'pages' && pages.length === 0) loadPages();
    if (activeTab === 'knowledge' && knowledge.length === 0) loadKnowledge();
    if (activeTab === 'products' && products.length === 0) loadProducts();
  }, [activeTab, isAuthenticated]);

  // ============================================
  // Render
  // ============================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#fff8f1' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#006c4e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#655e51] font-medium">טוען...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#fff8f1' }}>
        <div className="bg-white p-8 rounded-xl max-w-md text-center" style={{ boxShadow: '0 20px 40px rgba(71, 71, 71, 0.06)' }}>
          <div className="w-16 h-16 rounded-full bg-[#FF76B0]/15 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[#FF76B0]" style={{ fontSize: 32 }}>lock</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-[#1e1b15] mb-2 font-headline">הלינק לא תקף</h1>
          <p className="text-[#655e51]">הלינק פג תוקף או לא חוקי. פנה למנהל המערכת לקבלת לינק חדש.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'instructions' as const, label: 'הנחיות לבוט', icon: 'smart_toy' },
    { id: 'faq' as const, label: 'שאלות נפוצות', icon: 'help' },
    { id: 'pages' as const, label: 'דפים סרוקים', icon: 'article' },
    { id: 'knowledge' as const, label: 'ידע נוסף', icon: 'menu_book' },
    { id: 'products' as const, label: 'מוצרים', icon: 'shopping_bag' },
    { id: 'design' as const, label: 'הגדרות ווידג\'ט', icon: 'palette' },
  ];

  const customShadow = { boxShadow: '0 20px 40px rgba(71, 71, 71, 0.06)' };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fff8f1' }}>
      {/* Glass Header */}
      <header className="fixed top-0 left-0 right-0 z-50" style={{ backgroundColor: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          {/* Right side (RTL): Brand + hamburger */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-[#655e51] hover:bg-white/80 transition-colors"
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{showMobileSidebar ? 'close' : 'menu'}</span>
            </button>
            <span className="text-lg md:text-xl font-bold text-[#006c4e] font-headline">Widget Manager</span>
            {domain && <span className="hidden sm:inline text-sm text-[#655e51]">{domain}</span>}
          </div>
          {/* Left side (RTL): Actions */}
          <div className="flex items-center gap-2 md:gap-3">
            {saveMsg && (
              <span className={`hidden sm:inline text-sm px-4 py-1.5 rounded-full font-medium ${saveMsg.includes('הצלחה') ? 'bg-[#65fcc4]/20 text-[#006c4e]' : 'bg-[#FF76B0]/15 text-[#a72f68]'}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={() => setShowLivePreview(true)}
              className="hidden sm:flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-full transition-all"
              style={{ backgroundColor: '#e1e0ff', color: '#575a8c' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>visibility</span>
              צפייה חיה
            </button>
            <button className="w-9 h-9 rounded-full flex items-center justify-center text-[#655e51] hover:bg-white/80 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>help_outline</span>
            </button>
            <button className="w-9 h-9 rounded-full flex items-center justify-center text-[#655e51] hover:bg-white/80 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setShowMobileSidebar(false)} />
      )}

      {/* Main layout: Content + Sidebar */}
      <div className="flex pt-16 md:pt-20" dir="rtl">
        {/* Right-side Sidebar Navigation */}
        <aside className={`
          fixed md:sticky top-16 md:top-20 right-0 h-[calc(100vh-64px)] md:h-[calc(100vh-80px)] w-64 md:w-72 flex-shrink-0 flex flex-col gap-4 p-4 md:p-6 items-end text-right z-40
          transition-transform duration-300 ease-in-out
          ${showMobileSidebar ? 'translate-x-0' : 'translate-x-full'}
          md:translate-x-0
        `} style={{ backgroundColor: '#faf2e9' }}>
          {/* Sidebar Header */}
          <div className="mb-2 w-full text-right">
            <h2 className="text-lg font-bold text-[#006c4e] font-headline">לוח ניהול</h2>
            <p className="text-sm text-[#655e51]">{displayName || 'Management Dashboard'}</p>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 w-full">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setShowMobileSidebar(false); }}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm w-full text-right transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-[#006c4e] rounded-full font-medium'
                    : 'text-[#655e51] hover:bg-white/50 rounded-full'
                }`}
                style={activeTab === tab.id ? { boxShadow: '0 2px 8px rgba(0,0,0,0.04)' } : undefined}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: activeTab === tab.id ? '#006c4e' : '#655e51' }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 px-4 md:px-8 py-6 md:py-8 max-w-[1100px]">
          {/* Tab 1: Instructions */}
          {activeTab === 'instructions' && (
            <div>
              {/* Section Title */}
              <div className="mb-8">
                <h1 className="text-2xl md:text-2xl sm:text-4xl font-extrabold text-[#1e1b15] font-headline">הנחיות לבוט</h1>
                <p className="text-[#655e51] mt-2">ספר לבוט איך להתנהג -- ההנחיות האלו מתווספות מעל ההנחיות הבסיסיות</p>
              </div>

              {/* Bento Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                {/* Instructions textarea - col-span-8 */}
                <div className="lg:col-span-8">
                  <div className="bg-white p-4 sm:p-8 rounded-xl" style={customShadow}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="material-symbols-outlined text-[#006c4e]" style={{ fontSize: 22 }}>smart_toy</span>
                      <h3 className="text-lg sm:text-xl font-bold text-[#1e1b15]">הנחיות מותאמות</h3>
                    </div>
                    <div className="relative">
                      <textarea
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                        placeholder="לדוגמה: תמיד הצע מוצרים ממבצע השבוע. אל תציע מוצרים שאזלו מהמלאי. דבר בצורה חמה ואישית..."
                        className="w-full h-40 rounded-xl text-sm resize-y p-4 outline-none transition-colors"
                        style={{ backgroundColor: '#faf2e9', border: '1px solid #c6c6c6', borderRight: '4px solid #65fcc4' }}
                        maxLength={1000}
                      />
                      <span
                        className="absolute bottom-3 left-3 text-xs px-2.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: '#e1e0ff', color: '#575a8c' }}
                      >
                        {instructions.length}/1000
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tone selection - col-span-4 */}
                <div className="lg:col-span-4">
                  <div className="bg-white p-8 rounded-xl h-full" style={customShadow}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="material-symbols-outlined text-[#575a8c]" style={{ fontSize: 22 }}>record_voice_over</span>
                      <h3 className="text-lg sm:text-xl font-bold text-[#1e1b15]">טון שיחה</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'friendly', label: 'ידידותי/חברותי', icon: 'sentiment_very_satisfied' },
                        { value: 'professional', label: 'מקצועי', icon: 'work' },
                        { value: 'casual', label: 'קז\'ואלי/יומיומי', icon: 'coffee' },
                        { value: 'formal', label: 'פורמלי', icon: 'gavel' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setTone(opt.value)}
                          className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                            tone === opt.value
                              ? 'border-[#e1e0ff] bg-[#e1e0ff]/30'
                              : 'border-[#c6c6c6] hover:border-[#e1e0ff] bg-white'
                          }`}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 28, color: tone === opt.value ? '#575a8c' : '#655e51' }}>{opt.icon}</span>
                          <div className="font-medium text-xs text-[#373226]">{opt.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Focus topics - col-span-6 */}
                <div className="lg:col-span-6">
                  <div className="bg-white p-4 sm:p-8 rounded-xl" style={customShadow}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="material-symbols-outlined text-[#006c4e]" style={{ fontSize: 22 }}>bookmark</span>
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-[#1e1b15]">נושאים לדגש</h3>
                        <p className="text-sm text-[#655e51]">הבוט יתמקד בנושאים האלו</p>
                      </div>
                    </div>
                    <TagInput
                      tags={focusTopics}
                      onAdd={(tag) => setFocusTopics(prev => [...prev, tag])}
                      onRemove={(idx) => setFocusTopics(prev => prev.filter((_, i) => i !== idx))}
                      value={newFocus}
                      onChange={setNewFocus}
                      placeholder="הוסף נושא..."
                      color="focus"
                    />
                  </div>
                </div>

                {/* Banned topics - col-span-6 */}
                <div className="lg:col-span-6">
                  <div className="bg-white p-4 sm:p-8 rounded-xl" style={customShadow}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="material-symbols-outlined text-[#a72f68]" style={{ fontSize: 22 }}>block</span>
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-[#1e1b15]">נושאים חסומים</h3>
                        <p className="text-sm text-[#655e51]">הבוט יסרב לדון בנושאים האלו</p>
                      </div>
                    </div>
                    <TagInput
                      tags={bannedTopics}
                      onAdd={(tag) => setBannedTopics(prev => [...prev, tag])}
                      onRemove={(idx) => setBannedTopics(prev => prev.filter((_, i) => i !== idx))}
                      value={newBanned}
                      onChange={setNewBanned}
                      placeholder="הוסף נושא חסום..."
                      color="banned"
                    />
                  </div>
                </div>

                {/* Save button - col-span-12 */}
                <div className="lg:col-span-12">
                  <button
                    onClick={savePromptSettings}
                    disabled={saving}
                    className="px-8 py-3 rounded-full font-medium text-[#1e1b15] disabled:opacity-50 transition-all hover:brightness-95"
                    style={{ backgroundColor: '#65fcc4' }}
                  >
                    {saving ? 'שומר...' : 'שמור הנחיות'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: FAQ */}
          {activeTab === 'faq' && (
            <div>
              <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-4xl font-extrabold text-[#1e1b15] font-headline">שאלות נפוצות</h1>
                <p className="text-[#655e51] mt-2">הבוט יענה על שאלות אלו בעדיפות גבוהה</p>
              </div>

              <div className="space-y-6">
                <div className="bg-white p-4 sm:p-8 rounded-xl" style={customShadow}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined text-[#006c4e]" style={{ fontSize: 22 }}>help</span>
                    <h3 className="text-lg sm:text-xl font-bold text-[#1e1b15]">רשימת שאלות</h3>
                  </div>

                  <div className="space-y-3">
                    {faqItems.map((item, idx) => (
                      <div key={idx} className="border border-[#c6c6c6] rounded-xl p-4" style={{ backgroundColor: '#faf2e9' }}>
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-medium text-sm text-[#1e1b15]">ש: {item.question}</div>
                          <button
                            onClick={() => setFaqItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-[#a72f68] hover:text-[#FF76B0] text-sm mr-2 font-medium"
                          >
                            מחק
                          </button>
                        </div>
                        <div className="text-sm text-[#655e51]">ת: {item.answer}</div>
                      </div>
                    ))}

                    {faqItems.length === 0 && (
                      <p className="text-[#655e51] text-sm text-center py-4">אין שאלות נפוצות עדיין</p>
                    )}
                  </div>

                  <div className="mt-4 border-t border-[#c6c6c6] pt-4 space-y-3">
                    <input
                      value={newFaqQ}
                      onChange={e => setNewFaqQ(e.target.value)}
                      placeholder="שאלה..."
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border border-[#c6c6c6]"
                      style={{ backgroundColor: '#faf2e9' }}
                    />
                    <textarea
                      value={newFaqA}
                      onChange={e => setNewFaqA(e.target.value)}
                      placeholder="תשובה..."
                      className="w-full h-20 px-4 py-2.5 rounded-xl text-sm resize-y outline-none border border-[#c6c6c6]"
                      style={{ backgroundColor: '#faf2e9' }}
                    />
                    <button
                      onClick={() => {
                        if (newFaqQ.trim() && newFaqA.trim()) {
                          setFaqItems(prev => [...prev, { question: newFaqQ.trim(), answer: newFaqA.trim() }]);
                          setNewFaqQ('');
                          setNewFaqA('');
                        }
                      }}
                      disabled={!newFaqQ.trim() || !newFaqA.trim()}
                      className="px-4 py-2 text-sm font-medium rounded-full border border-[#c6c6c6] text-[#655e51] hover:bg-white disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                      הוסף שאלה
                    </button>
                  </div>
                </div>

                <button
                  onClick={savePromptSettings}
                  disabled={saving}
                  className="px-8 py-3 rounded-full font-medium text-[#1e1b15] disabled:opacity-50 transition-all hover:brightness-95"
                  style={{ backgroundColor: '#65fcc4' }}
                >
                  {saving ? 'שומר...' : 'שמור שאלות נפוצות'}
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Scraped Pages */}
          {activeTab === 'pages' && (
            <div>
              <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-4xl font-extrabold text-[#1e1b15] font-headline">דפים סרוקים</h1>
                  <p className="text-[#655e51] mt-2">דפים שנסרקו מהאתר ({pages.length})</p>
                </div>
                <button
                  onClick={loadPages}
                  className="px-4 py-2 text-sm rounded-full border border-[#c6c6c6] text-[#655e51] hover:bg-white flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                  רענן
                </button>
              </div>

              <div className="space-y-4">
                {pagesLoading ? (
                  <div className="text-center py-8 text-[#655e51]">טוען דפים...</div>
                ) : pages.length === 0 ? (
                  <div className="text-center py-12 text-[#655e51]">
                    <div className="w-16 h-16 rounded-full bg-[#575a8c]/10 flex items-center justify-center mx-auto mb-3">
                      <span className="material-symbols-outlined text-[#575a8c]" style={{ fontSize: 32 }}>article</span>
                    </div>
                    <p>אין דפים סרוקים עדיין</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pages.map(page => (
                      <div key={page.id} className="bg-white rounded-xl overflow-hidden" style={customShadow}>
                        <div
                          className="p-3 sm:p-5 cursor-pointer hover:bg-[#faf2e9]/50 transition-colors"
                          onClick={() => setExpandedPage(expandedPage === page.id ? null : page.id)}
                        >
                          <div className="flex items-center gap-3">
                            {page.thumbnail ? (
                              <img
                                src={page.thumbnail}
                                alt={page.productName || page.page_title || ''}
                                className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-[#c6c6c6]"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-[#575a8c]/10 flex items-center justify-center flex-shrink-0">
                                <span className="material-symbols-outlined text-[#575a8c]" style={{ fontSize: 22 }}>article</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-[#1e1b15] truncate">
                                {page.productName || page.page_title || 'ללא כותרת'}
                              </div>
                              <div className="text-xs text-[#655e51] truncate mt-0.5">{page.url}</div>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 mr-2 sm:mr-4 text-xs text-[#655e51] flex-shrink-0">
                              <span className="hidden sm:inline">{page.word_count || 0} מילים</span>
                              {page.ragChunks > 0 && (
                                <span className="px-2 sm:px-2.5 py-0.5 rounded-full font-medium text-[10px] sm:text-xs" style={{ backgroundColor: '#65fcc4', color: '#006c4e' }}>
                                  {page.ragChunks} chunks
                                </span>
                              )}
                              <span className="material-symbols-outlined text-[#655e51]" style={{ fontSize: 18 }}>
                                {expandedPage === page.id ? 'expand_less' : 'expand_more'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {expandedPage === page.id && (
                          <div className="border-t border-[#c6c6c6] p-3 sm:p-5" style={{ backgroundColor: '#faf2e9' }}>
                            {editingPage === page.id ? (
                              <div className="space-y-3">
                                <textarea
                                  value={editPageContent}
                                  onChange={e => setEditPageContent(e.target.value)}
                                  className="w-full h-48 rounded-xl text-sm resize-y font-mono p-4 outline-none border border-[#c6c6c6]"
                                  style={{ backgroundColor: '#fff8f1' }}
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => savePageEdit(page.id)}
                                    className="px-5 py-2 text-sm font-medium rounded-full text-[#1e1b15] hover:brightness-95"
                                    style={{ backgroundColor: '#65fcc4' }}
                                  >
                                    שמור
                                  </button>
                                  <button
                                    onClick={() => { setEditingPage(null); setEditPageContent(''); }}
                                    className="px-5 py-2 text-sm rounded-full border border-[#c6c6c6] text-[#655e51] hover:bg-white"
                                  >
                                    ביטול
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm text-[#655e51] whitespace-pre-wrap leading-relaxed">
                                  {page.page_content || 'אין תוכן'}
                                </p>
                                {page.hasFullContent && (
                                  <p className="text-xs text-[#655e51] mt-2">... (התוכן קוצר לתצוגה)</p>
                                )}
                                <div className="flex gap-2 mt-4">
                                  <button
                                    onClick={() => { setEditingPage(page.id); setEditPageContent(page.page_content); }}
                                    className="px-4 py-1.5 text-sm rounded-full border border-[#c6c6c6] text-[#655e51] hover:bg-white flex items-center gap-1"
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                                    ערוך
                                  </button>
                                  <button
                                    onClick={() => deletePage(page.id)}
                                    className="px-4 py-1.5 text-sm rounded-full text-[#a72f68] border border-[#a72f68]/30 hover:bg-[#a72f68]/10 flex items-center gap-1"
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                    מחק
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Knowledge */}
          {activeTab === 'knowledge' && (
            <div>
              <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-4xl font-extrabold text-[#1e1b15] font-headline">בסיס ידע</h1>
                  <p className="text-[#655e51] mt-2">ידע נוסף שהבוט ישתמש בו ({knowledge.length})</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={loadKnowledge}
                    className="px-4 py-2 text-sm rounded-full border border-[#c6c6c6] text-[#655e51] hover:bg-white flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                    רענן
                  </button>
                  <button
                    onClick={() => setShowAddKnowledge(true)}
                    className="px-4 py-2 text-sm font-medium rounded-full text-[#1e1b15] flex items-center gap-1 hover:brightness-95"
                    style={{ backgroundColor: '#65fcc4' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                    הוסף ידע
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Add knowledge form */}
                {showAddKnowledge && (
                  <div className="bg-white p-4 sm:p-8 rounded-xl" style={customShadow}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="material-symbols-outlined text-[#006c4e]" style={{ fontSize: 22 }}>add_circle</span>
                      <h3 className="text-lg sm:text-xl font-bold text-[#1e1b15]">הוסף ידע חדש</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          value={newKnowledge.title}
                          onChange={e => setNewKnowledge(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="כותרת"
                          className="px-4 py-2.5 rounded-xl text-sm outline-none border border-[#c6c6c6]"
                          style={{ backgroundColor: '#faf2e9' }}
                        />
                        <select
                          value={newKnowledge.knowledge_type}
                          onChange={e => setNewKnowledge(prev => ({ ...prev, knowledge_type: e.target.value }))}
                          className="px-4 py-2.5 rounded-xl text-sm outline-none border border-[#c6c6c6] bg-white"
                        >
                          <option value="custom">כללי</option>
                          <option value="product">מוצר</option>
                          <option value="brand_info">מידע על המותג</option>
                          <option value="faq">שאלה נפוצה</option>
                        </select>
                      </div>
                      <textarea
                        value={newKnowledge.content}
                        onChange={e => setNewKnowledge(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="תוכן..."
                        className="w-full h-24 rounded-xl text-sm resize-y p-4 outline-none border border-[#c6c6c6]"
                        style={{ backgroundColor: '#faf2e9' }}
                      />
                      <input
                        value={newKnowledge.keywords}
                        onChange={e => setNewKnowledge(prev => ({ ...prev, keywords: e.target.value }))}
                        placeholder="מילות מפתח (מופרדות בפסיק)"
                        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border border-[#c6c6c6]"
                        style={{ backgroundColor: '#faf2e9' }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={addKnowledge}
                          disabled={!newKnowledge.title || !newKnowledge.content}
                          className="px-5 py-2 text-sm font-medium rounded-full text-[#1e1b15] disabled:opacity-50 hover:brightness-95"
                          style={{ backgroundColor: '#65fcc4' }}
                        >
                          הוסף
                        </button>
                        <button
                          onClick={() => setShowAddKnowledge(false)}
                          className="px-5 py-2 text-sm rounded-full border border-[#c6c6c6] text-[#655e51] hover:bg-white"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Knowledge list */}
                {knowledgeLoading ? (
                  <div className="text-center py-8 text-[#655e51]">טוען...</div>
                ) : knowledge.length === 0 ? (
                  <div className="text-center py-12 text-[#655e51]">
                    <div className="w-16 h-16 rounded-full bg-[#575a8c]/10 flex items-center justify-center mx-auto mb-3">
                      <span className="material-symbols-outlined text-[#575a8c]" style={{ fontSize: 32 }}>menu_book</span>
                    </div>
                    <p>אין ידע נוסף עדיין</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {knowledge.map(entry => (
                      <div key={entry.id} className={`bg-white p-4 sm:p-5 rounded-xl ${!entry.is_active ? 'opacity-60' : ''}`} style={customShadow}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-[#1e1b15]">{entry.title}</span>
                              <span className="text-xs px-2.5 py-0.5 rounded-full border border-[#c6c6c6] text-[#655e51]" style={{ backgroundColor: '#faf2e9' }}>
                                {typeLabel(entry.knowledge_type)}
                              </span>
                              {!entry.is_active && (
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FF76B0]/15 text-[#a72f68]">
                                  מושבת
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#655e51] mt-1 truncate">{entry.content}</p>
                          </div>
                          <div className="flex items-center gap-2 sm:mr-4">
                            <button
                              onClick={() => toggleKnowledge(entry.id, entry.is_active)}
                              className={`text-xs px-3 py-1 rounded-full transition-colors ${entry.is_active ? 'border border-[#c6c6c6] text-[#655e51] hover:bg-[#faf2e9]' : 'text-[#1e1b15] hover:brightness-95'}`}
                              style={!entry.is_active ? { backgroundColor: '#65fcc4' } : undefined}
                            >
                              {entry.is_active ? 'השבת' : 'הפעל'}
                            </button>
                            <button
                              onClick={() => deleteKnowledge(entry.id)}
                              className="text-xs px-3 py-1 rounded-full text-[#a72f68] border border-[#a72f68]/30 hover:bg-[#a72f68]/10"
                            >
                              מחק
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 5: Products */}
          {activeTab === 'products' && (
            <div>
              <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-4xl font-extrabold text-[#1e1b15] font-headline">קטלוג מוצרים</h1>
                  <p className="text-[#655e51] mt-2">מוצרים שהבוט מכיר ({products.length})</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={loadProducts}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-full border border-[#c6c6c6] text-[#655e51] hover:bg-white flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                    רענן
                  </button>
                  <button
                    onClick={extractProducts}
                    disabled={extracting}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-full text-[#1e1b15] disabled:opacity-50 flex items-center gap-1 hover:brightness-95"
                    style={{ backgroundColor: '#65fcc4' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
                    {extracting ? 'מחלץ...' : <><span className="hidden sm:inline">חלץ מוצרים מהאתר</span><span className="sm:hidden">חלץ מוצרים</span></>}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Extraction result */}
                {extractResult && (
                  <div className={`bg-white p-5 rounded-xl text-sm ${extractResult.success ? 'border border-[#65fcc4]' : 'border border-[#FF76B0]'}`} style={customShadow}>
                    {extractResult.success ? (
                      <div className="space-y-1">
                        <div className="font-medium text-[#006c4e] flex items-center gap-1.5">
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                          חילוץ הושלם בהצלחה!
                        </div>
                        <div className="text-[#655e51]">מוצרים שחולצו: {extractResult.extraction?.productsExtracted || 0}</div>
                        <div className="text-[#655e51]">סדרות שזוהו: {extractResult.extraction?.seriesDetected || 0}</div>
                        {extractResult.enrichment && (
                          <>
                            <div className="text-[#655e51]">פרופילים AI: {extractResult.enrichment.productsEnriched}</div>
                            <div className="text-[#655e51]">embeddings: {extractResult.enrichment.embeddingsGenerated}</div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-[#a72f68] flex items-center gap-1.5">
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                        {extractResult.error || extractResult.details || 'שגיאה'}
                      </div>
                    )}
                  </div>
                )}

                {/* Extracting indicator */}
                {extracting && (
                  <div className="text-center py-8">
                    <div className="w-10 h-10 border-3 border-[#006c4e] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-[#655e51] text-sm">מחלץ מוצרים מדפי האתר...</p>
                    <p className="text-[#655e51] text-xs mt-1">זה עלול לקחת כמה דקות</p>
                  </div>
                )}

                {/* Series chips */}
                {productSeries.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {productSeries.map((s: any, idx: number) => {
                      const pastelColors = ['#575a8c', '#006c4e', '#a72f68', '#AEB0E8', '#65fcc4'];
                      const bg = pastelColors[idx % pastelColors.length];
                      return (
                        <span key={s.id} className="px-3.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${bg}20`, color: bg }}>
                          {s.name} ({s.product_count})
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Products grid */}
                {productsLoading ? (
                  <div className="text-center py-8 text-[#655e51]">טוען מוצרים...</div>
                ) : products.length === 0 && !extracting ? (
                  <div className="text-center py-12 text-[#655e51]">
                    <div className="w-16 h-16 rounded-full bg-[#a72f68]/10 flex items-center justify-center mx-auto mb-3">
                      <span className="material-symbols-outlined text-[#a72f68]" style={{ fontSize: 32 }}>shopping_bag</span>
                    </div>
                    <p>אין מוצרים עדיין</p>
                    <p className="text-xs mt-1">לחץ &quot;חלץ מוצרים מהאתר&quot; כדי ליצור קטלוג אוטומטי</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {products.map((product: any) => (
                      <div key={product.id} className={`bg-white rounded-xl overflow-hidden ${product.is_featured ? 'ring-2 ring-[#65fcc4]/50' : ''}`} style={customShadow}>
                        <div className="flex gap-3 p-4">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-[#c6c6c6]"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-[#a72f68]/10 flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-[#a72f68]" style={{ fontSize: 28 }}>shopping_bag</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-[#1e1b15] truncate">{product.name}</div>
                            {product.price && (
                              <div className="text-sm mt-0.5">
                                {product.is_on_sale && product.original_price && (
                                  <span className="text-[#655e51] line-through text-xs ml-1">{'\u20AA'}{product.original_price}</span>
                                )}
                                <span className="font-bold text-[#006c4e]">{'\u20AA'}{product.price}</span>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {product.category && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#c6c6c6] text-[#655e51]" style={{ backgroundColor: '#faf2e9' }}>
                                  {product.category}
                                </span>
                              )}
                              {product.product_line && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full text-[#575a8c]" style={{ backgroundColor: '#e1e0ff' }}>
                                  {product.product_line}
                                </span>
                              )}
                              {product.is_featured && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full text-[#006c4e]" style={{ backgroundColor: '#65fcc4' }}>
                                  מקודם
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Actions */}
                        <div className="flex border-t border-[#c6c6c6] divide-x divide-[#c6c6c6]">
                          <button
                            onClick={() => toggleFeatured(product.id, product.is_featured)}
                            className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                              product.is_featured
                                ? 'text-[#006c4e] hover:bg-[#65fcc4]/10'
                                : 'text-[#655e51] hover:bg-[#faf2e9]'
                            }`}
                            style={product.is_featured ? { backgroundColor: 'rgba(101, 252, 196, 0.1)' } : undefined}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                              {product.is_featured ? 'star' : 'star_outline'}
                            </span>
                            {product.is_featured ? 'הסר קידום' : 'קדם מוצר'}
                          </button>
                          <a
                            href={product.product_url}
                            target="_blank"
                            rel="noopener"
                            className="flex-1 py-2.5 text-xs font-medium text-[#655e51] hover:bg-[#faf2e9] text-center flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                            צפה באתר
                          </a>
                          <button
                            onClick={() => deleteProduct(product.id)}
                            className="flex-1 py-2.5 text-xs font-medium text-[#a72f68] hover:bg-[#a72f68]/10 flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                            מחק
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 6: Design */}
          {activeTab === 'design' && (
            <div>
              <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-4xl font-extrabold text-[#1e1b15] font-headline">הגדרות ווידג&apos;ט</h1>
                <p className="text-[#655e51] mt-2">התאם את המראה וההתנהגות של הווידג&apos;ט</p>
              </div>

              <div className="space-y-6">
                <div className="bg-white p-4 sm:p-8 rounded-xl" style={customShadow}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined text-[#575a8c]" style={{ fontSize: 22 }}>chat_bubble</span>
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-[#1e1b15]">הודעת פתיחה</h3>
                      <p className="text-sm text-[#655e51]">ההודעה שתופיע כשהווידג&apos;ט נפתח</p>
                    </div>
                  </div>
                  <input
                    value={welcomeMessage}
                    onChange={e => setWelcomeMessage(e.target.value)}
                    placeholder="שלום! איך אפשר לעזור?"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border border-[#c6c6c6]"
                    style={{ backgroundColor: '#faf2e9' }}
                  />
                </div>

                <div className="bg-white p-4 sm:p-8 rounded-xl" style={customShadow}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined text-[#006c4e]" style={{ fontSize: 22 }}>dock_to_bottom</span>
                    <h3 className="text-lg sm:text-xl font-bold text-[#1e1b15]">מיקום ווידג&apos;ט</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'bottom-right' as const, label: 'ימין למטה' },
                      { value: 'bottom-left' as const, label: 'שמאל למטה' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setWidgetPosition(opt.value)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          widgetPosition === opt.value
                            ? 'border-[#e1e0ff] bg-[#e1e0ff]/30 text-[#575a8c]'
                            : 'border-[#c6c6c6] text-[#655e51] hover:border-[#e1e0ff] bg-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={saveDesignSettings}
                  disabled={saving}
                  className="px-8 py-3 rounded-full font-medium text-[#1e1b15] disabled:opacity-50 transition-all hover:brightness-95"
                  style={{ backgroundColor: '#65fcc4' }}
                >
                  {saving ? 'שומר...' : 'שמור הגדרות'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Live Preview Modal */}
      {showLivePreview && accountId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(55,50,38,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowLivePreview(false)}
        >
          <div
            className="relative flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar */}
            <div className="flex items-center justify-between w-[min(390px,calc(100vw-40px))] mb-3 px-1">
              <span className="text-sm font-medium text-white/80 font-headline">
                צפייה חיה -- {displayName || 'ווידג׳ט'}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={`/widget-preview?accountId=${accountId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white/60 hover:text-white transition-colors underline"
                >
                  פתח בטאב חדש
                </a>
                <button
                  onClick={() => setShowLivePreview(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-all"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>
            </div>

            {/* Phone frame */}
            <div
              className="rounded-[40px] overflow-hidden shadow-2xl w-[min(390px,calc(100vw-40px))]"
              style={{ height: 'min(760px, calc(100vh - 120px))', border: '8px solid #373226', backgroundColor: '#373226' }}
            >
              {/* Notch */}
              <div className="relative flex justify-center" style={{ backgroundColor: '#373226', height: 30 }}>
                <div className="absolute top-0 rounded-b-2xl" style={{ width: 120, height: 24, backgroundColor: '#373226' }} />
              </div>

              {/* Iframe */}
              <iframe
                src={`/widget-preview?accountId=${accountId}&t=${Date.now()}`}
                className="w-full border-0"
                style={{ height: 'calc(100% - 30px)', borderRadius: '0 0 32px 32px', backgroundColor: '#FFF7ED' }}
                title="תצוגה מקדימה -- ווידג׳ט"
              />
            </div>

            <p className="text-xs text-white/50 mt-3">
              לחצו על הבועה בתוך הטלפון כדי לפתוח את הווידג׳ט
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function Card({ icon, iconColor, title, description, children }: { icon?: string; iconColor?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl" style={{ boxShadow: '0 20px 40px rgba(71, 71, 71, 0.06)' }}>
      <div className="flex items-center gap-3 mb-4">
        {icon && (
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: iconColor || '#006c4e' }}>{icon}</span>
        )}
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-[#1e1b15]">{title}</h3>
          {description && <p className="text-sm text-[#655e51]">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const PASTEL_TAG_COLORS = [
  { bg: '#AEB0E8', text: '#575a8c' },
  { bg: '#65fcc4', text: '#006c4e' },
  { bg: '#FF76B0', text: '#a72f68' },
  { bg: '#FFB89A', text: '#c47a54' },
  { bg: '#7EC8E3', text: '#4a8ea3' },
];

function TagInput({
  tags,
  onAdd,
  onRemove,
  value,
  onChange,
  placeholder,
  color,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (idx: number) => void;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  color: 'focus' | 'banned';
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault();
      onAdd(value.trim());
      onChange('');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {tags.map((tag, idx) => {
          const palette = color === 'banned'
            ? { bg: '#FF76B0', text: '#a72f68' }
            : PASTEL_TAG_COLORS[idx % PASTEL_TAG_COLORS.length];
          return (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-3.5 py-1 rounded-full text-sm font-medium"
              style={{ backgroundColor: `${palette.bg}20`, color: palette.text }}
            >
              {tag}
              <button onClick={() => onRemove(idx)} className="hover:opacity-70 mr-1">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
              </button>
            </span>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none border border-[#c6c6c6]"
          style={{ backgroundColor: '#faf2e9' }}
        />
        <button
          onClick={() => {
            if (value.trim()) {
              onAdd(value.trim());
              onChange('');
            }
          }}
          disabled={!value.trim()}
          className="px-4 py-2 text-sm rounded-full border border-[#c6c6c6] text-[#655e51] hover:bg-white disabled:opacity-50 transition-colors"
        >
          הוסף
        </button>
      </div>
    </div>
  );
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    custom: 'כללי',
    product: 'מוצר',
    brand_info: 'מותג',
    faq: 'שאלה נפוצה',
    coupon: 'קופון',
    active_partnership: 'שיתוף פעולה',
  };
  return labels[type] || type;
}
