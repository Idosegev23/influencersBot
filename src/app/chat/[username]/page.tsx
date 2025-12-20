'use client';

import { useState, useRef, useEffect, use } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { 
  Send, 
  Search, 
  MessageCircle, 
  Package, 
  Copy, 
  Check,
  ExternalLink,
  ChefHat,
  Shirt,
  Cpu,
  Heart,
  Dumbbell,
  Sparkles,
} from 'lucide-react';
import { getInfluencerByUsername, getProductsByInfluencer, getContentByInfluencer } from '@/lib/supabase';
import { applyTheme, getGoogleFontsUrl } from '@/lib/theme';
import type { Influencer, Product, ContentItem, InfluencerType } from '@/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const typeIcons: Record<InfluencerType, typeof ChefHat> = {
  food: ChefHat,
  fashion: Shirt,
  tech: Cpu,
  lifestyle: Heart,
  fitness: Dumbbell,
  beauty: Sparkles,
  other: MessageCircle,
};

const typeLabels: Record<InfluencerType, string> = {
  food: 'מתכונים וטיפים',
  fashion: 'לוקים וסטיילינג',
  tech: 'סקירות והמלצות',
  lifestyle: 'טיפים והמלצות',
  fitness: 'אימונים ותזונה',
  beauty: 'טיפוח ויופי',
  other: 'טיפים והמלצות',
};

export default function ChatbotPage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  
  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'chat' | 'search'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load influencer data
  useEffect(() => {
    async function loadData() {
      try {
        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          setNotFound(true);
          return;
        }
        
        setInfluencer(inf);
        applyTheme(inf.theme);
        
        // Load products and content
        const [prods, cont] = await Promise.all([
          getProductsByInfluencer(inf.id),
          getContentByInfluencer(inf.id),
        ]);
        setProducts(prods);
        setContent(cont);
      } catch (error) {
        console.error('Error loading influencer:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [username]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping || !influencer) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageContent = inputValue.trim();
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          message: messageContent,
          responseId,
          sessionId,
        }),
      });

      const data = await response.json();

      if (data.responseId) setResponseId(data.responseId);
      if (data.sessionId) setSessionId(data.sessionId);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'מצטער, משהו השתבש. נסה שוב!',
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'אופס! משהו השתבש. נסה שוב בבקשה.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !influencer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" dir="rtl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">לא נמצא</h1>
        <p className="text-gray-600">הצ'אטבוט הזה לא קיים או לא פעיל</p>
      </div>
    );
  }

  const TypeIcon = typeIcons[influencer.influencer_type];

  // Use dynamic greeting and questions from influencer data, with fallbacks
  const greetingMessage = influencer.greeting_message || 
    `היי! אני העוזר של ${influencer.display_name.split(' ')[0]}`;
  
  const suggestedQuestions = (influencer.suggested_questions && influencer.suggested_questions.length > 0)
    ? influencer.suggested_questions
    : influencer.influencer_type === 'food'
      ? ['מה הקופון הכי שווה?', 'יש מתכון מהיר?', 'מה התחליף לביצים?', 'יש לי בעיה עם הזמנה']
      : ['מה הקופון הכי שווה?', 'יש המלצה?', 'איפה קונים את זה?', 'יש לי בעיה עם הזמנה'];
  
  // Check if branding should be hidden (white label)
  const hideBranding = influencer.hide_branding || false;

  return (
    <>
      {/* Google Fonts */}
      <link href={getGoogleFontsUrl(influencer.theme)} rel="stylesheet" />
      
      <main className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
        {/* Header */}
        <header className="sticky top-0 z-50 glass px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {influencer.avatar_url ? (
                <div className="relative w-10 h-10 rounded-xl overflow-hidden">
                  <Image
                    src={influencer.avatar_url}
                    alt={influencer.display_name}
                    fill
                    className="object-cover"
                    sizes="40px"
                    unoptimized
                  />
                </div>
              ) : (
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {influencer.display_name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>
                  העוזר של {influencer.display_name.split(' ')[0]}
                </h1>
                <p className="text-xs" style={{ color: 'var(--color-text)', opacity: 0.6 }}>
                  {typeLabels[influencer.influencer_type]}
                </p>
              </div>
            </div>
            <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'chat' ? 'bg-white shadow-sm' : ''
                }`}
                style={{ color: 'var(--color-text)' }}
              >
                צ'אט
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'search' ? 'bg-white shadow-sm' : ''
                }`}
                style={{ color: 'var(--color-text)' }}
              >
                חיפוש
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'chat' ? (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col relative"
              >
                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-6 pb-24 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center px-4 pt-12">
                      {influencer.avatar_url && (
                        <div className="relative w-16 h-16 rounded-2xl overflow-hidden mb-5">
                          <Image
                            src={influencer.avatar_url}
                            alt={influencer.display_name}
                            fill
                            className="object-cover"
                            sizes="64px"
                            unoptimized
                          />
                        </div>
                      )}

                      <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                        {greetingMessage}
                      </h2>
                      <p className="mb-6 max-w-sm text-sm leading-relaxed" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                        אני כאן לעזור עם {typeLabels[influencer.influencer_type].toLowerCase()}, מוצרים וקופונים
                      </p>

                      {/* Suggestions */}
                      <div className="flex flex-wrap gap-2 justify-center max-w-md mb-8">
                        {suggestedQuestions.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setInputValue(q);
                              inputRef.current?.focus();
                            }}
                            className="px-3 py-2 text-sm border rounded-lg transition-all hover:border-gray-300"
                            style={{ 
                              backgroundColor: 'var(--color-surface)', 
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text)',
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>

                      {/* Products Preview */}
                      {products.length > 0 && (
                        <div className="w-full mt-6">
                          <p className="text-xs mb-3 text-center" style={{ color: 'var(--color-text)', opacity: 0.5 }}>
                            מוצרים מומלצים
                          </p>
                          <div className="flex gap-3 overflow-x-auto pb-3 px-4 scrollbar-hide">
                            {products.slice(0, 6).map((product) => (
                              <a
                                key={product.id}
                                href={product.link || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 w-32 rounded-xl overflow-hidden transition-all hover:shadow-lg"
                                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                              >
                                {product.image_url && (
                                  <div className="relative w-full h-20">
                                    <Image
                                      src={product.image_url}
                                      alt={product.name}
                                      fill
                                      className="object-cover"
                                      sizes="128px"
                                      unoptimized
                                    />
                                  </div>
                                )}
                                <div className="p-2">
                                  <p className="text-[9px]" style={{ color: 'var(--color-primary)' }}>{product.brand}</p>
                                  <p className="font-medium text-[11px] leading-tight line-clamp-2" style={{ color: 'var(--color-text)' }}>
                                    {product.name}
                                  </p>
                                  {product.coupon_code && (
                                    <span 
                                      className="inline-block mt-1 px-1.5 py-0.5 text-[8px] font-semibold rounded"
                                      style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}
                                    >
                                      {product.coupon_code}
                                    </span>
                                  )}
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                        >
                          <div className={`max-w-[85%] px-4 py-3 ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
                            {msg.role === 'user' ? (
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            ) : (
                              <div className="text-sm markdown-content">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {isTyping && (
                        <div className="flex justify-end">
                          <div className="chat-bubble-assistant px-4 py-3 flex gap-1">
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Chat Input */}
                <div 
                  className="absolute bottom-0 left-0 right-0 p-4 border-t"
                  style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)' }}
                >
                  <div className="max-w-2xl mx-auto flex gap-3">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="שאלו אותי משהו..."
                      className="input flex-1"
                      disabled={isTyping}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim() || isTyping}
                      className="btn-primary px-5 disabled:opacity-40"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full overflow-y-auto"
              >
                {/* Search Header */}
                <div className="sticky top-0 z-40 px-4 py-4 border-b" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)' }}>
                  <div className="max-w-2xl mx-auto">
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--color-text)', opacity: 0.4 }} />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="חפשו מוצרים, קופונים..."
                        className="input pr-10"
                      />
                    </div>
                  </div>
                </div>

                {/* Products */}
                <div className="px-4 py-6">
                  <div className="max-w-2xl mx-auto space-y-6">
                    {/* Coupons */}
                    {products.filter((p) => p.coupon_code).length > 0 && (
                      <section>
                        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text)' }}>קודי קופון</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {products.filter((p) => p.coupon_code).map((product) => (
                            <button
                              key={product.id}
                              onClick={() => handleCopyCode(product.coupon_code!)}
                              className="p-4 rounded-xl text-right transition-all"
                              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs" style={{ color: 'var(--color-text)', opacity: 0.6 }}>{product.brand}</span>
                                <span className="text-xs font-medium" style={{ color: copiedCode === product.coupon_code ? '#10b981' : 'var(--color-primary)' }}>
                                  {copiedCode === product.coupon_code ? 'הועתק!' : 'העתק'}
                                </span>
                              </div>
                              <p className="font-mono font-bold text-base" style={{ color: 'var(--color-text)' }}>{product.coupon_code}</p>
                              <p className="text-xs mt-1" style={{ color: 'var(--color-text)', opacity: 0.6 }}>{product.name}</p>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* All Products */}
                    <section>
                      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text)' }}>מוצרים</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {filteredProducts.map((product) => (
                          <a
                            key={product.id}
                            href={product.link || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl overflow-hidden transition-all hover:shadow-lg"
                            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                          >
                            {product.image_url && (
                              <div className="aspect-square relative">
                                <Image
                                  src={product.image_url}
                                  alt={product.name}
                                  fill
                                  className="object-cover"
                                  sizes="(max-width: 768px) 50vw, 200px"
                                  unoptimized
                                />
                                {product.coupon_code && (
                                  <span 
                                    className="absolute top-2 right-2 px-2 py-1 text-xs font-medium rounded-lg"
                                    style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
                                  >
                                    קופון
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="p-3">
                              <p className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>{product.brand}</p>
                              <h4 className="font-medium text-sm line-clamp-2 mt-0.5" style={{ color: 'var(--color-text)' }}>{product.name}</h4>
                              {product.coupon_code && (
                                <p className="text-xs font-mono mt-1" style={{ color: 'var(--color-text)', opacity: 0.6 }}>{product.coupon_code}</p>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  );
}

