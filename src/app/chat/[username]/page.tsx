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
  Ticket,
  AlertCircle,
  HelpCircle,
  ChevronLeft,
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
  image_url: string | null;
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
  suggestions?: string[]; // AI-generated follow-up suggestions
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

/**
 * Parse AI-generated suggestions from bot response.
 * Format: <<SUGGESTIONS>>suggestion1|suggestion2|suggestion3<</SUGGESTIONS>>
 * Returns clean text (without the tag) and parsed suggestions array.
 */
function parseSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  const match = text.match(/<<SUGGESTIONS>>(.*?)<\/SUGGESTIONS>>/s);
  if (!match) {
    // Also strip partial tag at end (during streaming)
    const partialClean = text.replace(/<<SUGGESTIONS>>.*$/s, '').trim();
    return { cleanText: partialClean, suggestions: [] };
  }
  const cleanText = text.replace(/<<SUGGESTIONS>>.*?<\/SUGGESTIONS>>/s, '').trim();
  const suggestions = match[1]
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 40)
    .slice(0, 3);
  return { cleanText, suggestions };
}

export default function ChatbotPage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();
  
  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'chat' | 'search' | 'coupons' | 'problem'>('chat');
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
  
  const [isMobile, setIsMobile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTapRef = useRef<number>(0);
  const streamingMessageIdRef = useRef<string | null>(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
        const { cleanText, suggestions } = parseSuggestions(done.fullText);
        setMessages(prev => prev.map(m => {
          if (m.id !== msgId) return m;
          return {
            ...m,
            content: cleanText,
            suggestions: suggestions.length > 0 ? suggestions : undefined,
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
            ? { ...m, content: error.message || 'אופס, משהו השתבש 😅 נסה לשלוח שוב' }
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
        console.log('[Chat Page] Loaded brands:', brandsData.length, brandsData.map(b => ({ name: b.brand_name, coupon: b.coupon_code })));
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

  // Send a quick message directly (used by suggestion pills)
  const sendQuickMessage = (text: string) => {
    if (isTyping || isStreamActive || !influencer) return;
    setInputValue(text);
    // Use a microtask to ensure state is updated before sending
    setTimeout(() => {
      const fakeInput = text.trim();
      if (!fakeInput) return;
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: fakeInput,
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');
      setIsTyping(true);

      // Streaming send
      if (useStreaming) {
        const assistantMessageId = (Date.now() + 1).toString();
        setStreamingMessageId(assistantMessageId);
        setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant', content: '' }]);
        setIsTyping(false);
        sendStreamMessage({
          message: fakeInput,
          username,
          sessionId: sessionId || undefined,
          previousResponseId: responseId || undefined,
          clientMessageId: assistantMessageId,
        });
      }
    }, 0);
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

      const rawResponse = data.response || 'מצטער, משהו השתבש. נסה שוב!';
      const { cleanText: cleanResponse, suggestions: parsedSuggestions } = parseSuggestions(rawResponse);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: cleanResponse,
        suggestions: parsedSuggestions.length > 0 ? parsedSuggestions : undefined,
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
        content: 'אופס, משהו השתבש 😅 נסה לשלוח שוב או לנסח את השאלה אחרת',
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

  const handleCopyCode = (code: string, brandId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(brandId);
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
      
      <main className="chat-page min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
        {/* Header */}
        <header className="sticky top-0 z-50 glass header-border px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            {/* Right side - Back button (desktop only) + Avatar + Name */}
            <div className="flex items-center gap-2.5">
              {/* Back arrow - hidden on mobile */}
              <button
                onClick={() => window.history.back()}
                className="hidden md:flex p-2 rounded-lg transition-all hover:bg-black/10"
                style={{ color: 'var(--color-text)' }}
                aria-label="חזרה"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div onClick={handleAvatarTap} className="cursor-pointer select-none relative">
                {influencer.avatar_url ? (
                  <div className={isMobile ? '' : 'avatar-ring'}>
                    <div className={`relative w-11 h-11 overflow-hidden ${isMobile ? 'rounded-full' : 'rounded-[14px]'}`}>
                      <Image
                        src={getProxiedImageUrl(influencer.avatar_url)}
                        alt={influencer.display_name}
                        fill
                        className="object-cover"
                        sizes="44px"
                        unoptimized
                      />
                    </div>
                  </div>
                ) : (
                  <div className={isMobile ? '' : 'avatar-ring'}>
                    <div
                      className={`w-11 h-11 flex items-center justify-center text-white font-bold text-lg ${isMobile ? 'rounded-full' : 'rounded-[14px]'}`}
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {influencer.display_name.charAt(0)}
                    </div>
                  </div>
                )}
                {/* Online status dot */}
                <div className="status-dot absolute -bottom-0.5 -left-0.5" />
              </div>
              <div>
                <h1 className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>
                  {influencer.display_name}
                </h1>
                <p className="text-xs" style={{ color: 'var(--color-text)', opacity: 0.5 }}>
                  {typeLabels[influencer.influencer_type as InfluencerType] || typeLabels.other}
                </p>
              </div>
            </div>

            {/* Left side - Desktop: Tabs + New Chat | Mobile: Help icon */}
            <div className="flex items-center gap-2">
              {/* Desktop tab pills - hidden on mobile */}
              <div className="hidden md:flex gap-1 p-1 rounded-full" style={{ backgroundColor: '#f0f0f2' }}>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    activeTab === 'chat' ? 'tab-active' : ''
                  }`}
                  style={activeTab === 'chat' ? {} : { color: 'var(--color-text)' }}
                >
                  צ'אט
                </button>
                <button
                  onClick={() => setActiveTab('search')}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    activeTab === 'search' ? 'tab-active' : ''
                  }`}
                  style={activeTab === 'search' ? {} : { color: 'var(--color-text)' }}
                >
                  חיפוש
                </button>
              </div>

              {/* Support Button - desktop only */}
              {influencer.whatsapp_enabled && (
                <button
                  onClick={() => setShowSupportModal(true)}
                  className="hidden md:flex p-2 rounded-lg transition-all hover:bg-black/10"
                  style={{ color: 'var(--color-accent)' }}
                  aria-label="פנייה לתמיכה"
                  title="פנייה לתמיכה"
                >
                  <Headphones className="w-5 h-5" />
                </button>
              )}

              {/* New Chat Button - desktop only, visible when there are messages */}
              {messages.length > 0 && (
                <button
                  onClick={handleNewChat}
                  className="hidden md:flex p-2 rounded-lg transition-all hover:bg-black/10"
                  style={{ color: 'var(--color-primary)' }}
                  aria-label="שיחה חדשה"
                  title="שיחה חדשה"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}

              {/* Mobile: Help icon */}
              <button
                onClick={() => setShowSupportModal(true)}
                className="flex md:hidden p-2 rounded-lg transition-all hover:bg-black/10"
                style={{ color: 'var(--color-text)' }}
                aria-label="עזרה"
              >
                <HelpCircle className="w-[18px] h-[18px]" />
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
                className={`h-full flex flex-col relative ${isMobile ? 'mobile-chat' : ''}`}
              >
                {/* Chat Messages */}
                <div className={`flex-1 overflow-y-auto px-4 py-6 space-y-4 chat-bg chat-messages-scroll ${isMobile ? 'pb-44' : 'pb-32'}`}>
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center px-4 pt-10">
                      {/* Avatar with decorative ring */}
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4 }}
                        className="mb-5"
                      >
                        {influencer.avatar_url ? (
                          isMobile ? (
                            <div className="relative w-[120px] h-[120px] rounded-full overflow-hidden mx-auto">
                              <Image
                                src={getProxiedImageUrl(influencer.avatar_url)}
                                alt={influencer.display_name}
                                fill
                                className="object-cover"
                                sizes="120px"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div className="avatar-ring-lg">
                              <div className="relative w-20 h-20 rounded-[20px] overflow-hidden">
                                <Image
                                  src={getProxiedImageUrl(influencer.avatar_url)}
                                  alt={influencer.display_name}
                                  fill
                                  className="object-cover"
                                  sizes="80px"
                                  unoptimized
                                />
                              </div>
                            </div>
                          )
                        ) : (
                          isMobile ? (
                            <div
                              className="w-[120px] h-[120px] rounded-full flex items-center justify-center text-white font-bold text-4xl mx-auto"
                              style={{ backgroundColor: 'var(--color-primary)' }}
                            >
                              {influencer.display_name.charAt(0)}
                            </div>
                          ) : (
                            <div className="avatar-ring-lg">
                              <div
                                className="w-20 h-20 rounded-[20px] flex items-center justify-center text-white font-bold text-2xl"
                                style={{ backgroundColor: 'var(--color-primary)' }}
                              >
                                {influencer.display_name.charAt(0)}
                              </div>
                            </div>
                          )
                        )}
                      </motion.div>

                      <motion.h2
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className={isMobile ? 'font-semibold mb-2' : 'text-xl font-semibold mb-2'}
                        style={isMobile
                          ? { color: 'var(--color-text)', fontSize: '33px', lineHeight: '1.2' }
                          : { color: 'var(--color-text)' }
                        }
                      >
                        {isMobile
                          ? `היי אני העוזר האישי של ${influencer.display_name.split(' ')[0]}`
                          : greetingMessage
                        }
                      </motion.h2>
                      <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className={isMobile ? 'mb-7 max-w-sm leading-relaxed' : 'mb-7 max-w-sm text-sm leading-relaxed'}
                        style={isMobile
                          ? { color: '#676767', fontSize: '16px' }
                          : { color: 'var(--color-text)', opacity: 0.6 }
                        }
                      >
                        אני כאן לעזור עם {(typeLabels[influencer.influencer_type as InfluencerType] || typeLabels.other).toLowerCase()}, מותגים וקופונים
                      </motion.p>

                      {/* Quick Action Buttons - hidden on mobile (replaced by bottom tabs) */}
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className="hidden md:flex gap-3 justify-center mb-8"
                      >
                        {brands.length > 0 && (
                          <button
                            onClick={() => setActiveTab('search')}
                            className="px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:shadow-md"
                            style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                          >
                            🛍️ קופונים ומותגים
                          </button>
                        )}
                        <button
                          onClick={() => setShowSupportModal(true)}
                          className="px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:shadow-md"
                          style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                        >
                          💬 בעיה בהזמנה
                        </button>
                      </motion.div>

                      {/* Dynamic welcome suggestions */}
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 }}
                        className="flex flex-wrap gap-2.5 justify-center max-w-md mb-8"
                      >
                        {suggestedQuestions.slice(0, 3).map((q, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setInputValue(q);
                              inputRef.current?.focus();
                            }}
                            className="suggestion-pill"
                          >
                            {q}
                          </button>
                        ))}
                      </motion.div>

                      {/* Brands Preview - hidden on mobile empty state */}
                      {brands.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.4 }}
                          className="hidden md:block w-full mt-2"
                        >
                          <p className="text-xs mb-3 text-center" style={{ color: 'var(--color-text)', opacity: 0.4 }}>
                            מותגים וקופונים
                          </p>
                          <div className="flex gap-3 overflow-x-auto pb-3 px-4 scrollbar-hide">
                            {brands.slice(0, 6).map((brand) => (
                              <button
                                key={brand.id}
                                onClick={() => brand.coupon_code && handleCopyCode(brand.coupon_code, brand.id)}
                                className="flex-shrink-0 w-32 p-3.5 rounded-2xl text-center transition-all hover:shadow-md"
                                style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)' }}
                              >
                                {brand.image_url ? (
                                  <img src={brand.image_url} alt={brand.brand_name} className="w-10 h-10 mx-auto mb-2 rounded-lg object-contain" />
                                ) : (
                                  <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, #f0f0f2)', color: 'var(--color-primary)' }}>
                                    {brand.brand_name.charAt(0).toUpperCase()}
                                  </div>
                                )}
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
                                    className="inline-block mt-2 px-2 py-1 text-[10px] font-mono font-semibold rounded-md"
                                    style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}
                                  >
                                    {copiedCode === brand.id ? 'הועתק!' : brand.coupon_code}
                                  </span>
                                ) : (
                                  <span className="inline-block mt-2 text-[10px]" style={{ color: 'var(--color-text)', opacity: 0.4 }}>
                                    ללא קופון
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, index) => {
                        // For streaming messages, use the live text (strip suggestions tag)
                        const isStreamingThis = streamingMessageId === msg.id && isStreamActive;
                        const rawContent = isStreamingThis ? streamText : msg.content;
                        const displayContent = rawContent.replace(/<<SUGGESTIONS>>.*$/s, '').trim();
                        // For streaming, use meta directives until done
                        const displayDirectives = isStreamingThis && streamMeta?.uiDirectives 
                          ? streamMeta.uiDirectives as UIDirectives 
                          : msg.uiDirectives;
                        // For streaming, use cards from stream
                        const displayCards = isStreamingThis && streamCards?.items 
                          ? { type: streamCards.cardsType, data: streamCards.items as BrandCardData[] }
                          : msg.cardsPayload;
                        
                        return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20, y: 6 }}
                          animate={{ opacity: 1, x: 0, y: 0 }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                        >
                          <div
                            className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'} items-end gap-2`}
                          >
                            {/* Bot avatar (assistant messages only) - hidden on mobile via CSS */}
                            {msg.role === 'assistant' && influencer.avatar_url && (
                              <div className="bot-avatar-inline relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mb-5">
                                <Image
                                  src={getProxiedImageUrl(influencer.avatar_url)}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="24px"
                                  unoptimized
                                />
                              </div>
                            )}
                            <div>
                              <div className={`max-w-[80%] px-4 py-3 ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
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
                                          a: ({ node, ...props }) => (
                                            <a
                                              {...props}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800 underline decoration-2 underline-offset-2 font-semibold cursor-pointer transition-colors"
                                            />
                                          ),
                                          p: ({ node, ...props }) => (
                                            <p {...props} className="mb-2 last:mb-0 leading-relaxed" />
                                          ),
                                          ul: ({ node, ...props }) => (
                                            <ul {...props} className="list-disc list-inside space-y-1 my-2" />
                                          ),
                                          ol: ({ node, ...props }) => (
                                            <ol {...props} className="list-decimal list-inside space-y-1 my-2" />
                                          ),
                                          li: ({ node, ...props }) => (
                                            <li {...props} className="leading-relaxed" />
                                          ),
                                          strong: ({ node, ...props }) => (
                                            <strong {...props} className="font-bold" />
                                          ),
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
                              {/* Timestamp */}
                              <div className={`msg-time ${msg.role === 'user' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--color-text)' }}>
                                {new Date(parseInt(msg.id)).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                              </div>
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
                                    setShowSupportModal(true);
                                  }
                                }}
                                onBrandAction={(action, brand) => {
                                  if (action === 'copy' && brand.coupon_code) {
                                    trackEvent('coupon_copied', { 
                                      brandName: brand.brand_name, 
                                      couponCode: brand.coupon_code,
                                    });
                                    handleCopyCode(brand.coupon_code, brand.id);
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
                                    setShowSupportModal(true);
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
                        </motion.div>
                        );
                      })}

                      {/* AI-generated suggestions after last bot response */}
                      {!isTyping && !isStreamActive && messages.length > 0 && (() => {
                        const lastMsg = messages[messages.length - 1];
                        if (lastMsg?.role !== 'assistant' || !lastMsg.suggestions?.length) return null;
                        // Don't show suggestions after brand cards
                        if (lastMsg.cardsPayload || lastMsg.action === 'show_brands') return null;
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.2 }}
                            className="flex flex-wrap gap-2 justify-center mt-3"
                          >
                            {lastMsg.suggestions.map((s, i) => (
                              <button
                                key={i}
                                onClick={() => sendQuickMessage(s)}
                                className="suggestion-pill text-xs"
                              >
                                {s}
                              </button>
                            ))}
                          </motion.div>
                        );
                      })()}

                      {isTyping && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex justify-end items-end gap-2"
                        >
                          {influencer.avatar_url && (
                            <div className="bot-avatar-inline relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mb-0.5">
                              <Image
                                src={getProxiedImageUrl(influencer.avatar_url)}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="24px"
                                unoptimized
                              />
                            </div>
                          )}
                          <div className="typing-indicator">
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                          </div>
                        </motion.div>
                      )}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Chat Input */}
                <div
                  className={`absolute bottom-0 left-0 right-0 pt-3 chat-input-gradient ${isMobile ? 'px-[15px] pb-[calc(max(8px,env(safe-area-inset-bottom))+60px)]' : 'px-4 pb-safe'}`}
                  style={isMobile
                    ? { background: 'linear-gradient(to top, #f4f5f7 70%, rgba(244,245,247,0))' }
                    : { background: 'linear-gradient(to top, #ffffff 60%, rgba(255,255,255,0))' }
                  }
                >
                  <div className="max-w-2xl mx-auto">
                    {/* Quick action buttons above input - desktop only */}
                    {messages.length > 0 && (
                      <div className="hidden md:flex gap-2 mb-2 justify-center">
                        {brands.length > 0 && (
                          <button
                            onClick={() => setActiveTab('search')}
                            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                            style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                          >
                            🛍️ קופונים
                          </button>
                        )}
                        <button
                          onClick={() => setShowSupportModal(true)}
                          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                          style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                        >
                          💬 בעיה בהזמנה
                        </button>
                      </div>
                    )}
                    <div className="chat-input-pill">
                      <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="מה רצית לשאול?"
                        disabled={isTyping}
                        rows={1}
                        onInput={(e) => {
                          const t = e.currentTarget;
                          t.style.height = 'auto';
                          t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                        }}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || isTyping}
                        className="send-btn"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'search' ? (
              <motion.div
                key="search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full overflow-y-auto"
              >
                {/* Search Header */}
                <div className="sticky top-0 z-40 px-4 py-4 border-b" style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)' }}>
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
                              onClick={() => handleCopyCode(brand.coupon_code!, brand.id)}
                              className="p-4 rounded-xl text-right transition-all"
                              style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)' }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs" style={{ color: 'var(--color-text)', opacity: 0.6 }}>{brand.category || 'מותג'}</span>
                                <span className="text-xs font-medium" style={{ color: copiedCode === brand.id ? '#10b981' : 'var(--color-primary)' }}>
                                  {copiedCode === brand.id ? 'הועתק!' : 'העתק'}
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
                            onClick={() => brand.coupon_code && handleCopyCode(brand.coupon_code, brand.id)}
                            className="p-4 rounded-xl text-right transition-all hover:shadow-md flex gap-3 items-start"
                            style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)' }}
                          >
                            {brand.image_url ? (
                              <img src={brand.image_url} alt={brand.brand_name} className="w-10 h-10 rounded-lg object-contain flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, #f0f0f2)', color: 'var(--color-primary)' }}>
                                {brand.brand_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
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
                                <span className="text-xs" style={{ color: copiedCode === brand.id ? '#10b981' : 'var(--color-text)', opacity: copiedCode === brand.id ? 1 : 0.5 }}>
                                  {copiedCode === brand.id ? 'הועתק!' : 'לחץ להעתקה'}
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs mt-2" style={{ color: 'var(--color-text)', opacity: 0.4 }}>ללא קופון כרגע</p>
                            )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'coupons' ? (
              /* ============ COUPONS TAB (Mobile) ============ */
              <motion.div
                key="coupons"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full overflow-y-auto pb-32"
                style={{ background: '#f4f5f7' }}
              >
                <div className="px-4 py-6">
                  <div className="max-w-2xl mx-auto">
                    <h2 className="font-semibold mb-1" style={{ fontSize: '26px', color: '#0c1013' }}>קופונים</h2>
                    <p className="mb-6" style={{ fontSize: '16px', color: '#676767' }}>טקסט קצר על הקופונים</p>
                    <div className="flex flex-col gap-3">
                      {brands.map((brand) => (
                        <button
                          key={brand.id}
                          onClick={() => brand.coupon_code && handleCopyCode(brand.coupon_code, brand.id)}
                          className="mobile-brand-row"
                        >
                          {/* Brand logo */}
                          <div className="brand-logo">
                            {brand.image_url ? (
                              <img src={getProxiedImageUrl(brand.image_url)} alt={brand.brand_name} />
                            ) : (
                              <span className="brand-logo-letter">{brand.brand_name.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          {/* Brand name */}
                          <div className="flex-1 min-w-0 text-right">
                            <p className="font-semibold truncate" style={{ fontSize: '16px', color: '#0c1013' }}>
                              {brand.brand_name}
                            </p>
                          </div>
                          {/* Coupon badge or "no coupon" */}
                          {brand.coupon_code ? (
                            <div className="flex items-center gap-2">
                              <span className="mobile-coupon-badge">
                                {copiedCode === brand.id ? 'הועתק!' : brand.coupon_code}
                              </span>
                              <Copy className="w-4 h-4 flex-shrink-0" style={{ color: '#676767' }} />
                            </div>
                          ) : (
                            <span className="mobile-coupon-none">ללא קוד קופון</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'problem' ? (
              /* ============ PROBLEM/SUPPORT TAB (Mobile) ============ */
              <motion.div
                key="problem"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full overflow-y-auto pb-32"
                style={{ background: '#f4f5f7' }}
              >
                <div className="px-4 py-6">
                  <div className="max-w-2xl mx-auto">
                    <h2 className="font-semibold mb-1" style={{ fontSize: '26px', color: '#0c1013' }}>פניית תמיכה</h2>
                    <p className="mb-6" style={{ fontSize: '16px', color: '#676767' }}>בחר את המותג שיש לך בעיה איתו</p>
                    <div className="flex flex-col gap-3">
                      {brands.map((brand) => (
                        <button
                          key={brand.id}
                          onClick={() => {
                            setShowSupportModal(true);
                          }}
                          className="mobile-brand-row"
                        >
                          {/* Brand logo */}
                          <div className="brand-logo">
                            {brand.image_url ? (
                              <img src={getProxiedImageUrl(brand.image_url)} alt={brand.brand_name} />
                            ) : (
                              <span className="brand-logo-letter">{brand.brand_name.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          {/* Brand name */}
                          <div className="flex-1 min-w-0 text-right">
                            <p className="font-semibold truncate" style={{ fontSize: '16px', color: '#0c1013' }}>
                              {brand.brand_name}
                            </p>
                          </div>
                          {/* Arrow icon */}
                          <ChevronLeft className="w-5 h-5 flex-shrink-0" style={{ color: '#676767' }} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Mobile Bottom Tab Bar */}
        {isMobile && (
          <div className="mobile-bottom-tabs">
            <div className="mobile-bottom-tabs-inner">
              <button
                onClick={() => setActiveTab('chat')}
                className={`mobile-tab-btn ${activeTab === 'chat' ? 'active-chat' : ''}`}
              >
                <MessageCircle className="w-[18px] h-[18px]" />
                <span>צ'אט</span>
              </button>
              <button
                onClick={() => setActiveTab('coupons')}
                className={`mobile-tab-btn ${activeTab === 'coupons' ? 'active-coupons' : ''}`}
              >
                <Ticket className="w-[18px] h-[18px]" />
                <span>קופונים</span>
              </button>
              <button
                onClick={() => setActiveTab('problem')}
                className={`mobile-tab-btn ${activeTab === 'problem' ? 'active-problem' : ''}`}
              >
                <AlertCircle className="w-[18px] h-[18px]" />
                <span>בעיה בהזמנה</span>
              </button>
            </div>
          </div>
        )}

        {/* Support Modal */}
        <AnimatePresence>
          {showSupportModal && (
            <SupportForm
              username={username}
              influencerName={influencer.display_name}
              products={brands.map(b => ({ 
                id: b.id, 
                name: b.brand_name, 
                brand: b.brand_name,
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

