'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Copy, Check, X, Send } from 'lucide-react';

export default function WebsitePreviewPage() {
  const params = useParams();
  const accountId = params.id as string;

  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    fetch('/api/admin/websites')
      .then((res) => res.json())
      .then((data) => {
        const site = data.websites?.find((w: any) => w.id === accountId);
        if (site) setWebsiteUrl(site.url);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [accountId]);

  const handleCopyCode = () => {
    const snippet = `<!-- InfluencerBot Widget -->\n<script src="${window.location.origin}/widget.js" data-account-id="${accountId}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Proxy URL — strips X-Frame-Options so we can always show the site
  const proxyUrl = websiteUrl
    ? `/api/admin/proxy?url=${encodeURIComponent(websiteUrl)}`
    : '';

  return (
    <div className="h-screen flex flex-col admin-panel" dir="rtl">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-gray-900/95 backdrop-blur border-b border-gray-800 z-20">
        <div className="flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-white transition-colors">
            <ArrowRight className="w-5 h-5" />
          </Link>
          <span className="text-sm text-gray-300 truncate max-w-xs">
            תצוגה מקדימה — {websiteUrl}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {codeCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {codeCopied ? 'הועתק!' : 'העתק קוד'}
          </button>
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              פתח באתר
            </a>
          )}
        </div>
      </div>

      {/* Main preview area — website background + widget on top */}
      <div className="flex-1 relative overflow-hidden">
        {/* Website via proxy iframe — always works */}
        {proxyUrl && (
          <iframe
            src={proxyUrl}
            className="w-full h-full border-0"
            title="Website Preview"
            sandbox="allow-same-origin"
          />
        )}

        {/* Widget floating in corner — same position as the real widget */}
        <div className="absolute bottom-6 right-6 z-50">
          <WidgetPreview accountId={accountId} />
        </div>
      </div>
    </div>
  );
}

// ============================================
// CSS Animations — injected via style tag
// ============================================

const widgetStyles = `
@keyframes widget-slide-up {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes widget-fade-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes widget-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-5px); }
}
@keyframes widget-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
  50% { box-shadow: 0 0 0 8px rgba(99,102,241,0); }
}
`;

/**
 * Widget Preview v2.0 — matches the real widget.js design
 * Glassmorphism, animations, gradient header, AI avatar, typing indicator
 */
function WidgetPreview({ accountId }: { accountId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'שלום! איך אפשר לעזור? ✨' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Inject animations style
  useEffect(() => {
    if (!document.getElementById('widget-preview-styles')) {
      const style = document.createElement('style');
      style.id = 'widget-preview-styles';
      style.textContent = widgetStyles;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: userMessage }, { role: 'assistant', content: '' }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, accountId, sessionId }),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(Boolean);

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'delta') {
                fullText += event.text;
                const displayText = fullText.replace(/<<SUGGESTIONS>>[\s\S]*/g, '').trim();
                setMessages((m) => {
                  const updated = [...m];
                  updated[updated.length - 1] = { role: 'assistant', content: displayText };
                  return updated;
                });
              } else if (event.type === 'done' && event.sessionId) {
                setSessionId(event.sessionId);
              }
            } catch {
              // Skip malformed
            }
          }
        }

        // Final strip of SUGGESTIONS
        setMessages((m) => {
          const updated = [...m];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            last.content = fullText.replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
          }
          return updated;
        });
      } else {
        setMessages((m) => {
          const updated = [...m];
          updated[updated.length - 1] = { role: 'assistant', content: 'מצטער, לא הצלחתי לעבד את הבקשה.' };
          return updated;
        });
      }
    } catch {
      setMessages((m) => {
        const updated = [...m];
        updated[updated.length - 1] = { role: 'assistant', content: 'שגיאה בחיבור. נסו שוב.' };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Closed: toggle button with pulse animation ----
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-[62px] h-[62px] rounded-full overflow-hidden border-none cursor-pointer p-0 transition-all duration-300 hover:scale-110"
        style={{
          boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
          animation: 'widget-pulse 2.5s infinite',
        }}
        title="פתח צ'אט"
      >
        <img src="/widget-icon.png" alt="Chat" className="w-full h-full rounded-full object-cover" />
      </button>
    );
  }

  // ---- Open: chat panel with glassmorphism ----
  return (
    <div
      className="flex flex-col overflow-hidden"
      dir="rtl"
      style={{
        width: '370px',
        height: '520px',
        borderRadius: '20px',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
        border: '1px solid #e5e7eb',
        animation: 'widget-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {/* Gradient Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3.5 text-white shrink-0 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)' }}
      >
        {/* Decorative glows */}
        <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-3 w-16 h-16 rounded-full bg-white/[0.07]" />
        {/* AI Icon */}
        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30 shrink-0 relative z-10">
          <img src="/widget-icon.png" alt="" className="w-full h-full object-cover" />
        </div>
        {/* Title */}
        <div className="flex-1 relative z-10">
          <div className="font-bold text-[15px] tracking-tight">העוזר החכם</div>
          <div className="text-[11px] opacity-85 mt-0.5">מקוון עכשיו</div>
        </div>
        {/* Close */}
        <button
          onClick={() => setIsOpen(false)}
          className="w-[30px] h-[30px] rounded-full bg-white/15 hover:bg-white/25 border-none text-white cursor-pointer flex items-center justify-center transition-colors relative z-10"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-gray-300/30">
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          const isLast = i === messages.length - 1;
          const isEmpty = !msg.content && isLoading && isLast;

          // Typing indicator
          if (isEmpty) {
            return (
              <div key={i} className="flex justify-end" style={{ animation: 'widget-fade-in 0.3s ease-out' }}>
                <div className="flex items-end gap-1.5 max-w-[85%]">
                  <div className="w-[26px] h-[26px] rounded-full overflow-hidden shrink-0">
                    <img src="/widget-icon.png" className="w-full h-full object-cover" alt="" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-br-sm bg-gray-100 flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" style={{ animation: 'widget-bounce 1.2s ease-in-out infinite' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" style={{ animation: 'widget-bounce 1.2s ease-in-out 0.15s infinite' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" style={{ animation: 'widget-bounce 1.2s ease-in-out 0.3s infinite' }} />
                  </div>
                </div>
              </div>
            );
          }

          if (isUser) {
            return (
              <div key={i} className="flex justify-start" style={{ animation: 'widget-fade-in 0.3s ease-out' }}>
                <div
                  className="max-w-[82%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed text-white"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #6366f1dd)',
                    boxShadow: '0 2px 8px rgba(99,102,241,0.2)',
                  }}
                >
                  <span dangerouslySetInnerHTML={{ __html: formatWidgetMessage(msg.content) }} />
                </div>
              </div>
            );
          }

          // Assistant message with avatar
          return (
            <div key={i} className="flex justify-end" style={{ animation: 'widget-fade-in 0.3s ease-out' }}>
              <div className="flex items-end gap-1.5 max-w-[85%]">
                <div className="w-[26px] h-[26px] rounded-full overflow-hidden shrink-0">
                  <img src="/widget-icon.png" className="w-full h-full object-cover" alt="" />
                </div>
                <div
                  className="px-3.5 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed text-gray-800"
                  style={{
                    background: '#f3f4f6',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}
                >
                  <span dangerouslySetInnerHTML={{ __html: formatWidgetMessage(msg.content) }} />
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200/80 bg-gray-50/80 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="כתבו הודעה..."
          className="flex-1 px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
          disabled={isLoading}
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-white border-none cursor-pointer transition-all hover:scale-105 disabled:opacity-40 disabled:pointer-events-none shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366f1, #6366f1cc)' }}
        >
          <Send className="w-[18px] h-[18px] rotate-180" />
        </button>
      </div>

      {/* Powered by */}
      <div className="text-center py-1.5 text-[10px] text-gray-400 shrink-0">
        Powered by InfluencerBot
      </div>
    </div>
  );
}

// ============================================
// Message Formatting (matches widget.js v2.0)
// ============================================

function formatInline(text: string): string {
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Markdown images
  safe = safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
    '<div class="my-2"><img src="$2" alt="$1" class="max-w-full max-h-44 rounded-xl object-cover cursor-pointer shadow-sm" onerror="this.style.display=\'none\'" onclick="window.open(\'$2\',\'_blank\')" /></div>');
  // Markdown links
  safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="text-indigo-600 font-medium" style="border-bottom:1px solid rgba(99,102,241,0.25);">$1</a>');
  // Bold
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
  // Inline code
  safe = safe.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-xs font-mono">$1</code>');
  return safe;
}

function formatWidgetMessage(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inUl = false;
  let inOl = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-•]\s+(.+)/) || (trimmed.match(/^\*\s+(.+)/) && !trimmed.match(/^\*\*[^*]/));
    const numMatch = trimmed.match(/^\d+[.)]\s+(.+)/);

    if (bulletMatch) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul class="my-1 space-y-0.5 list-none pr-3">'; inUl = true; }
      html += `<li class="leading-relaxed relative pr-3"><span class="absolute right-0 text-indigo-500">•</span>${formatInline(bulletMatch[1] || trimmed.replace(/^[-•*]\s+/, ''))}</li>`;
    } else if (numMatch) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol class="list-decimal list-inside my-1 space-y-0.5">'; inOl = true; }
      html += `<li class="leading-relaxed">${formatInline(numMatch[1])}</li>`;
    } else {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (trimmed === '') {
        html += '<div class="h-1.5"></div>';
      } else {
        html += `<div class="mb-1 leading-relaxed">${formatInline(trimmed)}</div>`;
      }
    }
  }
  if (inUl) html += '</ul>';
  if (inOl) html += '</ol>';
  return html;
}
