'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Copy, Check, ExternalLink } from 'lucide-react';

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
// CSS Animations (matching widget.js keyframes)
// ============================================

const widgetStyles = `
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap');
@keyframes demo-slide-up {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes demo-msg-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes demo-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-5px); }
}
`;

// ============================================
// Demo Widget — matches Figma spec 68:448 exactly
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

  const pc = config.theme.primaryColor || '#0c1013';

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

  // Avatar helper — profile pic or blob animation fallback
  const Avatar = ({ size }: { size: number }) => (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', overflow: 'hidden' }}>
      {config.profilePic ? (
        <img src={config.profilePic} alt={config.brandName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <iframe src="/blob-animation.html" style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} title="Bot" />
      )}
    </div>
  );

  // ---- Closed state: avatar + brand name + status (Figma) ----
  if (!isOpen) {
    return (
      <div
        onClick={() => setIsOpen(true)}
        style={{
          width: 60, height: 60, cursor: 'pointer',
          fontFamily: '"Heebo", system-ui, sans-serif', direction: 'rtl',
          animation: 'demo-slide-up 0.35s ease-out',
          borderRadius: '50%', overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        }}
      >
        <Avatar size={60} />
      </div>
    );
  }

  // ---- Open state: Figma panel 432×724, rounded-18, bg #f4f5f7 ----
  return (
    <div style={{ fontFamily: '"Heebo", system-ui, sans-serif', direction: 'rtl' }}>
      {/* Main panel */}
      <div
        style={{
          width: 432, height: 'min(724px, calc(100vh - 120px))', borderRadius: 18,
          background: '#f4f5f7', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          animation: 'demo-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Header — 81px, primaryColor bg, rounded-top-18 */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 81,
            flexShrink: 0, background: pc, color: '#fff', borderRadius: '18px 18px 0 0',
          }}
        >
          <Avatar size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 23, lineHeight: 'normal' }}>{config.brandName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: 16 }}>זמין</span>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div
          style={{ flex: 1, overflowY: 'auto', padding: 16 }}
          className="[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300/30 [&::-webkit-scrollbar-thumb]:rounded"
        >
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const isLast = i === messages.length - 1;
            const isEmpty = !msg.content && isLoading && isLast;

            // Typing indicator
            if (isEmpty) {
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, animation: 'demo-msg-in 0.3s ease-out' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: '85%' }}>
                    <Avatar size={20} />
                    <div style={{ padding: '9px 12px', borderRadius: 30, fontSize: 16, background: '#fff', color: '#000', display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#676767', animation: 'demo-bounce 1.2s ease-in-out infinite' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#676767', animation: 'demo-bounce 1.2s ease-in-out 0.15s infinite' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#676767', animation: 'demo-bounce 1.2s ease-in-out 0.3s infinite' }} />
                    </div>
                  </div>
                </div>
              );
            }

            // User bubble — primaryColor bg, white text, rounded-30
            if (isUser) {
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12, animation: 'demo-msg-in 0.3s ease-out' }}>
                  <div
                    style={{
                      maxWidth: '82%', padding: '9px 12px', borderRadius: 30, fontSize: 16,
                      lineHeight: 1.5, background: pc, color: '#fff', wordBreak: 'break-word',
                    }}
                    dangerouslySetInnerHTML={{ __html: formatWidgetMessage(msg.content, true, pc) }}
                  />
                </div>
              );
            }

            // Bot bubble — white bg, black text, rounded-30, with 20px avatar
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, animation: 'demo-msg-in 0.3s ease-out' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: '85%' }}>
                  <Avatar size={20} />
                  <div
                    style={{
                      padding: '9px 12px', borderRadius: 30, fontSize: 16,
                      lineHeight: 1.5, background: '#fff', color: '#000', wordBreak: 'break-word',
                    }}
                    dangerouslySetInnerHTML={{ __html: formatWidgetMessage(msg.content, false, pc) }}
                  />
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area — white pill, rounded-18, 60px, shadow (Figma) */}
        <div style={{ padding: '8px 14px 14px', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 16, background: '#fff', borderRadius: 18,
              padding: '8px 8px 8px 10px', height: 60, boxShadow: '4px 6px 23px rgba(0,0,0,0.1)', overflow: 'hidden',
            }}
          >
            {/* Send button — 38px round, primaryColor, up-arrow */}
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              style={{
                width: 38, height: 38, background: pc, color: '#fff', border: 'none', borderRadius: 60,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'transform 0.2s, opacity 0.2s',
                opacity: isLoading ? 0.5 : 1, pointerEvents: isLoading ? 'none' : 'auto',
              }}
            >
              <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                <path d="M7 1L1 7M7 1L13 7M7 1V15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* Input field */}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="כתבו הודעה..."
              disabled={isLoading}
              autoFocus
              style={{
                flex: 1, border: 'none', outline: 'none', fontSize: 16, color: pc,
                background: 'transparent', direction: 'rtl', fontFamily: 'inherit', textAlign: 'right', minWidth: 0,
              }}
            />
          </div>
        </div>
      </div>

      {/* Close button below panel — 60px dark circle with chevron-down (Figma) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            width: 60, height: 60, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: pc, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 32px rgba(0,0,0,0.16), 0 1px 6px rgba(0,0,0,0.06)',
            transition: 'transform 0.2s',
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================
// Message Formatting (inline styles matching widget.js)
// ============================================

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatWidgetMessage(text: string, isUserMsg: boolean = false, primaryColor: string = '#0c1013'): string {
  if (!text) return '';
  const textColor = isUserMsg ? '#fff' : '#000';
  const linkColor = isUserMsg ? '#93c5fd' : primaryColor;
  const lines = text.split('\n');
  let html = '';
  let inUl = false;
  let inOl = false;

  function formatInline(t: string): string {
    let safe = escapeHtml(t);
    safe = safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
      '<div style="margin:8px 0;"><img src="$2" alt="$1" style="max-width:100%;max-height:180px;border-radius:10px;object-fit:cover;cursor:pointer;" onerror="this.style.display=\'none\'" onclick="window.open(\'$2\',\'_blank\')" /></div>');
    safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      `<a href="$2" target="_blank" rel="noopener" style="color:${linkColor};text-decoration:underline;text-underline-offset:2px;font-weight:500;">$1</a>`);
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:600;">$1</strong>');
    safe = safe.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:4px;font-size:0.9em;">$1</code>');
    return safe;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-•]\s+(.+)/) || (trimmed.match(/^\*\s+(.+)/) && !trimmed.match(/^\*\*[^*]/));
    const numMatch = trimmed.match(/^\d+[.)]\s+(.+)/);

    if (bulletMatch) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul style="margin:4px 0;padding-right:16px;list-style:none;">'; inUl = true; }
      html += `<li style="margin-bottom:3px;line-height:1.5;color:${textColor};position:relative;padding-right:12px;"><span style="position:absolute;right:0;">\u2022</span>${formatInline(bulletMatch[1] || trimmed.replace(/^[-•*]\s+/, ''))}</li>`;
    } else if (numMatch) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol style="margin:4px 0;padding-right:16px;list-style:decimal inside;">'; inOl = true; }
      html += `<li style="margin-bottom:3px;line-height:1.5;color:${textColor};">${formatInline(numMatch[1])}</li>`;
    } else {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (trimmed === '') {
        html += '<div style="height:6px;"></div>';
      } else {
        html += `<div style="margin-bottom:4px;line-height:1.5;">${formatInline(trimmed)}</div>`;
      }
    }
  }
  if (inUl) html += '</ul>';
  if (inOl) html += '</ol>';
  return html;
}
