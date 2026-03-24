'use client';

import { useState, useRef, useEffect, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  Send,
  MessageCircle,
  Copy,
  ChefHat,
  Shirt,
  Cpu,
  Heart,
  Dumbbell,
  Sparkles,
  Baby,
  Plane,
  X,
  Loader2,
  Ticket,
  AlertCircle,
  HelpCircle,
  ChevronLeft,
  Plus,
  RotateCcw,
  CheckCircle,
  ArrowRight,
  Compass,
  Flame,
  Home,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { getInfluencerByUsername, getBrandsByInfluencer, getContentByInfluencer, type Brand } from '@/lib/supabase';
import type { DiscoveryCategoryAvailability } from '@/lib/discovery/types';

const DiscoveryTab = dynamic(() => import('@/components/chat/discovery/DiscoveryTab'), { ssr: false });
const TopicQuestionsTab = dynamic(() => import('@/components/chat/TopicQuestionsTab'), { ssr: false });
const ContentFeedTab = dynamic(() => import('@/components/chat/content-feed/ContentFeedTab'), { ssr: false });
import { applyTheme, getGoogleFontsUrl } from '@/lib/theme';
import { getProxiedImageUrl } from '@/lib/image-utils';
import { BrandCards } from '@/components/chat/BrandCards';
import { SupportFlowForm } from '@/components/chat/SupportFlowForm';
import { DirectiveRenderer, type UIDirectives, type BrandCardData } from '@/components/chat';
import { useStreamChat, type StreamMeta, type StreamCards, type StreamDone } from '@/hooks/useStreamChat';
import { useChatMedia } from '@/hooks/useChatMedia';
import { MediaAttachButton } from '@/components/chat/MediaAttachButton';
import { MediaPreview } from '@/components/chat/MediaPreview';
import SupportForm from '@/components/SupportForm';
import { LeadCapturePopup } from '@/components/chat/LeadCapturePopup';
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
  home: Home,
  media_news: Flame,
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
  home: 'בית ועיצוב',
  media_news: 'חדשות ובידור',
  other: 'טיפים והמלצות',
};

// Tab styling per tab id (icon, colors)
type TabId = string; // Dynamic — tab ids come from account config

const TAB_STYLE: Record<string, { icon: typeof MessageCircle; activeColor: string; activeBg: string }> = {
  chat: { icon: MessageCircle, activeColor: '#f1e9fd', activeBg: '#883fe2' },
  discover: { icon: Compass, activeColor: '#f1e9fd', activeBg: '#883fe2' },
  topics: { icon: Sparkles, activeColor: '#f1e9fd', activeBg: '#883fe2' },
  content_feed: { icon: Sparkles, activeColor: '#f1e9fd', activeBg: '#883fe2' },
  coupons: { icon: Ticket, activeColor: '#f1e9fd', activeBg: '#883fe2' },
  support: { icon: AlertCircle, activeColor: '#f1e9fd', activeBg: '#883fe2' },
};

function getTabStyle(tabId: string) {
  return TAB_STYLE[tabId] || TAB_STYLE.chat;
}

// Default tabs if config.tabs is not set (fallback)
const DEFAULT_TABS: { id: string; label: string; type: string; topic?: string }[] = [
  { id: 'chat', label: 'צ׳אט', type: 'chat' },
  { id: 'discover', label: 'גלו', type: 'discover' },
  { id: 'coupons', label: 'קופונים', type: 'coupons' },
  { id: 'support', label: 'בעיה בהזמנה', type: 'support' },
];

/**
 * Parse AI-generated suggestions from bot response.
 * Format: <<SUGGESTIONS>>suggestion1|suggestion2|suggestion3<</SUGGESTIONS>>
 * Returns clean text (without the tag) and parsed suggestions array.
 */
function parseSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  const match = text.match(/<<SUGGESTIONS>>([\s\S]*?)<\/SUGGESTIONS>>/);
  if (!match) {
    // Also strip partial tag at end (during streaming)
    const partialClean = text.replace(/<<SUGGESTIONS>>[\s\S]*$/, '').trim();
    return { cleanText: partialClean, suggestions: [] };
  }
  const cleanText = text.replace(/<<SUGGESTIONS>>[\s\S]*?<\/SUGGESTIONS>>/, '').trim();
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
  
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportBrand, setSupportBrand] = useState<string>('');
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const [supportForm, setSupportForm] = useState({ name: '', phone: '', message: '' });
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState(false);
  const [problemStep, setProblemStep] = useState<'brands' | 'form' | 'success'>('brands');
  const [problemBrand, setProblemBrand] = useState<Brand | null>(null);
  const [problemForm, setProblemForm] = useState({ name: '', phone: '', order: '', details: '' });
  const [problemLoading, setProblemLoading] = useState(false);
  const [problemError, setProblemError] = useState<string | null>(null);
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
  const [discoveryCategories, setDiscoveryCategories] = useState<DiscoveryCategoryAvailability[]>([]);
  const [initialDiscoverySlug, setInitialDiscoverySlug] = useState<string | null>(null);
  const [showLeadPopup, setShowLeadPopup] = useState(false);
  const [leadInfo, setLeadInfo] = useState<{ firstName: string; serialNumber: string } | null>(null);
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [hasCommercialContent, setHasCommercialContent] = useState(false);
  const [hotTopicPills, setHotTopicPills] = useState<{ name: string; summary: string | null; status: string }[]>([]);
  const userMsgCountRef = useRef(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTapRef = useRef<number>(0);
  const streamingMessageIdRef = useRef<string | null>(null);

  // Unique brands for problem tab (deduplicate by brand_name, keep first with logo)
  const uniqueBrands = useMemo(() => {
    const seen = new Map<string, Brand>();
    for (const b of brands) {
      const existing = seen.get(b.brand_name);
      if (!existing || (!existing.image_url && b.image_url)) {
        seen.set(b.brand_name, b);
      }
    }
    return Array.from(seen.values());
  }, [brands]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reset problem tab when switching away
  useEffect(() => {
    if (activeTab !== 'support') {
      setProblemStep('brands');
      setProblemBrand(null);
      setProblemForm({ name: '', phone: '', order: '', details: '' });
      setProblemError(null);
    }
  }, [activeTab]);

  // Keep ref in sync with state
  useEffect(() => {
    streamingMessageIdRef.current = streamingMessageId;
  }, [streamingMessageId]);

  // Refs to store streaming data for final message
  const streamMetaRef = useRef<StreamMeta | null>(null);
  const streamCardsRef = useRef<StreamCards | null>(null);

  // Streaming hook
  const media = useChatMedia();

  const {
    isStreaming: isStreamActive,
    meta: streamMeta,
    cards: streamCards,
    text: streamText,
    thinkingText,
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
    onDelta: () => {
      // First token arrived — hide typing dots, streaming text takes over
      setIsTyping(false);
    },
    onDone: (done) => {
      if (done.responseId) setResponseId(done.responseId);
      const msgId = streamingMessageIdRef.current;
      const meta = streamMetaRef.current;
      const cards = streamCardsRef.current;
      
      if (msgId && done.fullText) {
        const { cleanText, suggestions } = parseSuggestions(done.fullText);
        // Fall back to random topic suggestions if AI didn't generate any
        const fallbackSuggestions = suggestions.length > 0
          ? suggestions
          : topicSuggestions.length > 0
            ? topicSuggestions.sort(() => Math.random() - 0.5).slice(0, 3)
            : undefined;
        setMessages(prev => prev.map(m => {
          if (m.id !== msgId) return m;
          return {
            ...m,
            content: cleanText,
            suggestions: fallbackSuggestions,
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
      setIsTyping(false);
      const msgId = streamingMessageIdRef.current;
      if (msgId) {
        setMessages(prev => prev.map(m =>
          m.id === msgId
            ? { ...m, content: error.message || 'אופס, משהו השתבש. נסה לשלוח שוב' }
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

    // Preload discovery categories for the empty state (skip for media_news — uses hot topics instead)
    fetch(`/api/discovery/categories?username=${encodeURIComponent(username)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.categories) setDiscoveryCategories(data.categories.filter((c: DiscoveryCategoryAvailability) => c.available));
      })
      .catch(() => {});

    // Preload hot topic pills for media_news accounts
    fetch(`/api/discovery/hot-topics?limit=6&status=breaking,hot`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.topics?.length > 0) {
          setHotTopicPills(data.topics.map((t: any) => ({ name: t.topic_name, summary: t.summary, status: t.status })));
        }
      })
      .catch(() => {});

    // Preload topic suggestions + commercial content flag from init API
    fetch(`/api/chat/init?username=${encodeURIComponent(username)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.quickReplies) setQuickReplies(data.quickReplies);
        if (data?.topicSuggestions) setTopicSuggestions(data.topicSuggestions);
        if (data?.hasCommercialContent) setHasCommercialContent(true);
      })
      .catch(() => {});

    // Check if lead already registered
    try {
      const stored = localStorage.getItem(`chat_lead_${username}`);
      if (stored) setLeadInfo(JSON.parse(stored));
    } catch {}
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

  // Lead capture trigger helper — shared by all message-send paths
  const maybeShowLeadPopup = () => {
    userMsgCountRef.current++;
    if (userMsgCountRef.current >= 4 && !leadInfo && !showLeadPopup) {
      try {
        const dismissed = localStorage.getItem(`chat_lead_dismissed_${username}`);
        const canShow = !dismissed || (Date.now() - parseInt(dismissed)) > 86400000;
        if (canShow) setTimeout(() => setShowLeadPopup(true), 2000);
      } catch {}
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
      maybeShowLeadPopup();

      // Streaming send
      if (useStreaming) {
        const assistantMessageId = (Date.now() + 1).toString();
        setStreamingMessageId(assistantMessageId);
        setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant', content: '' }]);
        // Keep isTyping=true — thinking message / dots stay visible until first stream token
        sendStreamMessage({
          message: fakeInput,
          username,
          sessionId: sessionId || undefined,
          previousResponseId: responseId || undefined,
          clientMessageId: assistantMessageId,
          fromSuggestion: true,
        });
      }
    }, 0);
  };

  const handleSendMessage = async () => {
    const hasMedia = media.result && !media.isProcessing;
    if ((!inputValue.trim() && !hasMedia) || isTyping || isStreamActive || !influencer) return;

    const rawText = inputValue.trim() || (hasMedia ? 'מה דעתך?' : '');

    // Build message content: prepend media description if available
    let messageContent = rawText;
    if (hasMedia && media.result) {
      const tag = media.result.mediaType === 'video' ? 'סרטון' : 'תמונה';
      messageContent = `[${tag} שהמשתמש שלח:\n${media.result.description}]\n\n${rawText}`;
      media.clear();
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: rawText, // Show only the visible text to the user
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    // Lead capture trigger: after 4 user messages
    maybeShowLeadPopup();
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
        // Keep isTyping=true — the dots stay visible until first stream token arrives

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
      const nonStreamFallback = parsedSuggestions.length > 0
        ? parsedSuggestions
        : topicSuggestions.length > 0
          ? topicSuggestions.sort(() => Math.random() - 0.5).slice(0, 3)
          : undefined;
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: cleanResponse,
        suggestions: nonStreamFallback,
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
        content: 'אופס, משהו השתבש. נסה לשלוח שוב או לנסח את השאלה אחרת',
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

  const handleProblemSubmit = async () => {
    if (!problemBrand || !problemForm.name || !problemForm.phone || !problemForm.details || !influencer) {
      setProblemError('נא למלא את כל השדות החובה');
      return;
    }
    setProblemLoading(true);
    setProblemError(null);
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          brand: problemBrand.brand_name,
          customerName: problemForm.name,
          customerPhone: problemForm.phone,
          orderNumber: problemForm.order || null,
          problem: problemForm.details,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'שגיאה בשליחת הפנייה');
      setProblemStep('success');
    } catch (err) {
      setProblemError(err instanceof Error ? err.message : 'שגיאה בשליחת הפנייה');
    } finally {
      setProblemLoading(false);
    }
  };

  const resetProblemTab = () => {
    setProblemStep('brands');
    setProblemBrand(null);
    setProblemForm({ name: '', phone: '', order: '', details: '' });
    setProblemError(null);
    setProblemLoading(false);
  };

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
  
  // Check if branding should be hidden (white label)
  const hideBranding = influencer.hide_branding || false;

  return (
    <>
      {/* Google Fonts + mobile theme color */}
      <link href={getGoogleFontsUrl(influencer.theme)} rel="stylesheet" />
      <meta name="theme-color" content="#f4f5f7" />
      
      <main className="chat-page flex flex-col overflow-hidden" style={{ position: 'relative' }}>
        {/* Header */}
        <header className={`sticky top-0 z-50 ${isMobile ? 'glass px-4 h-[76px] flex items-center' : 'px-4 py-[10px]'}`} style={{ position: 'sticky', zIndex: 50, isolation: 'isolate' }}>
          {isMobile ? (
            /* ---- Mobile Header ---- */
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div onClick={handleAvatarTap} className="cursor-pointer select-none relative">
                  {influencer.avatar_url ? (
                    <div className="relative w-11 h-11 rounded-full overflow-hidden">
                      <Image src={getProxiedImageUrl(influencer.avatar_url)} alt={influencer.display_name} fill className="object-cover" sizes="44px" unoptimized />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: 'var(--color-primary)' }}>
                      {influencer.display_name.charAt(0)}
                    </div>
                  )}
                  <div className="status-dot absolute -bottom-0.5 -left-0.5" />
                </div>
                <div>
                  <h1 className="font-semibold text-base whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: '#0c1013' }}>{influencer.display_name}</h1>
                  <p className="text-xs" style={{ color: '#676767' }}>{influencer.header_label || typeLabels[influencer.influencer_type as InfluencerType] || typeLabels.other}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowSupportModal(true)} className="p-2 rounded-lg transition-all hover:bg-black/10" style={{ color: '#676767' }} aria-label="עזרה">
                  <HelpCircle className="w-[18px] h-[18px]" />
                </button>
              </div>
            </div>
          ) : (
            /* ---- Desktop Header (Figma pill) ---- */
            <div className="max-w-[700px] mx-auto rounded-full h-[69px] flex items-center justify-between px-3 flex-nowrap overflow-hidden chat-header-glow" style={{ background: 'white', border: '1px solid #f9e8f3', boxShadow: '-30px 4px 60px 0 rgba(201,60,118,0.1), 30px 4px 60px 0 rgba(56,100,227,0.1)' }}>
              {/* Right side: Avatar + Name */}
              <div className="flex items-center gap-2.5 min-w-0 flex-shrink">
                <div onClick={handleAvatarTap} className="cursor-pointer select-none relative">
                  {influencer.avatar_url ? (
                    <div className="relative w-[46px] h-[46px] rounded-full overflow-hidden">
                      <Image src={getProxiedImageUrl(influencer.avatar_url)} alt={influencer.display_name} fill className="object-cover" sizes="46px" unoptimized />
                    </div>
                  ) : (
                    <div className="w-[46px] h-[46px] rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: 'var(--color-primary)' }}>
                      {influencer.display_name.charAt(0)}
                    </div>
                  )}
                  <div className="status-dot absolute -bottom-0.5 -left-0.5" />
                </div>
                <div className="min-w-0">
                  <h1 className="font-semibold text-[19px] whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: '#0c1013' }}>{influencer.display_name}</h1>
                  <p className="text-[13px] whitespace-nowrap" style={{ color: '#676767' }}>{influencer.header_label || typeLabels[influencer.influencer_type as InfluencerType] || typeLabels.other}</p>
                </div>
              </div>

              {/* Left side: Tab pills */}
              <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-[5px] rounded-full p-[6px]" style={{ background: 'white' }}>
                {(influencer.tabs || DEFAULT_TABS).map((tab: { id: string; label: string; type?: string }) => {
                  const isActive = activeTab === tab.id;
                  const style = getTabStyle(tab.id);
                  const TabIcon = style.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabId)}
                      className="flex items-center gap-[6px] px-[11px] py-[6px] rounded-full transition-all"
                      style={{ color: isActive ? style.activeColor : '#676767', fontSize: '16px', fontWeight: isActive ? 700 : 400, background: isActive ? style.activeBg : 'transparent' }}
                    >
                      <span>{tab.label}</span>
                      <TabIcon className="w-[18px] h-[18px]" />
                    </button>
                  );
                })}
              </div>
              </div>
            </div>
          )}
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden" style={{ position: 'relative', zIndex: 1 }}>
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
                <div className={`flex-1 overflow-y-auto px-4 chat-bg chat-messages-scroll ${messages.length === 0 ? (isMobile ? 'pb-[80px]' : 'pb-8') : (isMobile ? 'pb-2 pt-3' : 'py-6 pb-8')} space-y-4`}>
                  {messages.length === 0 ? (
                    <div className={`flex flex-col items-center text-center px-4 ${isMobile ? 'pt-[32px]' : 'justify-center min-h-full'}`}>
                      <motion.h2
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="font-semibold mb-2 max-w-[426px]"
                        style={{ color: '#0c1013', fontSize: '33px', lineHeight: '38px' }}
                      >
                        {influencer.greeting_message || `היי אני העוזר האישי של ${influencer.display_name.split(' ')[0]}`}
                      </motion.h2>
                      {!isMobile && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.4, delay: 0.15 }}
                          className="w-[296px] h-px mb-3"
                          style={{ background: 'linear-gradient(90deg, transparent, #d9d9d9, transparent)' }}
                        />
                      )}
                      <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="mb-8 max-w-sm"
                        style={{ color: '#676767', fontSize: '16px' }}
                      >
                        {influencer.chat_subtitle || `אני כאן לעזור עם ${(typeLabels[influencer.influencer_type as InfluencerType] || typeLabels.other).toLowerCase()}, מותגים וקופונים`}
                      </motion.p>

                      {/* Inline input in empty state (centered, Figma style) */}
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className={`${isMobile ? 'w-[363px]' : 'w-[670px]'} max-w-full mb-6`}
                      >
                        {media.previewUrl && (
                          <MediaPreview
                            previewUrl={media.previewUrl}
                            isProcessing={media.isProcessing}
                            isReady={!!media.result}
                            isVideo={media.result?.mediaType === 'video' || media.previewUrl?.includes('video') || false}
                            error={media.error}
                            onClear={media.clear}
                          />
                        )}
                        <div className="chat-input-pill">
                          <MediaAttachButton
                            onFileSelected={(file) => media.processMedia(file, username)}
                            disabled={isTyping || media.isProcessing}
                          />
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
                            disabled={(!inputValue.trim() && !media.result) || isTyping || media.isProcessing}
                            className="send-btn"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                        {hasCommercialContent && (
                          <p dir="rtl" style={{ color: '#676767', fontSize: isMobile ? '11px' : '10px', textAlign: 'center', marginTop: '6px', lineHeight: '16px' }}>
                            העמוד עשוי לכלול תוכן שיווקי ושיתופי פעולה מסחריים
                          </p>
                        )}
                      </motion.div>

                      {/* Quick reply pills — only for non-media_news accounts (media_news uses hot topic pills instead) */}
                      {influencer.influencer_type !== 'media_news' && quickReplies.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.35 }}
                          className="flex flex-wrap justify-center gap-2 max-w-[670px] w-full px-2"
                        >
                          {quickReplies.map((q, i) => (
                            <motion.button
                              key={i}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.4 + i * 0.05, duration: 0.3 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => {
                                if (isTyping || isStreamActive) return;
                                maybeShowLeadPopup();
                                sendQuickMessage(q);
                              }}
                              className="suggestion-pill whitespace-nowrap flex-shrink-0"
                            >
                              {q}
                            </motion.button>
                          ))}
                        </motion.div>
                      )}

                      {/* Hot topic pills for media_news accounts */}
                      {influencer.influencer_type === 'media_news' && hotTopicPills.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.4 }}
                          className="discovery-pills-row"
                        >
                          <div className="discovery-pills-scroll">
                            {hotTopicPills.map((topic, i) => (
                              <motion.button
                                key={topic.name}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.45 + i * 0.05, duration: 0.3 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={async () => {
                                  if (isTyping || isStreamActive) return;
                                  const visibleMsg = `ספרו לי על ${topic.name}`;
                                  const apiMessage = topic.summary
                                    ? `${visibleMsg}\n\n[הקשר הלוק:]\n[נושא חם: ${topic.name} (${topic.status})\nתקציר: ${topic.summary}]`
                                    : visibleMsg;
                                  const userMsg: Message = { id: Date.now().toString(), role: 'user', content: visibleMsg };
                                  setMessages(prev => [...prev, userMsg]);
                                  setIsTyping(true);
                                  const assistantMessageId = (Date.now() + 1).toString();
                                  setStreamingMessageId(assistantMessageId);
                                  setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '' }]);
                                  await sendStreamMessage({
                                    message: apiMessage,
                                    username,
                                    sessionId: sessionId || undefined,
                                    previousResponseId: responseId || undefined,
                                    clientMessageId: assistantMessageId,
                                  });
                                }}
                                className="suggestion-pill whitespace-nowrap flex-shrink-0"
                                style={{
                                  background: topic.status === 'breaking' ? '#FFF0F0' : '#FFF8F0',
                                  borderColor: topic.status === 'breaking' ? '#FFD0D0' : '#FFE8D0',
                                }}
                              >
                                <span>{topic.name}</span>
                              </motion.button>
                            ))}
                            <motion.button
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.75, duration: 0.3 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setActiveTab('discover')}
                              className="suggestion-pill flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                              style={{ background: '#FFF3E5', borderColor: '#FFE0B2' }}
                            >
                              <Flame className="w-3.5 h-3.5" style={{ color: '#FF6B00' }} />
                              <span>מה עוד חם?</span>
                            </motion.button>
                          </div>
                        </motion.div>
                      )}

                      {/* Discovery category pills — horizontal scroll with arrow (non-news accounts) */}
                      {influencer.influencer_type !== 'media_news' && (influencer.tabs || DEFAULT_TABS).some((t: { id: string }) => t.id === 'discover') && discoveryCategories.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.4 }}
                          className="discovery-pills-row"
                        >
                          <button
                            className="discovery-pills-arrow"
                            onClick={() => {
                              const el = document.querySelector('.discovery-pills-scroll');
                              if (el) el.scrollBy({ left: -200, behavior: 'smooth' });
                            }}
                            aria-label="גלול שמאלה"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <div className="discovery-pills-scroll">
                            {discoveryCategories.slice(0, 6).map((cat, i) => (
                              <motion.button
                                key={cat.slug}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.45 + i * 0.05, duration: 0.3 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={async () => {
                                  if (isTyping || isStreamActive) return;
                                  maybeShowLeadPopup();
                                  const visibleMsg = `ספרי לי על ${cat.title}`;
                                  const userMsg: Message = { id: Date.now().toString(), role: 'user', content: visibleMsg };
                                  setMessages(prev => [...prev, userMsg]);
                                  setIsTyping(true);

                                  let enrichedMsg = visibleMsg;
                                  try {
                                    const res = await fetch(`/api/discovery/list?username=${encodeURIComponent(username)}&slug=${encodeURIComponent(cat.slug)}`);
                                    if (res.ok) {
                                      const listData = await res.json();
                                      const items = (listData.items || []).slice(0, 10);
                                      const contextLines = items.map((item: any, idx: number) => {
                                        const title = item.aiTitle || item.captionExcerpt || '';
                                        const summary = item.aiSummary || '';
                                        const metric = item.metricValue && item.metricLabel ? ` (${item.metricLabel}: ${item.metricValue.toLocaleString()})` : '';
                                        return `${idx + 1}. ${title}${metric}${summary ? ' — ' + summary : ''}`;
                                      }).join('\n');
                                      enrichedMsg = `[הנתונים מתוך הרשימה "${cat.title}":\n${contextLines}]\n\n${visibleMsg}`;
                                    }
                                  } catch { /* fallback to plain message */ }

                                  const assistantMessageId = (Date.now() + 1).toString();
                                  setStreamingMessageId(assistantMessageId);
                                  setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '' }]);
                                  await sendStreamMessage({
                                    message: enrichedMsg,
                                    username,
                                    sessionId: sessionId || undefined,
                                    previousResponseId: responseId || undefined,
                                    clientMessageId: assistantMessageId,
                                  });
                                }}
                                className="suggestion-pill whitespace-nowrap flex-shrink-0"
                              >
                                {cat.title}
                              </motion.button>
                            ))}
                            <motion.button
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.75, duration: 0.3 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setActiveTab('discover')}
                              className="suggestion-pill flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              <span>גלו עוד</span>
                            </motion.button>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  ) : (
                    <div className={`${isMobile ? 'flex flex-col justify-end min-h-full' : 'max-w-[700px] mx-auto'} space-y-4`}>
                      {messages.map((msg, index) => {
                        // For streaming messages, use the live text (strip suggestions tag)
                        const isStreamingThis = streamingMessageId === msg.id && isStreamActive;
                        const rawContent = isStreamingThis ? streamText : msg.content;
                        const displayContent = rawContent.replace(/<<SUGGESTIONS>>[\s\S]*$/, '').trim();
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
                            <div className="w-full">
                              <div className={`${msg.role === 'user' ? '' : 'max-w-[80%]'} inline-block ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
                                {msg.role === 'user' ? (
                                  <p className="text-sm whitespace-pre-wrap">{displayContent}</p>
                                ) : (
                                  <div className="text-sm markdown-content">
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
                            <div className="mt-3">
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
                                    maybeShowLeadPopup();
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
                                        // Keep isTyping=true — thinking message / dots stay visible until first stream token
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
                                    setSupportBrand(brand.brand_name);
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
                            className="flex gap-2 mt-3"
                          >
                            {lastMsg.suggestions.map((s, i) => (
                              <button
                                key={i}
                                onClick={() => sendQuickMessage(s)}
                                className="suggestion-pill text-xs flex-1 justify-center"
                              >
                                {s}
                              </button>
                            ))}
                          </motion.div>
                        );
                      })()}

                      {(isTyping || (isStreamActive && thinkingText && !streamText)) && (
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
                          {thinkingText ? (
                            <div className="thinking-message bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl rounded-br-md px-4 py-2 text-sm text-gray-600 dark:text-gray-300">
                              {thinkingText}
                            </div>
                          ) : (
                            <div className="typing-indicator">
                              <div className="typing-dot" />
                              <div className="typing-dot" />
                              <div className="typing-dot" />
                            </div>
                          )}
                        </motion.div>
                      )}
                      {messages.length > 0 && !isTyping && !isStreamActive && (
                        <button
                          onClick={() => setShowNewChatConfirm(true)}
                          className="flex items-center gap-1.5 mx-auto mt-4 transition-all hover:opacity-70"
                          style={{ color: '#9ca3af', fontSize: '13px' }}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>שיחה חדשה</span>
                        </button>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Chat Input — hidden in empty state (shown inline above) */}
                <div
                  className={`flex-shrink-0 pt-3 chat-input-gradient ${messages.length === 0 ? 'hidden' : (isMobile ? 'px-[15px] pb-[calc(max(8px,env(safe-area-inset-bottom))+60px)]' : 'px-6 pb-6')}`}
                  style={{ background: 'transparent' }}
                >
                  <div className={`mx-auto ${isMobile ? 'max-w-2xl' : 'max-w-[670px]'}`}>
                    {media.previewUrl && (
                      <MediaPreview
                        previewUrl={media.previewUrl}
                        isProcessing={media.isProcessing}
                        isReady={!!media.result}
                        isVideo={media.result?.mediaType === 'video' || media.previewUrl?.includes('video') || false}
                        error={media.error}
                        onClear={media.clear}
                      />
                    )}
                    <div className="chat-input-pill">
                      <MediaAttachButton
                        onFileSelected={(file) => media.processMedia(file, username)}
                        disabled={isTyping || media.isProcessing}
                      />
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
                        disabled={(!inputValue.trim() && !media.result) || isTyping || media.isProcessing}
                        className="send-btn"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                    {hasCommercialContent && (
                      <p dir="rtl" style={{ color: '#9ca3af', fontSize: '11px', textAlign: 'center', marginTop: '6px', lineHeight: '16px' }}>
                        העמוד עשוי לכלול תוכן שיווקי ושיתופי פעולה מסחריים
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'coupons' ? (
              /* ============ COUPONS TAB — WOW GLASSMORPHIC ============ */
              <motion.div
                key="coupons"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`coupons-tab h-full overflow-y-auto ${isMobile ? 'pb-32' : 'pb-8'}`}
              >
                <div className="px-4 py-6">
                  <div className={`mx-auto ${isMobile ? 'max-w-2xl' : 'max-w-[700px]'}`}>
                    <h2 className="coupons-header-title mb-1 text-center">קופונים</h2>
                    <p className="mb-6 text-center" style={{ fontSize: '15px', color: '#888' }}>הנחות בלעדיות בשבילכם</p>

                    {/* Active coupons */}
                    {brands.filter(b => b.coupon_code).length > 0 && (
                      <div className={`${isMobile ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-4'}`}>
                        {brands.filter(b => b.coupon_code).map((brand) => (
                          <button
                            key={brand.id}
                            onClick={() => handleCopyCode(brand.coupon_code!, brand.id)}
                            className="coupon-card"
                          >
                            {/* Brand logo */}
                            <div className="brand-logo">
                              {brand.image_url ? (
                                <img src={getProxiedImageUrl(brand.image_url)} alt={brand.brand_name} />
                              ) : (
                                <span className="brand-logo-letter">{brand.brand_name.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            {/* Brand name + what the coupon gives */}
                            <div className="flex-1 min-w-0 text-right">
                              <p className="font-semibold truncate" style={{ fontSize: '16px', color: '#1a1a2e' }}>
                                {brand.brand_name}
                              </p>
                              {brand.description && (
                                <p style={{ fontSize: '13px', color: '#888', marginTop: '2px', lineHeight: 1.4 }} className="line-clamp-2">
                                  {brand.description}
                                </p>
                              )}
                            </div>
                            {/* Coupon code pill */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`coupon-code-pill ${copiedCode === brand.id ? 'copied' : ''}`}>
                                {copiedCode === brand.id ? '✓ הועתק!' : brand.coupon_code}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Partnerships without coupons */}
                    {brands.filter(b => !b.coupon_code).length > 0 && (
                      <>
                        <h3 className="text-[15px] font-semibold mt-8 mb-3 text-right" style={{ color: '#555' }}>
                          שיתופי פעולה
                        </h3>
                        <div className={`${isMobile ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-3'}`}>
                          {brands.filter(b => !b.coupon_code).map((brand) => (
                            <div
                              key={brand.id}
                              className="coupon-card"
                              style={{ opacity: 0.75 }}
                            >
                              <div className="brand-logo">
                                {brand.image_url ? (
                                  <img src={getProxiedImageUrl(brand.image_url)} alt={brand.brand_name} />
                                ) : (
                                  <span className="brand-logo-letter">{brand.brand_name.charAt(0).toUpperCase()}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 text-right">
                                <p className="font-semibold truncate" style={{ fontSize: '15px', color: '#1a1a2e' }}>
                                  {brand.brand_name}
                                </p>
                                {brand.category && (
                                  <p className="truncate" style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>
                                    {brand.category}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'support' ? (
              /* ============ SUPPORT TAB — WOW GLASSMORPHIC ============ */
              <motion.div
                key="support"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`problem-tab h-full overflow-y-auto ${isMobile ? 'pb-32' : 'pb-8'}`}
              >
                <div className="px-4 py-6">
                  <div className={`mx-auto ${isMobile ? 'max-w-2xl' : 'max-w-[700px]'}`}>
                    <AnimatePresence mode="wait">
                      {/* ---- STEP 1: Brand Selection ---- */}
                      {problemStep === 'brands' && (
                        <motion.div
                          key="problem-brands"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                        >
                          <h2 className="problem-header-title mb-1 text-center">פניית תמיכה</h2>
                          <p className="mb-6 text-center" style={{ fontSize: '15px', color: '#888' }}>בחר את המותג שיש לך בעיה איתו</p>
                          <div className={`${isMobile ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-4'}`}>
                            {uniqueBrands.map((brand) => (
                              <button
                                key={brand.id}
                                onClick={() => {
                                  setProblemBrand(brand);
                                  setProblemStep('form');
                                }}
                                className="coupon-card"
                              >
                                <div className="brand-logo">
                                  {brand.image_url ? (
                                    <img src={getProxiedImageUrl(brand.image_url)} alt={brand.brand_name} />
                                  ) : (
                                    <span className="brand-logo-letter">{brand.brand_name.charAt(0).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 text-right">
                                  <p className="font-semibold truncate" style={{ fontSize: '16px', color: '#1a1a2e' }}>
                                    {brand.brand_name}
                                  </p>
                                </div>
                                <ChevronLeft className="w-5 h-5 flex-shrink-0" style={{ color: '#999' }} />
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* ---- STEP 2: Form ---- */}
                      {problemStep === 'form' && problemBrand && (
                        <motion.div
                          key="problem-form"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                        >
                          <h2 className="problem-header-title mb-1 text-center">פניית תמיכה</h2>
                          <p className="mb-5 text-center" style={{ fontSize: '15px', color: '#888' }}>מלא את הפרטים ונחזור אליך בהקדם</p>

                          {/* Selected brand pill */}
                          <div className="problem-brand-pill mb-6">
                            <div className="w-[32px] h-[32px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.8)' }}>
                              {problemBrand.image_url ? (
                                <img src={getProxiedImageUrl(problemBrand.image_url)} alt={problemBrand.brand_name} className="w-full h-full object-cover rounded-full" />
                              ) : (
                                <span className="text-xs font-bold" style={{ color: '#1a1a2e' }}>{problemBrand.brand_name.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <span className="text-[14px] font-semibold flex-1 text-right" style={{ color: '#1a1a2e' }}>{problemBrand.brand_name}</span>
                            <button
                              onClick={() => {
                                setProblemBrand(null);
                                setProblemStep('brands');
                              }}
                              className="w-[28px] h-[28px] rounded-full flex items-center justify-center hover:bg-white/50 transition-all"
                            >
                              <X className="w-3.5 h-3.5" style={{ color: '#999' }} />
                            </button>
                          </div>

                          {/* Form fields */}
                          <div className={`flex flex-col gap-3 ${isMobile ? '' : 'items-center'}`}>
                            <input
                              type="text"
                              value={problemForm.name}
                              onChange={(e) => setProblemForm({ ...problemForm, name: e.target.value })}
                              placeholder="שם מלא *"
                              className="problem-input"
                              style={{ maxWidth: isMobile ? '100%' : '363px' }}
                            />
                            <input
                              type="tel"
                              value={problemForm.phone}
                              onChange={(e) => setProblemForm({ ...problemForm, phone: e.target.value.replace(/\D/g, '') })}
                              placeholder="מספר טלפון *"
                              dir="ltr"
                              className="problem-input text-right"
                              style={{ maxWidth: isMobile ? '100%' : '363px' }}
                            />
                            <input
                              type="text"
                              value={problemForm.order}
                              onChange={(e) => setProblemForm({ ...problemForm, order: e.target.value })}
                              placeholder="מספר הזמנה (אופציונלי)"
                              className="problem-input"
                              style={{ maxWidth: isMobile ? '100%' : '363px' }}
                            />
                            <textarea
                              value={problemForm.details}
                              onChange={(e) => setProblemForm({ ...problemForm, details: e.target.value })}
                              placeholder="תאר את הבעיה... *"
                              rows={4}
                              className="problem-textarea"
                              style={{ maxWidth: isMobile ? '100%' : '363px' }}
                            />

                            {/* Error message */}
                            {problemError && (
                              <div className="text-center text-sm" style={{ color: '#ef4444', maxWidth: isMobile ? '100%' : '363px' }}>
                                {problemError}
                              </div>
                            )}

                            {/* Buttons */}
                            <div className={`flex gap-3 mt-2 ${isMobile ? 'flex-col-reverse' : 'justify-center'}`} style={{ maxWidth: isMobile ? '100%' : '363px', width: '100%' }}>
                              <button
                                onClick={() => {
                                  setProblemStep('brands');
                                  setProblemBrand(null);
                                  setProblemForm({ name: '', phone: '', order: '', details: '' });
                                  setProblemError(null);
                                }}
                                className="problem-btn-back flex items-center justify-center gap-2"
                                style={{
                                  flex: isMobile ? undefined : 1,
                                  width: isMobile ? '100%' : undefined,
                                }}
                              >
                                <ArrowRight className="w-4 h-4" />
                                חזרה
                              </button>
                              <button
                                onClick={handleProblemSubmit}
                                disabled={problemLoading}
                                className="problem-btn-submit flex items-center justify-center gap-2"
                                style={{
                                  flex: isMobile ? undefined : 1,
                                  width: isMobile ? '100%' : undefined,
                                }}
                              >
                                {problemLoading ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                  'שלח פנייה'
                                )}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* ---- STEP 3: Success ---- */}
                      {problemStep === 'success' && (
                        <motion.div
                          key="problem-success"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-center py-12"
                        >
                          <div className="problem-success-icon">
                            <CheckCircle className="w-8 h-8 text-white" />
                          </div>
                          <h3 className="text-[22px] font-bold mb-2" style={{ color: '#1a1a2e' }}>
                            הפנייה נשלחה בהצלחה!
                          </h3>
                          <p className="text-[15px] mb-8" style={{ color: '#888' }}>
                            נחזור אליך בהקדם האפשרי
                          </p>
                          <button
                            onClick={resetProblemTab}
                            className="problem-btn-submit px-10"
                          >
                            סגור
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'discover' ? (
              <motion.div
                key="discover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <DiscoveryTab
                  username={username}
                  influencerName={influencer.display_name || ''}
                  sessionId={sessionId || undefined}
                  initialCategory={initialDiscoverySlug}
                  influencerType={influencer.influencer_type}
                  onAskInChat={async (message, enrichedData) => {
                    setActiveTab('chat');
                    maybeShowLeadPopup();
                    // Add user bubble with clean message
                    const userMsg = { id: Date.now().toString(), role: 'user' as const, content: message };
                    setMessages(prev => [...prev, userMsg]);
                    setIsTyping(true);
                    // Prepare assistant streaming bubble
                    const assistantMessageId = (Date.now() + 1).toString();
                    setStreamingMessageId(assistantMessageId);
                    setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant' as const, content: '' }]);
                    setIsTyping(false);
                    // Send full context to API (hidden from user) — same pattern as ContentFeedTab
                    const apiMessage = enrichedData
                      ? `${message}\n\n[הקשר הלוק:]\n${enrichedData}`
                      : message;
                    await sendStreamMessage({
                      message: apiMessage,
                      username,
                      sessionId: sessionId || undefined,
                      previousResponseId: responseId || undefined,
                      clientMessageId: assistantMessageId,
                    });
                  }}
                  onCategoryOpened={() => setInitialDiscoverySlug(null)}
                />
              </motion.div>
            ) : activeTab === 'topics' ? (
              <TopicQuestionsTab
                key="topics"
                username={username}
                tabLabel={(influencer.tabs || DEFAULT_TABS).find((t: { id: string }) => t.id === 'topics')?.label || 'תוכן'}
                onAskAbout={(question: string) => {
                  setActiveTab('chat');
                  maybeShowLeadPopup();
                  const userMsg = { id: Date.now().toString(), role: 'user' as const, content: question };
                  setMessages(prev => [...prev, userMsg]);
                  setIsTyping(true);
                  const assistantMessageId = (Date.now() + 1).toString();
                  setStreamingMessageId(assistantMessageId);
                  setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant' as const, content: '' }]);
                  setIsTyping(false);
                  sendStreamMessage({
                    message: question,
                    username,
                    sessionId: sessionId || undefined,
                    previousResponseId: responseId || undefined,
                    clientMessageId: assistantMessageId,
                  });
                }}
              />
            ) : activeTab === 'content_feed' ? (
              <ContentFeedTab
                key="content_feed"
                username={username}
                influencerType={(influencer.influencer_type as InfluencerType) || 'other'}
                tabLabel={(influencer.tabs || DEFAULT_TABS).find((t: { id: string }) => t.id === 'content_feed')?.label || 'תוכן'}
                onAskAbout={(question: string, chunkId?: string, hiddenContext?: string) => {
                  setActiveTab('chat');
                  maybeShowLeadPopup();
                  // Show the clean display message in chat (not the hidden context)
                  const userMsg = { id: Date.now().toString(), role: 'user' as const, content: question };
                  setMessages(prev => [...prev, userMsg]);
                  setIsTyping(true);
                  const assistantMessageId = (Date.now() + 1).toString();
                  setStreamingMessageId(assistantMessageId);
                  setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant' as const, content: '' }]);
                  setIsTyping(false);
                  // Send the full context to the API (hidden from user)
                  const apiMessage = hiddenContext
                    ? `${question}\n\n[הקשר הלוק:]\n${hiddenContext}`
                    : question;
                  sendStreamMessage({
                    message: apiMessage,
                    username,
                    sessionId: sessionId || undefined,
                    previousResponseId: responseId || undefined,
                    clientMessageId: assistantMessageId,
                    chunkId,
                  });
                }}
              />
            ) : null}
          </AnimatePresence>
        </div>

        {/* Mobile Bottom Tab Bar */}
        {isMobile && influencer && (
          <div className="mobile-bottom-tabs">
            <div className="mobile-bottom-tabs-inner">
              {(influencer.tabs || DEFAULT_TABS).map((tab: { id: string; label: string; type?: string }) => {
                const style = getTabStyle(tab.id);
                const TabIcon = style.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabId)}
                    className={`mobile-tab-btn ${activeTab === tab.id ? `active-${tab.id}` : ''}`}
                  >
                    <span>{tab.label}</span>
                    <TabIcon className="w-[18px] h-[18px]" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Desktop: Help icon bottom-left (Figma) */}
        {!isMobile && (
          <button
            onClick={() => setShowSupportModal(true)}
            className="fixed bottom-6 left-6 z-50 w-[18px] h-[18px] flex items-center justify-center"
            style={{ color: '#676767' }}
            aria-label="עזרה"
          >
            <HelpCircle className="w-[18px] h-[18px]" />
          </button>
        )}

        {/* Lead Capture Popup */}
        {showLeadPopup && (
          <LeadCapturePopup
            username={username}
            sessionId={sessionId}
            onClose={() => {
              setShowLeadPopup(false);
              try { localStorage.setItem(`chat_lead_dismissed_${username}`, Date.now().toString()); } catch {}
            }}
            onSubmit={(data) => {
              setLeadInfo({ firstName: data.firstName, serialNumber: data.serialNumber });
              setShowLeadPopup(false);
              try { localStorage.setItem(`chat_lead_${username}`, JSON.stringify({ firstName: data.firstName, serialNumber: data.serialNumber })); } catch {}
              // Add a personalized greeting from the bot
              const greetingMessage: Message = {
                id: `lead-greeting-${Date.now()}`,
                role: 'assistant',
                content: `היי ${data.firstName}! שמחה שנרשמת. מעכשיו אני יכולה להתאים לך תוכן אישית. מה תרצה לדעת?`,
              };
              setMessages((prev) => [...prev, greetingMessage]);
            }}
          />
        )}

        {/* New Chat Confirmation */}
        <AnimatePresence>
          {showNewChatConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
              onClick={() => setShowNewChatConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-[340px] rounded-[30px] bg-white p-7 text-center"
                style={{ boxShadow: '0px 6px 20px rgba(0,0,0,0.1)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <RotateCcw className="w-5 h-5 mx-auto mb-4" style={{ color: '#676767' }} />
                <h3 className="font-semibold text-[19px] mb-1" style={{ color: '#0c1013' }}>שיחה חדשה?</h3>
                <p className="text-[14px] mb-6" style={{ color: '#676767' }}>השיחה הנוכחית תימחק ותתחיל שיחה חדשה</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowNewChatConfirm(false)}
                    className="flex-1 h-[43px] rounded-[60px] text-[16px] font-medium transition-all hover:bg-[#f4f5f7]"
                    style={{ color: '#676767', border: '1px solid #e5e7eb' }}
                  >
                    ביטול
                  </button>
                  <button
                    onClick={() => {
                      setShowNewChatConfirm(false);
                      handleNewChat();
                    }}
                    className="flex-1 h-[43px] rounded-[60px] text-[16px] font-medium text-white transition-all hover:opacity-90"
                    style={{ backgroundColor: '#0c1013' }}
                  >
                    כן, התחל חדש
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
              initialBrand={supportBrand}
              onClose={() => { setShowSupportModal(false); setSupportBrand(''); }}
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

