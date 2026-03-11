'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { X, Send, Copy, Check, ExternalLink } from 'lucide-react';

/**
 * Public Demo Page — shows client's website with widget overlay.
 * URL: /demo/<accountId>
 * No auth required. Sharable link for clients.
 */

interface WidgetConfig {
  theme: { primaryColor: string };
  brandName: string;
  profilePic: string | null;
  welcomeMessage: string;
  domain: string;
}

export default function DemoPage() {
  const params = useParams();
  const accountId = params.id as string;

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);
  const [canIframe, setCanIframe] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/widget/config?accountId=${accountId}`);
        const data = await res.json();
        if (data.error) { setLoading(false); return; }
        setConfig(data);

        // Check if the site allows iframing
        const domain = data.domain;
        if (domain) {
          const check = await fetch(`/api/demo/check-iframe?url=${encodeURIComponent(`https://${domain}`)}`);
          const checkData = await check.json();
          setCanIframe(checkData.frameable === true);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId]);

  const handleCopyCode = () => {
    const snippet = `<!-- InfluencerBot Widget -->\n<script src="${window.location.origin}/widget.js" data-account-id="${accountId}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  const handleCopyDemoLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-800 mb-2">הדמו לא נמצא</p>
          <p className="text-gray-500">הקישור אינו תקין או שהחשבון אינו פעיל</p>
        </div>
      </div>
    );
  }

  const websiteUrl = `https://${config.domain}`;
  const primaryColor = config.theme.primaryColor || '#6366f1';

  return (
    <div className="h-screen flex flex-col bg-gray-100" dir="rtl">
      {/* Top banner */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm z-20">
        <div className="flex items-center gap-3">
          {config.profilePic ? (
            <img src={config.profilePic} alt={config.brandName} className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: primaryColor }}
            >
              {config.brandName.charAt(0)}
            </div>
          )}
          <div>
            <span className="text-sm font-semibold text-gray-800">{config.brandName}</span>
            <span className="text-xs text-gray-400 mr-2">— דמו ווידג׳ט</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyDemoLink}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            {codeCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {codeCopied ? 'הועתק!' : 'העתק לינק'}
          </button>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition-colors"
            style={{ backgroundColor: primaryColor }}
          >
            <Copy className="w-3.5 h-3.5" />
            קוד הטמעה
          </button>
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            לאתר
          </a>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 relative overflow-hidden">
        {canIframe ? (
          /* Site allows iframing — show real website */
          <iframe
            src={websiteUrl}
            className="w-full h-full border-0"
            title={`${config.brandName} Website`}
          />
        ) : (
          /* Site blocks iframe — show branded mockup */
          <div
            className="w-full h-full flex flex-col items-center justify-center relative"
            style={{ background: `linear-gradient(135deg, ${primaryColor}08 0%, ${primaryColor}15 50%, ${primaryColor}08 100%)` }}
          >
            {/* Decorative elements */}
            <div className="absolute top-20 right-20 w-72 h-72 rounded-full opacity-[0.07]" style={{ backgroundColor: primaryColor }} />
            <div className="absolute bottom-32 left-16 w-48 h-48 rounded-full opacity-[0.05]" style={{ backgroundColor: primaryColor }} />

            {config.profilePic ? (
              <img src={config.profilePic} alt={config.brandName} className="w-20 h-20 rounded-2xl object-cover mb-6 shadow-lg" />
            ) : (
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-6 shadow-lg"
                style={{ backgroundColor: primaryColor }}
              >
                {config.brandName.charAt(0)}
              </div>
            )}
            <h1 className="text-3xl font-bold text-gray-800 mb-2">{config.brandName}</h1>
            <p className="text-gray-500 mb-4">{config.domain}</p>
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 text-sm text-white rounded-xl transition-all hover:opacity-90 shadow-md"
              style={{ backgroundColor: primaryColor }}
            >
              <ExternalLink className="w-4 h-4" />
              בקרו באתר
            </a>
            <p className="text-xs text-gray-400 mt-8 max-w-md text-center">
              הווידג׳ט החכם מופעל על האתר של {config.brandName}. לחצו על הכפתור בפינה כדי לנסות.
            </p>
          </div>
        )}

        {/* Widget overlay */}
        <div className="absolute bottom-6 right-6 z-50">
          <DemoWidget accountId={accountId} config={config} />
        </div>
      </div>
    </div>
  );
}

// ============================================
// CSS Animations
// ============================================

const widgetStyles = `
@keyframes demo-slide-up {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes demo-fade-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes demo-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-5px); }
}
@keyframes demo-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--pulse-color, rgba(99,102,241,0.4)); }
  50% { box-shadow: 0 0 0 8px var(--pulse-color-end, rgba(99,102,241,0)); }
}
`;

// ============================================
// Demo Widget — functional chat
// ============================================

function DemoWidget({ accountId, config }: { accountId: string; config: WidgetConfig }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: config.welcomeMessage },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const primaryColor = config.theme.primaryColor || '#6366f1';

  useEffect(() => {
    if (!document.getElementById('demo-widget-styles')) {
      const style = document.createElement('style');
      style.id = 'demo-widget-styles';
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

  // ---- Closed: toggle button ----
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-[71px] h-[71px] rounded-full overflow-hidden border-none cursor-pointer p-0 transition-all duration-300 hover:scale-110"
        style={{
          boxShadow: `0 4px 24px ${primaryColor}66`,
          animation: 'demo-pulse 2.5s infinite',
          ['--pulse-color' as any]: `${primaryColor}66`,
          ['--pulse-color-end' as any]: `${primaryColor}00`,
        }}
        title="פתח צ׳אט"
      >
        {config.profilePic ? (
          <img src={config.profilePic} alt={config.brandName} className="w-full h-full rounded-full object-cover" />
        ) : (
          <video autoPlay loop muted playsInline className="w-full h-full rounded-full object-cover">
            <source src="/bot-avatar.webm" type="video/webm" />
            <source src="/bot-avatar.mp4" type="video/mp4" />
          </video>
        )}
      </button>
    );
  }

  // ---- Open: chat panel ----
  return (
    <div
      className="flex flex-col overflow-hidden"
      dir="rtl"
      style={{
        width: '370px',
        height: '520px',
        borderRadius: '20px',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
        border: '1px solid #e5e7eb',
        animation: 'demo-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3.5 text-white shrink-0 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)` }}
      >
        <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-3 w-16 h-16 rounded-full bg-white/[0.07]" />
        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/30 shrink-0 relative z-10">
          {config.profilePic ? (
            <img src={config.profilePic} alt={config.brandName} className="w-full h-full object-cover" />
          ) : (
            <video autoPlay loop muted playsInline className="w-full h-full object-cover">
              <source src="/bot-avatar.webm" type="video/webm" />
              <source src="/bot-avatar.mp4" type="video/mp4" />
            </video>
          )}
        </div>
        <div className="flex-1 relative z-10">
          <div className="font-bold text-[15px] tracking-tight">{config.brandName}</div>
          <div className="text-[11px] opacity-85 mt-0.5">מקוון עכשיו</div>
        </div>
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

          if (isEmpty) {
            return (
              <div key={i} className="flex justify-end" style={{ animation: 'demo-fade-in 0.3s ease-out' }}>
                <div className="flex items-end gap-1.5 max-w-[85%]">
                  <div className="w-[30px] h-[30px] rounded-full overflow-hidden shrink-0">
                    {config.profilePic ? (
                      <img src={config.profilePic} alt={config.brandName} className="w-full h-full object-cover" />
                    ) : (
                      <video autoPlay loop muted playsInline className="w-full h-full object-cover">
                        <source src="/bot-avatar.webm" type="video/webm" />
                        <source src="/bot-avatar.mp4" type="video/mp4" />
                      </video>
                    )}
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-br-sm bg-gray-100 flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" style={{ animation: 'demo-bounce 1.2s ease-in-out infinite' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" style={{ animation: 'demo-bounce 1.2s ease-in-out 0.15s infinite' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" style={{ animation: 'demo-bounce 1.2s ease-in-out 0.3s infinite' }} />
                  </div>
                </div>
              </div>
            );
          }

          if (isUser) {
            return (
              <div key={i} className="flex justify-start" style={{ animation: 'demo-fade-in 0.3s ease-out' }}>
                <div
                  className="max-w-[82%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed text-white"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
                    boxShadow: `0 2px 8px ${primaryColor}33`,
                  }}
                >
                  <span dangerouslySetInnerHTML={{ __html: formatWidgetMessage(msg.content) }} />
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex justify-end" style={{ animation: 'demo-fade-in 0.3s ease-out' }}>
              <div className="flex items-end gap-1.5 max-w-[85%]">
                <div className="w-[30px] h-[30px] rounded-full overflow-hidden shrink-0">
                  {config.profilePic ? (
                    <img src={config.profilePic} alt={config.brandName} className="w-full h-full object-cover" />
                  ) : (
                    <video autoPlay loop muted playsInline className="w-full h-full object-cover">
                      <source src="/bot-avatar.webm" type="video/webm" />
                      <source src="/bot-avatar.mp4" type="video/mp4" />
                    </video>
                  )}
                </div>
                <div
                  className="px-3.5 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed text-gray-800"
                  style={{ background: '#f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                >
                  <span dangerouslySetInnerHTML={{ __html: formatWidgetMessage(msg.content) }} />
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
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
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
        >
          <Send className="w-[18px] h-[18px] rotate-180" />
        </button>
      </div>

      <div className="text-center py-1.5 text-[10px] text-gray-400 shrink-0">
        Powered by InfluencerBot
      </div>
    </div>
  );
}

// ============================================
// Message Formatting
// ============================================

function formatInline(text: string): string {
  let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  safe = safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
    '<div class="my-2"><img src="$2" alt="$1" class="max-w-full max-h-44 rounded-xl object-cover cursor-pointer shadow-sm" onerror="this.style.display=\'none\'" onclick="window.open(\'$2\',\'_blank\')" /></div>');
  safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="text-indigo-600 font-medium" style="border-bottom:1px solid rgba(99,102,241,0.25);">$1</a>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
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
      html += `<li class="leading-relaxed relative pr-3"><span class="absolute right-0 text-indigo-500">\u2022</span>${formatInline(bulletMatch[1] || trimmed.replace(/^[-•*]\s+/, ''))}</li>`;
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
