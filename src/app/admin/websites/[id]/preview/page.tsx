'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, AlertTriangle, ExternalLink, Copy, Check } from 'lucide-react';

export default function WebsitePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    // Fetch website info
    fetch('/api/admin/websites')
      .then((res) => res.json())
      .then((data) => {
        const site = data.websites?.find((w: any) => w.id === accountId);
        if (site) {
          setWebsiteUrl(site.url);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [accountId]);

  const handleIframeError = () => {
    setIframeBlocked(true);
  };

  const handleIframeLoad = () => {
    // Check if iframe was blocked by trying to access it
    try {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        // Try to access - will throw if blocked by X-Frame-Options
        const _test = iframe.contentWindow.location.href;
      }
    } catch {
      setIframeBlocked(true);
    }
  };

  const handleCopyCode = () => {
    const snippet = `<script src="${window.location.origin}/widget.js" data-account-id="${accountId}"></script>`;
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

  return (
    <div className="h-screen flex flex-col admin-panel" dir="rtl">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-white transition-colors">
            <ArrowRight className="w-5 h-5" />
          </Link>
          <span className="text-sm text-gray-300">
            תצוגה מקדימה — {websiteUrl}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {codeCopied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {codeCopied ? 'הועתק!' : 'העתק קוד'}
          </button>
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              פתח באתר
            </a>
          )}
        </div>
      </div>

      {/* Main preview area */}
      <div className="flex-1 relative">
        {iframeBlocked ? (
          /* Fallback when iframe is blocked */
          <div className="flex items-center justify-center h-full">
            <div className="admin-card p-8 max-w-md text-center">
              <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">האתר חוסם תצוגה מוטמעת</h3>
              <p className="text-gray-400 mb-4">
                האתר {websiteUrl} חוסם הצגה בתוך iframe. אפשר לפתוח אותו בטאב חדש ולראות שהווידג'ט עובד.
              </p>
              <div className="flex gap-3">
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
                >
                  <ExternalLink className="w-4 h-4" />
                  פתח את האתר
                </a>
                <button
                  onClick={handleCopyCode}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                >
                  <Copy className="w-4 h-4" />
                  העתק קוד
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* The actual website in an iframe */}
            {websiteUrl && (
              <iframe
                ref={iframeRef}
                src={websiteUrl}
                className="w-full h-full border-0"
                onError={handleIframeError}
                onLoad={handleIframeLoad}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                title="Website Preview"
              />
            )}

            {/* Widget overlay - positioned on top of the iframe */}
            <div className="absolute bottom-6 left-6 z-50">
              <WidgetPreview accountId={accountId} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Mini widget preview - simulates the chat widget bubble + expandable chat
 */
function WidgetPreview({ accountId }: { accountId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'שלום! איך אפשר לעזור?' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
              // Skip malformed lines
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 flex items-center justify-center transition-all hover:scale-105"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="w-80 h-96 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white">
        <span className="font-medium text-sm">צ'אט עם האתר</span>
        <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white">
          &times;
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-100 text-gray-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {msg.content || (isLoading ? '...' : '')}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="שאלו משהו..."
          className="flex-1 px-3 py-2 text-sm border rounded-lg text-gray-800 focus:outline-none focus:border-indigo-400"
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-50"
        >
          שלח
        </button>
      </div>
    </div>
  );
}
