'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Copy, Check, MessageCircle, X, Send } from 'lucide-react';

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

/**
 * Functional widget preview — mimics the real widget.js behavior
 */
function WidgetPreview({ accountId }: { accountId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'שלום! איך אפשר לעזור?' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, accountId }),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        setMessages((m) => [...m, { role: 'assistant', content: '' }]);

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
                setMessages((m) => {
                  const updated = [...m];
                  updated[updated.length - 1] = { role: 'assistant', content: fullText };
                  return updated;
                });
              }
            } catch {
              // Skip malformed
            }
          }
        }
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: 'מצטער, לא הצלחתי לעבד את הבקשה.' }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'שגיאה בחיבור. נסו שוב.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Bubble button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center transition-all hover:scale-110"
        title="פתח צ'אט"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  // Chat panel — side panel style, not fullscreen
  return (
    <div
      className="flex flex-col bg-white rounded-2xl overflow-hidden"
      dir="rtl"
      style={{
        width: '340px',
        height: '440px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
        <span className="font-semibold text-sm">צ'אט</span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-white/70 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-50 text-gray-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <span dangerouslySetInnerHTML={{ __html: formatWidgetMessage(msg.content || (isLoading && i === messages.length - 1 ? '...' : '')) }} />
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-gray-200 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="שאלו משהו..."
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          disabled={isLoading}
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Powered by */}
      <div className="text-center py-1 text-[10px] text-gray-400 shrink-0">
        Powered by InfluencerBot
      </div>
    </div>
  );
}

function formatWidgetMessage(text: string): string {
  if (!text) return '';
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Markdown links [text](url) → <a>
  safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="text-indigo-600 underline hover:text-indigo-500">$1</a>');
  // **bold** → <strong>
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Newlines → <br>
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}
