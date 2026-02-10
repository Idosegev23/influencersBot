/**
 * ChatWidget - Widget צ'אט מודרני לעוקבים
 * Floating button + Chat window עם אנימציות
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { initSession, generateAnonymousSession } from '@/lib/chatbot/session-manager';
import ReactMarkdown from 'react-markdown';

// ============================================
// Type Definitions
// ============================================

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

interface ChatWidgetProps {
  username: string;
  initialOpen?: boolean;
  theme?: 'light' | 'dark';
  position?: 'bottom-right' | 'bottom-left';
}

// ============================================
// Main Component
// ============================================

export default function ChatWidget({
  username,
  initialOpen = false,
  theme = 'light',
  position = 'bottom-right',
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [greeting, setGreeting] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize session and load greeting
  useEffect(() => {
    const init = async () => {
      // Get or create session
      const sid = await initSession(username);
      setSessionId(sid);

      // Load greeting
      try {
        const res = await fetch(`/api/chat/init?username=${username}`);
        if (res.ok) {
          const data = await res.json();
          setGreeting(data.greeting || 'שלום! איך אפשר לעזור?');
          
          if (data.greeting) {
            setMessages([{
              id: 'greeting',
              role: 'bot',
              text: data.greeting,
              timestamp: new Date(),
            }]);
          }
        }
      } catch (error) {
        console.error('Failed to load greeting:', error);
        setGreeting('שלום! איך אפשר לעזור?');
      }
    };

    init();
  }, [username]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          sessionId,
          message: text.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      const data = await res.json();

      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        role: 'bot',
        text: data.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'bot',
        text: 'מצטערת, הייתה בעיה בשליחת ההודעה. אנא נסי שוב.',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  const positionClasses = position === 'bottom-right' 
    ? 'bottom-6 right-6' 
    : 'bottom-6 left-6';

  // ============================================
  // Render
  // ============================================

  return (
    <div className={`fixed ${positionClasses} z-50`}>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-2xl hover:shadow-3xl hover:scale-110 transition-all duration-300 flex items-center justify-center"
          aria-label="פתח צ'אט"
        >
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="w-[400px] h-[600px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slideUp">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                💬
              </div>
              <div>
                <h3 className="font-bold">@{username}</h3>
                <p className="text-xs opacity-90">בוט שירות</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="סגור"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`
                    max-w-[80%] rounded-2xl px-4 py-3 shadow-sm
                    ${message.role === 'user'
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                      : 'bg-white text-gray-800 border border-gray-200'
                    }
                  `}
                >
                  <div className={`text-sm prose prose-sm max-w-none ${message.role === 'user' ? 'prose-invert' : ''}`}>
                    <ReactMarkdown
                      components={{
                        // Style links
                        a: ({ node, ...props }) => (
                          <a
                            {...props}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`
                              font-semibold underline decoration-2 underline-offset-2
                              ${message.role === 'user' 
                                ? 'text-white hover:text-blue-100' 
                                : 'text-blue-600 hover:text-blue-800'
                              }
                              cursor-pointer transition-colors
                            `}
                            onClick={(e) => {
                              // Allow copy on right-click/long-press
                              if (e.button === 2) return;
                            }}
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
                          <code
                            {...props}
                            className={`
                              px-1.5 py-0.5 rounded text-xs font-mono
                              ${message.role === 'user'
                                ? 'bg-white/20'
                                : 'bg-gray-100'
                              }
                            `}
                          />
                        ),
                      }}
                    >
                      {message.text}
                    </ReactMarkdown>
                  </div>
                  <p className="text-xs opacity-70 mt-2">
                    {message.timestamp.toLocaleTimeString('he-IL', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-200">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="הקלד/י הודעה..."
                disabled={isLoading}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-full focus:border-purple-500 focus:outline-none transition-colors disabled:bg-gray-100"
                dir="auto"
              />
              <button
                onClick={() => sendMessage(inputText)}
                disabled={isLoading || !inputText.trim()}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="שלח"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              מופעל על ידי AI • לא לשימוש רפואי
            </p>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
