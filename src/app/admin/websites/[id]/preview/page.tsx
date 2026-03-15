'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Copy, Check } from 'lucide-react';

interface WidgetConfig {
  theme: { primaryColor: string };
  brandName: string;
  profilePic: string | null;
  welcomeMessage: string;
  domain: string;
}

export default function WebsitePreviewPage() {
  const params = useParams();
  const accountId = params.id as string;

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Fetch widget config for theme/avatar
        const configRes = await fetch(`/api/widget/config?accountId=${accountId}`);
        const configData = await configRes.json();
        if (!configData.error) setConfig(configData);

        // Fetch website URL from admin API
        const sitesRes = await fetch('/api/admin/websites');
        const sitesData = await sitesRes.json();
        const site = sitesData.websites?.find((w: any) => w.id === accountId);
        if (site) setWebsiteUrl(site.url);
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

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-[#a094e0] border-t-transparent rounded-full animate-spin" />
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
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-2 z-20"
        style={{ background: 'rgba(7, 7, 13, 0.88)', backdropFilter: 'blur(20px) saturate(1.4)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
      >
        <div className="flex items-center gap-3">
          <Link href="/admin/dashboard" className="btn-ghost px-2 py-1">
            <ArrowRight className="w-5 h-5" />
          </Link>
          <span className="text-sm truncate max-w-xs" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
            תצוגה מקדימה — {config?.brandName || websiteUrl}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyCode}
            className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm"
          >
            {codeCopied ? <Check className="w-3.5 h-3.5" style={{ color: '#5eead4' }} /> : <Copy className="w-3.5 h-3.5" />}
            {codeCopied ? 'הועתק!' : 'העתק קוד'}
          </button>
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm"
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

        {/* Widget floating in corner — pinned to bottom-right, flex-col to keep within bounds */}
        <div className="absolute bottom-0 right-0 z-50 flex flex-col items-end justify-end p-6" style={{ maxHeight: '100%' }}>
          {config ? (
            <WidgetPreview accountId={accountId} config={config} />
          ) : (
            <div style={{
              width: 60, height: 60, borderRadius: '50%', overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)', cursor: 'pointer',
            }}>
              <iframe src="/blob-animation.html" style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} title="Bot" />
            </div>
          )}
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
@keyframes wp-slide-up {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes wp-msg-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes wp-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-5px); }
}
`;

// ============================================
// Widget Preview — matches Figma spec 68:448 exactly
// ============================================

function WidgetPreview({ accountId, config }: { accountId: string; config: WidgetConfig }) {
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
    if (!document.getElementById('wp-styles')) {
      const style = document.createElement('style');
      style.id = 'wp-styles';
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

  // Avatar helper — always show blob animation
  const Avatar = ({ size }: { size: number }) => (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', overflow: 'hidden' }}>
      <iframe src="/blob-animation.html" style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} title="Bot" />
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
          animation: 'wp-slide-up 0.35s ease-out',
          borderRadius: '50%', overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        }}
      >
        <Avatar size={60} />
      </div>
    );
  }

  // ---- Open state: Figma panel 432x724, rounded-18, bg #f4f5f7 ----
  return (
    <div style={{ fontFamily: '"Heebo", system-ui, sans-serif', direction: 'rtl' }}>
      {/* Main panel */}
      <div
        style={{
          width: 370, height: 'min(520px, calc(100vh - 200px))', borderRadius: 18,
          background: '#f4f5f7', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          animation: 'wp-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 23, lineHeight: 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.brandName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: 16, whiteSpace: 'nowrap' }}>זמין</span>
            </div>
          </div>
        </div>

        {/* Messages area (padding matches header 16px) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const isLast = i === messages.length - 1;
            const isEmpty = !msg.content && isLoading && isLast;

            // Typing indicator
            if (isEmpty) {
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, animation: 'wp-msg-in 0.3s ease-out' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: '85%' }}>
                    <Avatar size={20} />
                    <div style={{ padding: '9px 12px', borderRadius: 30, fontSize: 16, background: '#fff', color: '#000', display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#676767', animation: 'wp-bounce 1.2s ease-in-out infinite' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#676767', animation: 'wp-bounce 1.2s ease-in-out 0.15s infinite' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#676767', animation: 'wp-bounce 1.2s ease-in-out 0.3s infinite' }} />
                    </div>
                  </div>
                </div>
              );
            }

            // User bubble — primaryColor bg, white text, rounded-30
            if (isUser) {
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12, animation: 'wp-msg-in 0.3s ease-out' }}>
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
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, animation: 'wp-msg-in 0.3s ease-out' }}>
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

        {/* Input area — centered, same 16px side padding as header */}
        <div style={{ padding: '8px 16px 14px', flexShrink: 0 }}>
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
