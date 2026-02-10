'use client';

import { useState, useRef, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { 
  Send, 
  Search, 
  MessageCircle, 
  Copy, 
  Check,
  ChefHat,
  Shirt,
  Cpu,
  Heart,
  Dumbbell,
  Sparkles,
  ArrowRight,
  Plus,
  Baby,
  Plane,
  Headphones,
  X,
  Loader2,
} from 'lucide-react';
import { getInfluencerByUsername, getBrandsByInfluencer, getContentByInfluencer, type Brand } from '@/lib/supabase';
import { applyTheme, getGoogleFontsUrl } from '@/lib/theme';
import { getProxiedImageUrl } from '@/lib/image-utils';
import { BrandCards } from '@/components/chat/BrandCards';
import { SupportFlowForm } from '@/components/chat/SupportFlowForm';
import { DirectiveRenderer, type UIDirectives, type BrandCardData } from '@/components/chat';
import { useStreamChat, type StreamMeta, type StreamCards, type StreamDone } from '@/hooks/useStreamChat';
import SupportForm from '@/components/SupportForm';
import type { Influencer, ContentItem, InfluencerType } from '@/types';

// Feature flag for streaming
const USE_STREAMING = process.env.NEXT_PUBLIC_USE_STREAMING !== 'false';

interface SupportState {
  step: 'detect' | 'brand' | 'name' | 'order' | 'problem' | 'phone' | 'complete';
  data: {
    brand?: string;
    customerName?: string;
    orderNumber?: string;
    problemDetails?: string;
    customerPhone?: string;
  };
}

interface BrandInfo {
  brand_name: string;
  description: string | null;
  coupon_code: string | null;
  category: string | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: 'show_brands' | 'collect_input' | 'complete';
  brands?: BrandInfo[];
  inputType?: 'name' | 'order' | 'problem' | 'phone';
  // Engine v2 fields
  uiDirectives?: UIDirectives;
  cardsPayload?: {
    type: 'brands' | 'products' | 'content';
    data: BrandCardData[];
  };
  state?: string;
  traceId?: string;
  decisionId?: string; // For linking UI actions to decisions
}

const typeIcons: Record<InfluencerType, typeof ChefHat> = {
  food: ChefHat,
  fashion: Shirt,
  tech: Cpu,
  lifestyle: Heart,
  fitness: Dumbbell,
  beauty: Sparkles,
  parenting: Baby,
  travel: Plane,
  other: MessageCircle,
};

const typeLabels: Record<InfluencerType, string> = {
  food: 'מתכונים וטיפים',
  fashion: 'לוקים וסטיילינג',
  tech: 'סקירות והמלצות',
  lifestyle: 'טיפים והמלצות',
  fitness: 'אימונים ותזונה',
  beauty: 'טיפוח ויופי',
  parenting: 'הורות ומשפחה',
  travel: 'טיולים והמלצות',
  other: 'טיפים והמלצות',
};

export default function ChatbotPage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();
  
  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
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
  const [tapCount, setTapCount] = useState(0);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportForm, setSupportForm] = useState({ name: '', phone: '', message: '' });
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState(false);
  const [supportState, setSupportState] = useState<SupportState | null>(null);
  const [currentTraceId, setCurrentTraceId] = useState<string | null>(null);
  const [currentDecisionId, setCurrentDecisionId] = useState<string | null>(null);
  const [currentAnonId, setCurrentAnonId] = useState<string | null>(null);
  const [currentExperiments, setCurrentExperiments] = useState<Array<{
    experimentKey: string;
    variantId: string;
    variantName: string;
  }> | null>(null);
  const [useStreaming, setUseStreaming] = useState(USE_STREAMING);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTapRef = useRef<number>(0);
  const streamingMessageIdRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    streamingMessageIdRef.current = streamingMessageId;
  }, [streamingMessageId]);

  // Refs to store streaming data for final message
  const streamMetaRef = useRef<StreamMeta | null>(null);
  const streamCardsRef = useRef<StreamCards | null>(null);

  // Streaming hook
  const { 
    isStreaming: isStreamActive,
    meta: streamMeta,
    cards: streamCards,
    text: streamText,
    sendMessage: sendStreamMessage,
    cancel: cancelStream,
  } = useStreamChat({
    onMeta: (meta) => {
      streamMetaRef.current = meta;
      setCurrentTraceId(meta.traceId);
      setCurrentDecisionId(meta.decisionId);
      if (meta.anonId) setCurrentAnonId(meta.anonId);
      if (meta.experiments) setCurrentExperiments(meta.experiments);
      if (meta.sessionId) setSessionId(meta.sessionId);
    },
    onCards: (cards) => {
      streamCardsRef.current = cards;
    },
    onDone: (done) => {
      if (done.responseId) setResponseId(done.responseId);
      const msgId = streamingMessageIdRef.current;
      const meta = streamMetaRef.current;
      const cards = streamCardsRef.current;
      
      if (msgId && done.fullText) {
        setMessages(prev => prev.map(m => {
          if (m.id !== msgId) return m;
          return { 
            ...m, 
            content: done.fullText,
            traceId: meta?.traceId,
            decisionId: meta?.decisionId,
            state: meta?.stateTransition?.to,
            uiDirectives: meta?.uiDirectives as UIDirectives,
            cardsPayload: cards ? { 
              type: cards.cardsType, 
              data: cards.items as BrandCardData[] 
            } : undefined,
          };
        }));
      }
      // Reset refs
      streamMetaRef.current = null;
      streamCardsRef.current = null;
      setStreamingMessageId(null);
    },
    onError: (error) => {
      const msgId = streamingMessageIdRef.current;
      if (msgId) {
        setMessages(prev => prev.map(m =>
          m.id === msgId
            ? { ...m, content: error.message || 'שגיאה בעיבוד הבקשה' }
            : m
        ));
      }
      streamMetaRef.current = null;
      streamCardsRef.current = null;
      setStreamingMessageId(null);
    },
  });

  // Track user interactions for analytics with full attribution
  const trackEvent = async (eventType: string, payload: Record<string, unknown> = {}) => {
    if (!sessionId && !influencer?.id) return;
    
    try {
      // Generate unique client event ID for dedup
      const clientEventId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      
      await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          accountId: influencer?.id,
          sessionId,
          anonId: currentAnonId,
          traceId: currentTraceId,
          decisionId: currentDecisionId,
          // Pass first experiment for simple attribution
          experimentKey: currentExperiments?.[0]?.experimentKey,
          variantId: currentExperiments?.[0]?.variantId,
          clientEventId, // For dedup
          elementId: payload.elementId || payload.brandId || payload.actionId,
          payload,
          mode: 'creator',
        }),
      });
    } catch (err) {
      console.error('Track error:', err);
    }
  };

  // Triple tap handler for influencer login
  const handleAvatarTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 500) {
      setTapCount(prev => prev + 1);
    } else {
      setTapCount(1);
    }
    lastTapRef.current = now;
  };

  // Navigate to influencer dashboard after 3 taps
  useEffect(() => {
    if (tapCount >= 3) {
      setTapCount(0);
      router.push(`/influencer/${username}`);
    }
  }, [tapCount, router, username]);

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
        
        // Load brands and content
        const [brandsData, cont] = await Promise.all([
          getBrandsByInfluencer(inf.id),
          getContentByInfluencer(inf.id),
        ]);
        setBrands(brandsData);
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

  // Auto-open support modal when directed by engine
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage?.uiDirectives?.showSupportModal) {
      setShowSupportModal(true);
    }
  }, [messages]);

  // Handle support flow input (from form or brand selection)
  const handleSupportInput = async (value: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: value,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const response = await fetch('/api/support-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: value,
          supportState,
          username,
        }),
      });

      const data = await response.json();

      if (data.supportState) {
        setSupportState(data.supportState);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        action: data.action,
        brands: data.brands,
        inputType: data.inputType,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // If complete, reset support state
      if (data.action === 'complete') {
        setSupportState(null);
      }
    } catch (error) {
      console.error('Support error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'אופס! משהו השתבש. נסי שוב בבקשה.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping || isStreamActive || !influencer) return;

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
      // If already in support mode, continue support flow
      if (supportState && supportState.step !== 'detect') {
        await handleSupportInput(messageContent);
        return;
      }

      // Check for support intent first (skip for streaming for now)
      if (!useStreaming) {
        const supportResponse = await fetch('/api/support-flow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: messageContent,
            supportState: { step: 'detect', data: {} },
            username,
          }),
        });

        const supportData = await supportResponse.json();

        // If it's a support request, handle it
        if (supportData.action !== 'use_assistant') {
          if (supportData.supportState) {
            setSupportState(supportData.supportState);
          }

          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: supportData.response,
            action: supportData.action,
            brands: supportData.brands,
            inputType: supportData.inputType,
          };

          setMessages((prev) => [...prev, assistantMessage]);
          setIsTyping(false);
          return;
        }
      }

      // === STREAMING MODE ===
      if (useStreaming) {
        const assistantMessageId = (Date.now() + 1).toString();
        setStreamingMessageId(assistantMessageId);
        
        // Add placeholder message that will be updated
        const streamingMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
        };
        setMessages((prev) => [...prev, streamingMessage]);
        setIsTyping(false); // Let streaming indicator take over

        // Start streaming
        await sendStreamMessage({
          message: messageContent,
          username,
          sessionId: sessionId || undefined,
          previousResponseId: responseId || undefined,
          clientMessageId: assistantMessageId,
        });

        return;
      }

      // === NON-STREAMING MODE ===
      // ⚡ Using Sandwich Bot (3-layer architecture)
      const response = await fetch('/api/chat/sandwich', {
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
        // Engine v2 fields
        uiDirectives: data.uiDirectives,
        cardsPayload: data.cardsPayload,
        state: data.state,
        traceId: data.traceId,
        decisionId: data.decisionId,
      };

      // Store traceId for tracking
      if (data.traceId) setCurrentTraceId(data.traceId);
      // Store decisionId for linking UI actions
      if (data.decisionId) setCurrentDecisionId(data.decisionId);
      
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

  // Reset chat and start new conversation
  const handleNewChat = () => {
    setMessages([]);
    setResponseId(null);
    setSessionId(null);
    setInputValue('');
    setSupportState(null);
    inputRef.current?.focus();
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleSupportSubmit = async () => {
    if (!supportForm.name || !supportForm.message || !influencer) return;
    
    setSupportLoading(true);
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          customerName: supportForm.name,
          customerPhone: supportForm.phone || null,
          message: supportForm.message,
          sessionId,
        }),
      });

      if (response.ok) {
        setSupportSuccess(true);
        setTimeout(() => {
          setShowSupportModal(false);
          setSupportSuccess(false);
          setSupportForm({ name: '', phone: '', message: '' });
        }, 2000);
      }
    } catch (error) {
      console.error('Support error:', error);
    } finally {
      setSupportLoading(false);
    }
  };

  const filteredBrands = brands.filter((b) =>
    b.brand_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.category && b.category.toLowerCase().includes(searchQuery.toLowerCase()))
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

  const TypeIcon = typeIcons[influencer.influencer_type as InfluencerType] || typeIcons.other;

  // Use dynamic greeting and questions from influencer data, with fallbacks
  const greetingMessage = influencer.greeting_message || 
    `היי! אני העוזר של ${influencer.display_name.split(' ')[0]}`;
  
  const suggestedQuestions = (influencer.suggested_questions && influencer.suggested_questions.length > 0)
    ? influencer.suggested_questions
    : influencer.influencer_type === 'food'
      ? ['מה הקופון הכי שווה?', 'יש מתכון מהיר?', 'מה התחליף לביצים?']
      : ['מה הקופון הכי שווה?', 'יש המלצה?', 'איפה קונים את זה?'];
  
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
            {/* Right side - Back button + Avatar */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.history.back()}
                className="p-2 rounded-lg transition-all hover:bg-black/10"
                style={{ color: 'var(--color-text)' }}
                aria-label="חזרה"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div onClick={handleAvatarTap} className="cursor-pointer select-none">
                {influencer.avatar_url ? (
                  <div className="relative w-10 h-10 rounded-xl overflow-hidden">
                    <Image
                      src={getProxiedImageUrl(influencer.avatar_url)}
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
              </div>
              <div>
                <h1 className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>
                  {influencer.display_name}
                </h1>
                <p className="text-xs" style={{ color: 'var(--color-text)', opacity: 0.6 }}>
                  💬 הבוט האישי | {typeLabels[influencer.influencer_type as InfluencerType] || typeLabels.other}
                </p>
              </div>
            </div>

            {/* Left side - Tabs + New Chat */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'chat' ? 'bg-white shadow-sm' : ''
                  }`}
                  style={{ color: 'var(--color-text)' }}
                >
                  צ'אט
                </button>
                <button
                  onClick={() => setActiveTab('search')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'search' ? 'bg-white shadow-sm' : ''
                  }`}
                  style={{ color: 'var(--color-text)' }}
                >
                  חיפוש
                </button>
              </div>
              
              {/* Support Button */}
              {influencer.whatsapp_enabled && (
                <button
                  onClick={() => setShowSupportModal(true)}
                  className="p-2 rounded-lg transition-all hover:bg-black/10"
                  style={{ color: 'var(--color-accent)' }}
                  aria-label="פנייה לתמיכה"
                  title="פנייה לתמיכה"
                >
                  <Headphones className="w-5 h-5" />
                </button>
              )}
              
              {/* New Chat Button - only visible when there are messages */}
              {messages.length > 0 && (
                <button
                  onClick={handleNewChat}
                  className="p-2 rounded-lg transition-all hover:bg-black/10"
                  style={{ color: 'var(--color-primary)' }}
                  aria-label="שיחה חדשה"
                  title="שיחה חדשה"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
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
                            src={getProxiedImageUrl(influencer.avatar_url)}
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
                        אני כאן לעזור עם {(typeLabels[influencer.influencer_type as InfluencerType] || typeLabels.other).toLowerCase()}, מותגים וקופונים
                      </p>

                      {/* Suggestions */}
                      <div className="flex flex-wrap gap-2 justify-center max-w-md mb-4">
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

                      {/* Support Button */}
                      <div className="flex justify-center mb-8">
                        <button
                          onClick={() => setShowSupportModal(true)}
                          className="px-4 py-3 text-sm font-medium rounded-xl transition-all hover:shadow-lg hover:scale-105 flex items-center gap-2"
                          style={{ 
                            backgroundColor: '#ef4444',
                            color: 'white',
                          }}
                        >
                          <MessageCircle className="w-4 h-4" />
                          יש לי בעיה בהזמנה
                        </button>
                      </div>

                      {/* Brands Preview */}
                      {brands.length > 0 && (
                        <div className="w-full mt-6">
                          <p className="text-xs mb-3 text-center" style={{ color: 'var(--color-text)', opacity: 0.5 }}>
                            מותגים וקופונים
                          </p>
                          <div className="flex gap-3 overflow-x-auto pb-3 px-4 scrollbar-hide">
                            {brands.slice(0, 6).map((brand) => (
                              <button
                                key={brand.id}
                                onClick={() => brand.coupon_code && handleCopyCode(brand.coupon_code)}
                                className="flex-shrink-0 w-32 p-3 rounded-xl text-right transition-all hover:shadow-lg"
                                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                              >
                                <p className="font-medium text-sm truncate" style={{ color: 'var(--color-text)' }}>
                                  {brand.brand_name}
                                </p>
                                {brand.category && (
                                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text)', opacity: 0.5 }}>
                                    {brand.category}
                                  </p>
                                )}
                                {brand.coupon_code ? (
                                  <span 
                                    className="inline-block mt-2 px-2 py-1 text-[10px] font-mono font-semibold rounded"
                                    style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}
                                  >
                                    {copiedCode === brand.coupon_code ? 'הועתק!' : brand.coupon_code}
                                  </span>
                                ) : (
                                  <span className="inline-block mt-2 text-[10px]" style={{ color: 'var(--color-text)', opacity: 0.4 }}>
                                    ללא קופון
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, index) => {
                        // For streaming messages, use the live text
                        const isStreamingThis = streamingMessageId === msg.id && isStreamActive;
                        const displayContent = isStreamingThis ? streamText : msg.content;
                        // For streaming, use meta directives until done
                        const displayDirectives = isStreamingThis && streamMeta?.uiDirectives 
                          ? streamMeta.uiDirectives as UIDirectives 
                          : msg.uiDirectives;
                        // For streaming, use cards from stream
                        const displayCards = isStreamingThis && streamCards?.items 
                          ? { type: streamCards.cardsType, data: streamCards.items as BrandCardData[] }
                          : msg.cardsPayload;
                        
                        return (
                        <div key={msg.id}>
                          <div
                            className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                          >
                            <div className={`max-w-[85%] px-4 py-3 ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
                              {msg.role === 'user' ? (
                                <p className="text-sm whitespace-pre-wrap">{displayContent}</p>
                              ) : (
                                <div className="text-sm markdown-content">
                                  {/* Show typing indicator when streaming starts but no text yet */}
                                  {isStreamingThis && !displayContent && (
                                    <div className="flex items-center gap-1 text-gray-400">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span>מקליד...</span>
                                    </div>
                                  )}
                                  {displayContent && (
                                    <ReactMarkdown
                                      components={{
                                        // Style links as clickable blue text
                                        a: ({ node, ...props }) => (
                                          <a
                                            {...props}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 underline decoration-2 underline-offset-2 font-semibold cursor-pointer transition-colors"
                                          />
                                        ),
                                        // Style paragraphs
                                        p: ({ node, ...props }) => (
                                          <p {...props} className="mb-2 last:mb-0 leading-relaxed" />
                                        ),
                                        // Style lists
                                        ul: ({ node, ...props }) => (
                                          <ul {...props} className="list-disc list-inside space-y-1 my-2" />
                                        ),
                                        ol: ({ node, ...props }) => (
                                          <ol {...props} className="list-decimal list-inside space-y-1 my-2" />
                                        ),
                                        li: ({ node, ...props }) => (
                                          <li {...props} className="leading-relaxed" />
                                        ),
                                        // Style strong/bold
                                        strong: ({ node, ...props }) => (
                                          <strong {...props} className="font-bold" />
                                        ),
                                        // Style code
                                        code: ({ node, ...props }) => (
                                          <code {...props} className="px-1.5 py-0.5 rounded text-xs font-mono bg-gray-100" />
                                        ),
                                      }}
                                    >
                                      {displayContent}
                                    </ReactMarkdown>
                                  )}
                                  {/* Show cursor while streaming */}
                                  {isStreamingThis && displayContent && (
                                    <span className="inline-block w-2 h-4 bg-current opacity-60 animate-pulse" />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Engine v2: UI Directives Renderer (including streaming) */}
                          {msg.role === 'assistant' && displayDirectives && index === messages.length - 1 && (!isTyping || isStreamingThis) && (
                            <div className="mt-3 max-w-[95%] mr-auto">
                              <DirectiveRenderer
                                directives={displayDirectives}
                                brands={displayCards?.type === 'brands' ? displayCards.data : undefined}
                                onQuickAction={async (action, payload) => {
                                  trackEvent('quick_action_clicked', { action, payload });
                                  if (action === 'quick_action' && payload?.text) {
                                    // Fill input and send automatically
                                    const text = payload.text as string;
                                    setInputValue(text);
                                    
                                    // Send the message immediately
                                    const userMessage: Message = {
                                      id: Date.now().toString(),
                                      role: 'user',
                                      content: text,
                                    };
                                    setMessages((prev) => [...prev, userMessage]);
                                    setInputValue('');
                                    setIsTyping(true);
                                    
                                    try {
                                      // Check for support intent first (if not streaming)
                                      if (!useStreaming) {
                                        const supportResponse = await fetch('/api/support-flow', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            message: text,
                                            supportState: { step: 'detect', data: {} },
                                            username,
                                          }),
                                        });
                                        const supportData = await supportResponse.json();
                                        
                                        if (supportData.action !== 'use_assistant') {
                                          if (supportData.supportState) {
                                            setSupportState(supportData.supportState);
                                          }
                                          const assistantMessage: Message = {
                                            id: (Date.now() + 1).toString(),
                                            role: 'assistant',
                                            content: supportData.response,
                                            action: supportData.action,
                                            brands: supportData.brands,
                                            inputType: supportData.inputType,
                                          };
                                          setMessages((prev) => [...prev, assistantMessage]);
                                          setIsTyping(false);
                                          return;
                                        }
                                      }
                                      
                                      // Use regular chat flow
                                      if (useStreaming) {
                                        const assistantMessageId = (Date.now() + 1).toString();
                                        setStreamingMessageId(assistantMessageId);
                                        const streamingMessage: Message = {
                                          id: assistantMessageId,
                                          role: 'assistant',
                                          content: '',
                                        };
                                        setMessages((prev) => [...prev, streamingMessage]);
                                        setIsTyping(false);
                                        await sendStreamMessage({
                                          message: text,
                                          username,
                                          sessionId: sessionId || undefined,
                                          previousResponseId: responseId || undefined,
                                          clientMessageId: assistantMessageId,
                                        });
                                      } else {
                                        const response = await fetch('/api/chat/sandwich', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            username,
                                            message: text,
                                            responseId,
                                            sessionId,
                                          }),
                                        });
                                        const data = await response.json();
                                        const assistantMessage: Message = {
                                          id: (Date.now() + 1).toString(),
                                          role: 'assistant',
                                          content: data.response,
                                          uiDirectives: data.uiDirectives,
                                          cardsPayload: data.cardsPayload,
                                        };
                                        setMessages((prev) => [...prev, assistantMessage]);
                                      }
                                    } catch (error) {
                                      console.error('Error:', error);
                                      setMessages((prev) => [...prev, {
                                        id: (Date.now() + 1).toString(),
                                        role: 'assistant',
                                        content: 'אופס! משהו השתבש. נסי שוב.',
                                      }]);
                                    } finally {
                                      setIsTyping(false);
                                    }
                                  } else if (action === 'start_support') {
                                    handleSupportInput('יש לי בעיה עם הזמנה');
                                  }
                                }}
                                onBrandAction={(action, brand) => {
                                  if (action === 'copy' && brand.coupon_code) {
                                    trackEvent('coupon_copied', { 
                                      brandName: brand.brand_name, 
                                      couponCode: brand.coupon_code,
                                    });
                                    handleCopyCode(brand.coupon_code);
                                  } else if (action === 'open' && brand.link) {
                                    trackEvent('link_opened', { 
                                      brandName: brand.brand_name, 
                                      link: brand.link,
                                    });
                                    window.open(brand.link, '_blank');
                                  } else if (action === 'support') {
                                    trackEvent('support_started', { 
                                      brandName: brand.brand_name,
                                    });
                                    handleSupportInput(`יש לי בעיה עם הזמנה מ${brand.brand_name}`);
                                  }
                                }}
                                onFormSubmit={(type, value) => {
                                  trackEvent('form_submitted', { type });
                                  handleSupportInput(value);
                                }}
                                isLoading={isTyping}
                              />
                            </div>
                          )}
                          
                          {/* Legacy: Show Brand Cards after assistant message with show_brands action */}
                          {msg.role === 'assistant' && msg.action === 'show_brands' && msg.brands && !msg.uiDirectives && index === messages.length - 1 && !isTyping && (
                            <div className="mt-4">
                              <BrandCards
                                brands={msg.brands}
                                onSelect={(brandName) => handleSupportInput(brandName)}
                              />
                            </div>
                          )}
                          
                          {/* Legacy: Show Support Form after assistant message with collect_input action */}
                          {msg.role === 'assistant' && msg.action === 'collect_input' && msg.inputType && !msg.uiDirectives && index === messages.length - 1 && !isTyping && (
                            <div className="mt-4">
                              <SupportFlowForm
                                inputType={msg.inputType}
                                onSubmit={(value) => handleSupportInput(value)}
                                isLoading={isTyping}
                              />
                            </div>
                          )}
                        </div>
                        );
                      })}
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
                        placeholder="חפשו מותגים, קופונים..."
                        className="input pr-10"
                      />
                    </div>
                  </div>
                </div>

                {/* Brands */}
                <div className="px-4 py-6">
                  <div className="max-w-2xl mx-auto space-y-6">
                    {/* Coupons */}
                    {brands.filter((b) => b.coupon_code).length > 0 && (
                      <section>
                        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text)' }}>קודי קופון</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {brands.filter((b) => b.coupon_code).map((brand) => (
                            <button
                              key={brand.id}
                              onClick={() => handleCopyCode(brand.coupon_code!)}
                              className="p-4 rounded-xl text-right transition-all"
                              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs" style={{ color: 'var(--color-text)', opacity: 0.6 }}>{brand.category || 'מותג'}</span>
                                <span className="text-xs font-medium" style={{ color: copiedCode === brand.coupon_code ? '#10b981' : 'var(--color-primary)' }}>
                                  {copiedCode === brand.coupon_code ? 'הועתק!' : 'העתק'}
                                </span>
                              </div>
                              <p className="font-mono font-bold text-base" style={{ color: 'var(--color-text)' }}>{brand.coupon_code}</p>
                              <p className="text-xs mt-1" style={{ color: 'var(--color-text)', opacity: 0.6 }}>{brand.brand_name}</p>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* All Brands */}
                    <section>
                      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text)' }}>מותגים</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {filteredBrands.map((brand) => (
                          <button
                            key={brand.id}
                            onClick={() => brand.coupon_code && handleCopyCode(brand.coupon_code)}
                            className="p-4 rounded-xl text-right transition-all hover:shadow-lg"
                            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                          >
                            <p className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>{brand.brand_name}</p>
                            {brand.description && (
                              <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-text)', opacity: 0.6 }}>{brand.description}</p>
                            )}
                            {brand.category && (
                              <p className="text-xs mt-1" style={{ color: 'var(--color-primary)' }}>{brand.category}</p>
                            )}
                            {brand.coupon_code ? (
                              <div className="mt-2 flex items-center gap-2">
                                <span 
                                  className="px-2 py-1 text-xs font-mono font-bold rounded"
                                  style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}
                                >
                                  {brand.coupon_code}
                                </span>
                                <span className="text-xs" style={{ color: copiedCode === brand.coupon_code ? '#10b981' : 'var(--color-text)', opacity: copiedCode === brand.coupon_code ? 1 : 0.5 }}>
                                  {copiedCode === brand.coupon_code ? 'הועתק!' : 'לחץ להעתקה'}
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs mt-2" style={{ color: 'var(--color-text)', opacity: 0.4 }}>ללא קופון כרגע</p>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Support Modal */}
        <AnimatePresence>
          {showSupportModal && (
            <SupportForm
              username={params.username}
              influencerName={influencer.display_name}
              products={brands.map(b => ({ 
                id: b.id, 
                name: b.name || 'מותג ללא שם', 
                brand: b.name || 'מותג ללא שם',
                coupon_code: b.coupon_code || null,
                image_url: b.image_url || null,
              }))}
              onClose={() => setShowSupportModal(false)}
              onSuccess={() => {
                setSupportSuccess(true);
                setTimeout(() => {
                  setShowSupportModal(false);
                  setSupportSuccess(false);
                }, 2000);
              }}
            />
          )}
        </AnimatePresence>
      </main>
    </>
  );
}

