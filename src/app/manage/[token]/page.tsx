'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

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
  const token = params.token as string;

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [domain, setDomain] = useState('');

  // Tab state
  const [activeTab, setActiveTab] = useState<'instructions' | 'faq' | 'pages' | 'knowledge' | 'products' | 'design'>('instructions');

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#AEB0E8] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#bab1a1] font-medium">טוען...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="neon-card max-w-md text-center p-8">
          <div className="w-16 h-16 rounded-full bg-[#FF76B0]/15 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[#FF76B0]" style={{ fontSize: 32 }}>lock</span>
          </div>
          <h1 className="text-xl font-bold text-[#373226] mb-2 font-headline">הלינק לא תקף</h1>
          <p className="text-[#655e51]">הלינק פג תוקף או לא חוקי. פנה למנהל המערכת לקבלת לינק חדש.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'instructions' as const, label: 'הנחיות לבוט', icon: 'smart_toy', color: '#AEB0E8' },
    { id: 'faq' as const, label: 'שאלות נפוצות', icon: 'help', color: '#69FFC7' },
    { id: 'pages' as const, label: 'דפים סרוקים', icon: 'article', color: '#7EC8E3' },
    { id: 'knowledge' as const, label: 'ידע נוסף', icon: 'menu_book', color: '#FFB89A' },
    { id: 'products' as const, label: 'מוצרים', icon: 'shopping_bag', color: '#FF76B0' },
    { id: 'design' as const, label: 'הגדרות ווידג\'ט', icon: 'palette', color: '#AEB0E8' },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="neon-glass-nav sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FFB89A]/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#FFB89A]" style={{ fontSize: 22 }}>settings</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#373226] font-headline">{displayName || 'ניהול ווידג\'ט'}</h1>
              {domain && <p className="text-sm text-[#bab1a1]">{domain}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && (
              <span className={`text-sm px-4 py-1.5 rounded-full font-medium ${saveMsg.includes('הצלחה') ? 'bg-[#69FFC7]/20 text-[#2a8a5e]' : 'bg-[#FF76B0]/15 text-[#d4365c]'}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={() => setShowLivePreview(true)}
              className="neon-pill neon-pill-secondary flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>visibility</span>
              צפייה חיה
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white/60 backdrop-blur-sm border-b border-[#e8e0d4]">
        <div className="max-w-5xl mx-auto px-4">
          <nav className="flex gap-2 overflow-x-auto py-3">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap rounded-full transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#AEB0E8] text-white shadow-sm'
                    : 'bg-transparent border border-[#e8e0d4] text-[#655e51] hover:bg-white hover:border-[#AEB0E8]/40'
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: activeTab === tab.id ? 'white' : tab.color }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Tab 1: Instructions */}
        {activeTab === 'instructions' && (
          <div className="space-y-6">
            <Card icon="smart_toy" iconColor="#AEB0E8" title="הנחיות לבוט" description="ספר לבוט איך להתנהג -- ההנחיות האלו מתווספות מעל ההנחיות הבסיסיות">
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="לדוגמה: תמיד הצע מוצרים ממבצע השבוע. אל תציע מוצרים שאזלו מהמלאי. דבר בצורה חמה ואישית..."
                className="neon-input w-full h-32 !rounded-2xl text-sm resize-y"
                maxLength={1000}
              />
              <p className="text-xs text-[#bab1a1] mt-1">{instructions.length}/1000</p>
            </Card>

            <Card icon="record_voice_over" iconColor="#69FFC7" title="טון שיחה">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 'friendly', label: 'ידידותי', desc: 'חם ונגיש' },
                  { value: 'professional', label: 'מקצועי', desc: 'רשמי ומדויק' },
                  { value: 'casual', label: 'קז\'ואלי', desc: 'לא פורמלי' },
                  { value: 'formal', label: 'פורמלי', desc: 'מנומס ורשמי' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTone(opt.value)}
                    className={`p-3 rounded-2xl border-2 text-right transition-all ${
                      tone === opt.value
                        ? 'border-[#AEB0E8] bg-[#AEB0E8]/10'
                        : 'border-[#e8e0d4] hover:border-[#AEB0E8]/40 bg-white'
                    }`}
                  >
                    <div className="font-medium text-sm text-[#373226]">{opt.label}</div>
                    <div className="text-xs text-[#bab1a1]">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </Card>

            <Card icon="bookmark" iconColor="#69FFC7" title="נושאים לדגש" description="הבוט יתמקד בנושאים האלו">
              <TagInput
                tags={focusTopics}
                onAdd={(tag) => setFocusTopics(prev => [...prev, tag])}
                onRemove={(idx) => setFocusTopics(prev => prev.filter((_, i) => i !== idx))}
                value={newFocus}
                onChange={setNewFocus}
                placeholder="הוסף נושא..."
                color="focus"
              />
            </Card>

            <Card icon="block" iconColor="#FF76B0" title="נושאים חסומים" description="הבוט יסרב לדון בנושאים האלו">
              <TagInput
                tags={bannedTopics}
                onAdd={(tag) => setBannedTopics(prev => [...prev, tag])}
                onRemove={(idx) => setBannedTopics(prev => prev.filter((_, i) => i !== idx))}
                value={newBanned}
                onChange={setNewBanned}
                placeholder="הוסף נושא חסום..."
                color="banned"
              />
            </Card>

            <button
              onClick={savePromptSettings}
              disabled={saving}
              className="neon-pill neon-pill-primary w-full sm:w-auto px-8 py-3 font-medium disabled:opacity-50 transition-all"
            >
              {saving ? 'שומר...' : 'שמור הנחיות'}
            </button>
          </div>
        )}

        {/* Tab 2: FAQ */}
        {activeTab === 'faq' && (
          <div className="space-y-6">
            <Card icon="help" iconColor="#69FFC7" title="שאלות נפוצות" description="הבוט יענה על שאלות אלו בעדיפות גבוהה">
              <div className="space-y-3">
                {faqItems.map((item, idx) => (
                  <div key={idx} className="border border-[#e8e0d4] rounded-2xl p-4 bg-[#faf2e9]/50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-sm text-[#373226]">ש: {item.question}</div>
                      <button
                        onClick={() => setFaqItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-[#FF76B0] hover:text-[#d4365c] text-sm mr-2 font-medium"
                      >
                        מחק
                      </button>
                    </div>
                    <div className="text-sm text-[#655e51]">ת: {item.answer}</div>
                  </div>
                ))}

                {faqItems.length === 0 && (
                  <p className="text-[#bab1a1] text-sm text-center py-4">אין שאלות נפוצות עדיין</p>
                )}
              </div>

              <div className="mt-4 border-t border-[#e8e0d4] pt-4 space-y-3">
                <input
                  value={newFaqQ}
                  onChange={e => setNewFaqQ(e.target.value)}
                  placeholder="שאלה..."
                  className="neon-input w-full"
                />
                <textarea
                  value={newFaqA}
                  onChange={e => setNewFaqA(e.target.value)}
                  placeholder="תשובה..."
                  className="neon-input w-full h-20 !rounded-2xl resize-y"
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
                  className="neon-pill neon-pill-outline px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  הוסף שאלה
                </button>
              </div>
            </Card>

            <button
              onClick={savePromptSettings}
              disabled={saving}
              className="neon-pill neon-pill-primary w-full sm:w-auto px-8 py-3 font-medium disabled:opacity-50 transition-all"
            >
              {saving ? 'שומר...' : 'שמור שאלות נפוצות'}
            </button>
          </div>
        )}

        {/* Tab 3: Scraped Pages */}
        {activeTab === 'pages' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#373226] font-headline">דפים סרוקים ({pages.length})</h2>
              <button onClick={loadPages} className="neon-pill neon-pill-ghost text-sm px-4 py-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                רענן
              </button>
            </div>

            {pagesLoading ? (
              <div className="text-center py-8 text-[#bab1a1]">טוען דפים...</div>
            ) : pages.length === 0 ? (
              <div className="text-center py-12 text-[#bab1a1]">
                <div className="w-16 h-16 rounded-full bg-[#7EC8E3]/15 flex items-center justify-center mx-auto mb-3">
                  <span className="material-symbols-outlined text-[#7EC8E3]" style={{ fontSize: 32 }}>article</span>
                </div>
                <p>אין דפים סרוקים עדיין</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pages.map(page => (
                  <div key={page.id} className="neon-card !p-0 overflow-hidden">
                    <div
                      className="p-4 cursor-pointer hover:bg-[#faf2e9]/50 transition-colors"
                      onClick={() => setExpandedPage(expandedPage === page.id ? null : page.id)}
                    >
                      <div className="flex items-center gap-3">
                        {page.thumbnail ? (
                          <img
                            src={page.thumbnail}
                            alt={page.productName || page.page_title || ''}
                            className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-[#e8e0d4]"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-[#7EC8E3]/10 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-[#7EC8E3]" style={{ fontSize: 22 }}>article</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-[#373226] truncate">
                            {page.productName || page.page_title || 'ללא כותרת'}
                          </div>
                          <div className="text-xs text-[#bab1a1] truncate mt-0.5">{page.url}</div>
                        </div>
                        <div className="flex items-center gap-3 mr-4 text-xs text-[#bab1a1]">
                          <span>{page.word_count || 0} מילים</span>
                          {page.ragChunks > 0 && (
                            <span className="bg-[#69FFC7]/20 text-[#2a8a5e] px-2.5 py-0.5 rounded-full font-medium">
                              {page.ragChunks} chunks
                            </span>
                          )}
                          <span className="material-symbols-outlined text-[#bab1a1]" style={{ fontSize: 18 }}>
                            {expandedPage === page.id ? 'expand_less' : 'expand_more'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {expandedPage === page.id && (
                      <div className="border-t border-[#e8e0d4] p-4 bg-[#faf2e9]/30">
                        {editingPage === page.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editPageContent}
                              onChange={e => setEditPageContent(e.target.value)}
                              className="neon-input w-full h-48 !rounded-2xl text-sm resize-y font-mono"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => savePageEdit(page.id)}
                                className="neon-pill neon-pill-primary px-5 py-2 text-sm font-medium"
                              >
                                שמור
                              </button>
                              <button
                                onClick={() => { setEditingPage(null); setEditPageContent(''); }}
                                className="neon-pill neon-pill-ghost px-5 py-2 text-sm"
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
                              <p className="text-xs text-[#bab1a1] mt-2">... (התוכן קוצר לתצוגה)</p>
                            )}
                            <div className="flex gap-2 mt-4">
                              <button
                                onClick={() => { setEditingPage(page.id); setEditPageContent(page.page_content); }}
                                className="neon-pill neon-pill-outline px-4 py-1.5 text-sm flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                                ערוך
                              </button>
                              <button
                                onClick={() => deletePage(page.id)}
                                className="neon-pill neon-pill-danger px-4 py-1.5 text-sm flex items-center gap-1"
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
        )}

        {/* Tab 4: Knowledge */}
        {activeTab === 'knowledge' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#373226] font-headline">בסיס ידע ({knowledge.length})</h2>
              <div className="flex gap-2">
                <button onClick={loadKnowledge} className="neon-pill neon-pill-ghost text-sm px-4 py-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                  רענן
                </button>
                <button
                  onClick={() => setShowAddKnowledge(true)}
                  className="neon-pill neon-pill-primary text-sm px-4 py-1.5 font-medium flex items-center gap-1"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  הוסף ידע
                </button>
              </div>
            </div>

            {/* Add knowledge form */}
            {showAddKnowledge && (
              <Card icon="add_circle" iconColor="#FFB89A" title="הוסף ידע חדש">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={newKnowledge.title}
                      onChange={e => setNewKnowledge(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="כותרת"
                      className="neon-input"
                    />
                    <select
                      value={newKnowledge.knowledge_type}
                      onChange={e => setNewKnowledge(prev => ({ ...prev, knowledge_type: e.target.value }))}
                      className="neon-input bg-white"
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
                    className="neon-input w-full h-24 !rounded-2xl resize-y"
                  />
                  <input
                    value={newKnowledge.keywords}
                    onChange={e => setNewKnowledge(prev => ({ ...prev, keywords: e.target.value }))}
                    placeholder="מילות מפתח (מופרדות בפסיק)"
                    className="neon-input w-full"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addKnowledge}
                      disabled={!newKnowledge.title || !newKnowledge.content}
                      className="neon-pill neon-pill-primary px-5 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      הוסף
                    </button>
                    <button
                      onClick={() => setShowAddKnowledge(false)}
                      className="neon-pill neon-pill-ghost px-5 py-2 text-sm"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              </Card>
            )}

            {/* Knowledge list */}
            {knowledgeLoading ? (
              <div className="text-center py-8 text-[#bab1a1]">טוען...</div>
            ) : knowledge.length === 0 ? (
              <div className="text-center py-12 text-[#bab1a1]">
                <div className="w-16 h-16 rounded-full bg-[#FFB89A]/15 flex items-center justify-center mx-auto mb-3">
                  <span className="material-symbols-outlined text-[#FFB89A]" style={{ fontSize: 32 }}>menu_book</span>
                </div>
                <p>אין ידע נוסף עדיין</p>
              </div>
            ) : (
              <div className="space-y-2">
                {knowledge.map(entry => (
                  <div key={entry.id} className={`neon-card !p-4 ${!entry.is_active ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-[#373226]">{entry.title}</span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#faf2e9] text-[#655e51] border border-[#e8e0d4]">
                            {typeLabel(entry.knowledge_type)}
                          </span>
                          {!entry.is_active && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FFB89A]/15 text-[#c47a54]">
                              מושבת
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#bab1a1] mt-1 truncate">{entry.content}</p>
                      </div>
                      <div className="flex items-center gap-2 mr-4">
                        <button
                          onClick={() => toggleKnowledge(entry.id, entry.is_active)}
                          className={`neon-pill text-xs px-3 py-1 ${entry.is_active ? 'neon-pill-outline' : 'neon-pill-primary'}`}
                        >
                          {entry.is_active ? 'השבת' : 'הפעל'}
                        </button>
                        <button
                          onClick={() => deleteKnowledge(entry.id)}
                          className="neon-pill neon-pill-danger text-xs px-3 py-1"
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
        )}

        {/* Tab 5: Products */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#373226] font-headline">קטלוג מוצרים ({products.length})</h2>
              <div className="flex gap-2">
                <button onClick={loadProducts} className="neon-pill neon-pill-ghost text-sm px-4 py-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                  רענן
                </button>
                <button
                  onClick={extractProducts}
                  disabled={extracting}
                  className="neon-pill neon-pill-primary text-sm px-4 py-1.5 font-medium disabled:opacity-50 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
                  {extracting ? 'מחלץ מוצרים...' : 'חלץ מוצרים מהאתר'}
                </button>
              </div>
            </div>

            {/* Extraction result */}
            {extractResult && (
              <div className={`neon-card !p-4 text-sm ${extractResult.success ? 'border-[#69FFC7] bg-[#69FFC7]/10' : 'border-[#FF76B0] bg-[#FF76B0]/10'}`}>
                {extractResult.success ? (
                  <div className="space-y-1">
                    <div className="font-medium text-[#2a8a5e] flex items-center gap-1.5">
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
                  <div className="text-[#d4365c] flex items-center gap-1.5">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                    {extractResult.error || extractResult.details || 'שגיאה'}
                  </div>
                )}
              </div>
            )}

            {/* Extracting indicator */}
            {extracting && (
              <div className="text-center py-8">
                <div className="w-10 h-10 border-3 border-[#AEB0E8] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[#655e51] text-sm">מחלץ מוצרים מדפי האתר...</p>
                <p className="text-[#bab1a1] text-xs mt-1">זה עלול לקחת כמה דקות</p>
              </div>
            )}

            {/* Series chips */}
            {productSeries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {productSeries.map((s: any, idx: number) => {
                  const pastelColors = ['#AEB0E8', '#69FFC7', '#FF76B0', '#FFB89A', '#7EC8E3'];
                  const bg = pastelColors[idx % pastelColors.length];
                  return (
                    <span key={s.id} className="px-3.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${bg}20`, color: bg === '#69FFC7' ? '#2a8a5e' : bg === '#FFB89A' ? '#c47a54' : bg }}>
                      {s.name} ({s.product_count})
                    </span>
                  );
                })}
              </div>
            )}

            {/* Products grid */}
            {productsLoading ? (
              <div className="text-center py-8 text-[#bab1a1]">טוען מוצרים...</div>
            ) : products.length === 0 && !extracting ? (
              <div className="text-center py-12 text-[#bab1a1]">
                <div className="w-16 h-16 rounded-full bg-[#FF76B0]/15 flex items-center justify-center mx-auto mb-3">
                  <span className="material-symbols-outlined text-[#FF76B0]" style={{ fontSize: 32 }}>shopping_bag</span>
                </div>
                <p>אין מוצרים עדיין</p>
                <p className="text-xs mt-1">לחץ &quot;חלץ מוצרים מהאתר&quot; כדי ליצור קטלוג אוטומטי</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {products.map((product: any) => (
                  <div key={product.id} className={`neon-card !p-0 overflow-hidden ${product.is_featured ? 'ring-2 ring-[#FFB89A]/50 border-[#FFB89A]' : ''}`}>
                    <div className="flex gap-3 p-3">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-[#e8e0d4]"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-[#FF76B0]/10 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[#FF76B0]" style={{ fontSize: 28 }}>shopping_bag</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[#373226] truncate">{product.name}</div>
                        {product.price && (
                          <div className="text-sm mt-0.5">
                            {product.is_on_sale && product.original_price && (
                              <span className="text-[#bab1a1] line-through text-xs ml-1">{'\u20AA'}{product.original_price}</span>
                            )}
                            <span className="font-bold text-[#AEB0E8]">{'\u20AA'}{product.price}</span>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {product.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#faf2e9] text-[#655e51] border border-[#e8e0d4]">
                              {product.category}
                            </span>
                          )}
                          {product.product_line && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#AEB0E8]/15 text-[#AEB0E8]">
                              {product.product_line}
                            </span>
                          )}
                          {product.is_featured && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFB89A]/15 text-[#c47a54]">
                              מקודם
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex border-t border-[#e8e0d4] divide-x divide-[#e8e0d4]">
                      <button
                        onClick={() => toggleFeatured(product.id, product.is_featured)}
                        className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                          product.is_featured
                            ? 'bg-[#FFB89A]/10 text-[#c47a54] hover:bg-[#FFB89A]/20'
                            : 'text-[#655e51] hover:bg-[#faf2e9]'
                        }`}
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
                        className="flex-1 py-2.5 text-xs font-medium text-[#FF76B0] hover:bg-[#FF76B0]/10 flex items-center justify-center gap-1"
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
        )}

        {/* Tab 6: Design */}
        {activeTab === 'design' && (
          <div className="space-y-6">
            <Card icon="chat_bubble" iconColor="#AEB0E8" title="הודעת פתיחה" description="ההודעה שתופיע כשהווידג'ט נפתח">
              <input
                value={welcomeMessage}
                onChange={e => setWelcomeMessage(e.target.value)}
                placeholder="שלום! איך אפשר לעזור?"
                className="neon-input w-full"
              />
            </Card>

            <Card icon="dock_to_bottom" iconColor="#FFB89A" title="מיקום ווידג'ט">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'bottom-right' as const, label: 'ימין למטה' },
                  { value: 'bottom-left' as const, label: 'שמאל למטה' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWidgetPosition(opt.value)}
                    className={`p-3 rounded-2xl border-2 text-sm font-medium transition-all ${
                      widgetPosition === opt.value
                        ? 'border-[#AEB0E8] bg-[#AEB0E8]/10 text-[#AEB0E8]'
                        : 'border-[#e8e0d4] text-[#655e51] hover:border-[#AEB0E8]/40 bg-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Card>

            <button
              onClick={saveDesignSettings}
              disabled={saving}
              className="neon-pill neon-pill-primary w-full sm:w-auto px-8 py-3 font-medium disabled:opacity-50 transition-all"
            >
              {saving ? 'שומר...' : 'שמור הגדרות'}
            </button>
          </div>
        )}
      </main>

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
            <div className="flex items-center justify-between w-[390px] mb-3 px-1">
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
              className="rounded-[40px] overflow-hidden shadow-2xl"
              style={{ width: 390, height: 760, border: '8px solid #373226', backgroundColor: '#373226' }}
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
    <div className="neon-card">
      <div className="flex items-center gap-3 mb-4">
        {icon && (
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${iconColor || '#AEB0E8'}20` }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: iconColor || '#AEB0E8' }}>{icon}</span>
          </div>
        )}
        <div>
          <h3 className="font-bold text-[#373226]">{title}</h3>
          {description && <p className="text-sm text-[#655e51]">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const PASTEL_TAG_COLORS = [
  { bg: '#AEB0E8', text: '#6365a0' },
  { bg: '#69FFC7', text: '#2a8a5e' },
  { bg: '#FF76B0', text: '#c4366a' },
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
            ? { bg: '#FF76B0', text: '#c4366a' }
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
          className="neon-input flex-1"
        />
        <button
          onClick={() => {
            if (value.trim()) {
              onAdd(value.trim());
              onChange('');
            }
          }}
          disabled={!value.trim()}
          className="neon-pill neon-pill-ghost px-4 py-2 text-sm disabled:opacity-50"
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
