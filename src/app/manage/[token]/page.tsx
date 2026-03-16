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
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">טוען...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold mb-2">הלינק לא תקף</h1>
          <p className="text-gray-500">הלינק פג תוקף או לא חוקי. פנה למנהל המערכת לקבלת לינק חדש.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'instructions' as const, label: 'הנחיות לבוט', icon: '🤖' },
    { id: 'faq' as const, label: 'שאלות נפוצות', icon: '❓' },
    { id: 'pages' as const, label: 'דפים סרוקים', icon: '📄' },
    { id: 'knowledge' as const, label: 'ידע נוסף', icon: '📚' },
    { id: 'products' as const, label: 'מוצרים', icon: '🛍️' },
    { id: 'design' as const, label: 'הגדרות ווידג\'ט', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{displayName || 'ניהול ווידג\'ט'}</h1>
            {domain && <p className="text-sm text-gray-500">{domain}</p>}
          </div>
          <div className="flex items-center gap-2">
            {saveMsg && (
              <span className={`text-sm px-3 py-1 rounded-full ${saveMsg.includes('הצלחה') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={() => setShowLivePreview(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              צפייה חיה
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="ml-1.5">{tab.icon}</span>
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
            <Card title="הנחיות לבוט" description="ספר לבוט איך להתנהג — ההנחיות האלו מתווספות מעל ההנחיות הבסיסיות">
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="לדוגמה: תמיד הצע מוצרים ממבצע השבוע. אל תציע מוצרים שאזלו מהמלאי. דבר בצורה חמה ואישית..."
                className="w-full h-32 p-3 border border-gray-200 rounded-xl text-sm resize-y focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                maxLength={1000}
              />
              <p className="text-xs text-gray-400 mt-1">{instructions.length}/1000</p>
            </Card>

            <Card title="טון שיחה">
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
                    className={`p-3 rounded-xl border-2 text-right transition-all ${
                      tone === opt.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-gray-500">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </Card>

            <Card title="נושאים לדגש" description="הבוט יתמקד בנושאים האלו">
              <TagInput
                tags={focusTopics}
                onAdd={(tag) => setFocusTopics(prev => [...prev, tag])}
                onRemove={(idx) => setFocusTopics(prev => prev.filter((_, i) => i !== idx))}
                value={newFocus}
                onChange={setNewFocus}
                placeholder="הוסף נושא..."
                color="indigo"
              />
            </Card>

            <Card title="נושאים חסומים" description="הבוט יסרב לדון בנושאים האלו">
              <TagInput
                tags={bannedTopics}
                onAdd={(tag) => setBannedTopics(prev => [...prev, tag])}
                onRemove={(idx) => setBannedTopics(prev => prev.filter((_, i) => i !== idx))}
                value={newBanned}
                onChange={setNewBanned}
                placeholder="הוסף נושא חסום..."
                color="red"
              />
            </Card>

            <button
              onClick={savePromptSettings}
              disabled={saving}
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'שומר...' : 'שמור הנחיות'}
            </button>
          </div>
        )}

        {/* Tab 2: FAQ */}
        {activeTab === 'faq' && (
          <div className="space-y-6">
            <Card title="שאלות נפוצות" description="הבוט יענה על שאלות אלו בעדיפות גבוהה">
              <div className="space-y-3">
                {faqItems.map((item, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-sm text-gray-900">ש: {item.question}</div>
                      <button
                        onClick={() => setFaqItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 text-sm mr-2"
                      >
                        מחק
                      </button>
                    </div>
                    <div className="text-sm text-gray-600">ת: {item.answer}</div>
                  </div>
                ))}

                {faqItems.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-4">אין שאלות נפוצות עדיין</p>
                )}
              </div>

              <div className="mt-4 border-t border-gray-200 pt-4 space-y-3">
                <input
                  value={newFaqQ}
                  onChange={e => setNewFaqQ(e.target.value)}
                  placeholder="שאלה..."
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <textarea
                  value={newFaqA}
                  onChange={e => setNewFaqA(e.target.value)}
                  placeholder="תשובה..."
                  className="w-full h-20 p-3 border border-gray-200 rounded-xl text-sm resize-y focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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
                  className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-200 disabled:opacity-50 transition-colors"
                >
                  + הוסף שאלה
                </button>
              </div>
            </Card>

            <button
              onClick={savePromptSettings}
              disabled={saving}
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'שומר...' : 'שמור שאלות נפוצות'}
            </button>
          </div>
        )}

        {/* Tab 3: Scraped Pages */}
        {activeTab === 'pages' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">דפים סרוקים ({pages.length})</h2>
              <button onClick={loadPages} className="text-sm text-indigo-600 hover:text-indigo-700">
                רענן
              </button>
            </div>

            {pagesLoading ? (
              <div className="text-center py-8 text-gray-400">טוען דפים...</div>
            ) : pages.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">📄</div>
                <p>אין דפים סרוקים עדיין</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pages.map(page => (
                  <div key={page.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div
                      className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedPage(expandedPage === page.id ? null : page.id)}
                    >
                      <div className="flex items-center gap-3">
                        {/* Product thumbnail */}
                        {page.thumbnail ? (
                          <img
                            src={page.thumbnail}
                            alt={page.productName || page.page_title || ''}
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">
                            📄
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">
                            {page.productName || page.page_title || 'ללא כותרת'}
                          </div>
                          <div className="text-xs text-gray-400 truncate mt-0.5">{page.url}</div>
                        </div>
                        <div className="flex items-center gap-3 mr-4 text-xs text-gray-400">
                          <span>{page.word_count || 0} מילים</span>
                          {page.ragChunks > 0 && (
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              {page.ragChunks} chunks
                            </span>
                          )}
                          <span>{expandedPage === page.id ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </div>

                    {expandedPage === page.id && (
                      <div className="border-t border-gray-100 p-4 bg-gray-50">
                        {editingPage === page.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editPageContent}
                              onChange={e => setEditPageContent(e.target.value)}
                              className="w-full h-48 p-3 border border-gray-200 rounded-xl text-sm resize-y font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => savePageEdit(page.id)}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                              >
                                שמור
                              </button>
                              <button
                                onClick={() => { setEditingPage(null); setEditPageContent(''); }}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                              >
                                ביטול
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                              {page.page_content || 'אין תוכן'}
                            </p>
                            {page.hasFullContent && (
                              <p className="text-xs text-gray-400 mt-2">... (התוכן קוצר לתצוגה)</p>
                            )}
                            <div className="flex gap-2 mt-4">
                              <button
                                onClick={() => { setEditingPage(page.id); setEditPageContent(page.page_content); }}
                                className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm hover:bg-indigo-200"
                              >
                                ערוך
                              </button>
                              <button
                                onClick={() => deletePage(page.id)}
                                className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
                              >
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
              <h2 className="text-lg font-bold">בסיס ידע ({knowledge.length})</h2>
              <div className="flex gap-2">
                <button onClick={loadKnowledge} className="text-sm text-indigo-600 hover:text-indigo-700">
                  רענן
                </button>
                <button
                  onClick={() => setShowAddKnowledge(true)}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  + הוסף ידע
                </button>
              </div>
            </div>

            {/* Add knowledge form */}
            {showAddKnowledge && (
              <Card title="הוסף ידע חדש">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={newKnowledge.title}
                      onChange={e => setNewKnowledge(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="כותרת"
                      className="p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <select
                      value={newKnowledge.knowledge_type}
                      onChange={e => setNewKnowledge(prev => ({ ...prev, knowledge_type: e.target.value }))}
                      className="p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
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
                    className="w-full h-24 p-3 border border-gray-200 rounded-xl text-sm resize-y focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <input
                    value={newKnowledge.keywords}
                    onChange={e => setNewKnowledge(prev => ({ ...prev, keywords: e.target.value }))}
                    placeholder="מילות מפתח (מופרדות בפסיק)"
                    className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addKnowledge}
                      disabled={!newKnowledge.title || !newKnowledge.content}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      הוסף
                    </button>
                    <button
                      onClick={() => setShowAddKnowledge(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              </Card>
            )}

            {/* Knowledge list */}
            {knowledgeLoading ? (
              <div className="text-center py-8 text-gray-400">טוען...</div>
            ) : knowledge.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">📚</div>
                <p>אין ידע נוסף עדיין</p>
              </div>
            ) : (
              <div className="space-y-2">
                {knowledge.map(entry => (
                  <div key={entry.id} className={`bg-white border rounded-xl p-4 ${entry.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900">{entry.title}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            {typeLabel(entry.knowledge_type)}
                          </span>
                          {!entry.is_active && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                              מושבת
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 truncate">{entry.content}</p>
                      </div>
                      <div className="flex items-center gap-2 mr-4">
                        <button
                          onClick={() => toggleKnowledge(entry.id, entry.is_active)}
                          className={`text-xs px-2 py-1 rounded-lg ${entry.is_active ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                        >
                          {entry.is_active ? 'השבת' : 'הפעל'}
                        </button>
                        <button
                          onClick={() => deleteKnowledge(entry.id)}
                          className="text-xs px-2 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200"
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
              <h2 className="text-lg font-bold">קטלוג מוצרים ({products.length})</h2>
              <div className="flex gap-2">
                <button onClick={loadProducts} className="text-sm text-indigo-600 hover:text-indigo-700">
                  רענן
                </button>
                <button
                  onClick={extractProducts}
                  disabled={extracting}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {extracting ? 'מחלץ מוצרים...' : 'חלץ מוצרים מהאתר'}
                </button>
              </div>
            </div>

            {/* Extraction result */}
            {extractResult && (
              <div className={`p-4 rounded-xl border text-sm ${extractResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {extractResult.success ? (
                  <div className="space-y-1">
                    <div className="font-medium">חילוץ הושלם בהצלחה!</div>
                    <div>מוצרים שחולצו: {extractResult.extraction?.productsExtracted || 0}</div>
                    <div>סדרות שזוהו: {extractResult.extraction?.seriesDetected || 0}</div>
                    {extractResult.enrichment && (
                      <>
                        <div>פרופילים AI: {extractResult.enrichment.productsEnriched}</div>
                        <div>embeddings: {extractResult.enrichment.embeddingsGenerated}</div>
                      </>
                    )}
                  </div>
                ) : (
                  <div>{extractResult.error || extractResult.details || 'שגיאה'}</div>
                )}
              </div>
            )}

            {/* Extracting indicator */}
            {extracting && (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-500 text-sm">מחלץ מוצרים מדפי האתר...</p>
                <p className="text-gray-400 text-xs mt-1">זה עלול לקחת כמה דקות</p>
              </div>
            )}

            {/* Series chips */}
            {productSeries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {productSeries.map((s: any) => (
                  <span key={s.id} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                    {s.name} ({s.product_count})
                  </span>
                ))}
              </div>
            )}

            {/* Products grid */}
            {productsLoading ? (
              <div className="text-center py-8 text-gray-400">טוען מוצרים...</div>
            ) : products.length === 0 && !extracting ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">🛍️</div>
                <p>אין מוצרים עדיין</p>
                <p className="text-xs mt-1">לחץ &quot;חלץ מוצרים מהאתר&quot; כדי ליצור קטלוג אוטומטי</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {products.map((product: any) => (
                  <div key={product.id} className={`bg-white border rounded-xl overflow-hidden ${product.is_featured ? 'border-yellow-400 ring-1 ring-yellow-200' : 'border-gray-200'}`}>
                    <div className="flex gap-3 p-3">
                      {/* Product image */}
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-2xl">
                          🛍️
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{product.name}</div>
                        {product.price && (
                          <div className="text-sm mt-0.5">
                            {product.is_on_sale && product.original_price && (
                              <span className="text-gray-400 line-through text-xs ml-1">₪{product.original_price}</span>
                            )}
                            <span className="font-bold text-indigo-600">₪{product.price}</span>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {product.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                              {product.category}
                            </span>
                          )}
                          {product.product_line && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                              {product.product_line}
                            </span>
                          )}
                          {product.is_featured && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">
                              מקודם
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex border-t border-gray-100 divide-x divide-gray-100">
                      <button
                        onClick={() => toggleFeatured(product.id, product.is_featured)}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${
                          product.is_featured
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                            : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {product.is_featured ? 'הסר קידום' : 'קדם מוצר'}
                      </button>
                      <a
                        href={product.product_url}
                        target="_blank"
                        rel="noopener"
                        className="flex-1 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 text-center"
                      >
                        צפה באתר
                      </a>
                      <button
                        onClick={() => deleteProduct(product.id)}
                        className="flex-1 py-2 text-xs font-medium text-red-500 hover:bg-red-50"
                      >
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
            <Card title="הודעת פתיחה" description="ההודעה שתופיע כשהווידג'ט נפתח">
              <input
                value={welcomeMessage}
                onChange={e => setWelcomeMessage(e.target.value)}
                placeholder="שלום! איך אפשר לעזור?"
                className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </Card>

            <Card title="מיקום ווידג'ט">
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
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
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
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
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
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowLivePreview(false)}
        >
          <div
            className="relative flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar */}
            <div className="flex items-center justify-between w-[390px] mb-3 px-1">
              <span className="text-sm font-medium text-white/80">
                צפייה חיה — {displayName || 'ווידג׳ט'}
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
                  ✕
                </button>
              </div>
            </div>

            {/* Phone frame */}
            <div
              className="rounded-[40px] overflow-hidden shadow-2xl"
              style={{ width: 390, height: 760, border: '8px solid #1a1a1a', backgroundColor: '#1a1a1a' }}
            >
              {/* Notch */}
              <div className="relative flex justify-center" style={{ backgroundColor: '#1a1a1a', height: 30 }}>
                <div className="absolute top-0 rounded-b-2xl" style={{ width: 120, height: 24, backgroundColor: '#1a1a1a' }} />
              </div>

              {/* Iframe */}
              <iframe
                src={`/widget-preview?accountId=${accountId}&t=${Date.now()}`}
                className="w-full border-0"
                style={{ height: 'calc(100% - 30px)', borderRadius: '0 0 32px 32px', backgroundColor: '#f8f9fa' }}
                title="תצוגה מקדימה — ווידג׳ט"
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

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  );
}

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
  color: 'indigo' | 'red';
}) {
  const colorClasses = color === 'indigo'
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-red-100 text-red-700';

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
        {tags.map((tag, idx) => (
          <span key={idx} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm ${colorClasses}`}>
            {tag}
            <button onClick={() => onRemove(idx)} className="hover:opacity-70 mr-1">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <button
          onClick={() => {
            if (value.trim()) {
              onAdd(value.trim());
              onChange('');
            }
          }}
          disabled={!value.trim()}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200 disabled:opacity-50"
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
