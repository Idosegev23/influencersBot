/**
 * Public Chat Page - מסך צ'אט מלא עם sidebar
 * URL: /chat/[username]
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { initSession } from '@/lib/chatbot/session-manager';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, User, TrendingUp, MessageCircle, X } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

interface PageProps {
  params: {
    username: string;
  };
}

export default function PublicChatPage({ params }: PageProps) {
  const username = params.username;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [personaData, setPersonaData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize session and load data
  useEffect(() => {
    const init = async () => {
      try {
        // Get or create session
        const sid = await initSession(username);
        setSessionId(sid);

        // Load greeting and persona
        const res = await fetch(`/api/chat/init?username=${username}`);
        if (res.ok) {
          const data = await res.json();
          setPersonaData(data);
          
          if (data.greeting) {
            setMessages([{
              id: 'greeting',
              role: 'bot',
              text: data.greeting,
              timestamp: new Date(),
            }]);
          }
        }

        // Load stats
        const statsRes = await fetch(`/api/chat/stats?username=${username}`);
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };

    init();
  }, [username]);

  // Scroll to bottom
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
        text: 'מצטערת, הייתה בעיה. אנא נסי שוב.',
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

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-indigo-900 flex" dir="rtl">
      {/* Sidebar - Influencer Info */}
      <div className="w-80 bg-gray-900/80 backdrop-blur-xl border-l border-gray-700 p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Profile */}
        <div className="text-center pb-6 border-b border-gray-700">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 mx-auto mb-4 flex items-center justify-center text-3xl">
            {personaData?.displayName?.[0] || username[0]}
          </div>
          <h2 className="text-xl font-bold text-white mb-1">
            @{username}
          </h2>
          <p className="text-sm text-gray-400">
            {personaData?.displayName || 'משפיענ/ית'}
          </p>
        </div>

        {/* Quick Stats */}
        {stats && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              סטטיסטיקות
            </h3>
            
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400 text-sm">שיחות</span>
                <MessageCircle className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-bold text-white">
                {stats.totalConversations || 0}
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400 text-sm">הודעות</span>
                <TrendingUp className="w-4 h-4 text-green-400" />
              </div>
              <div className="text-2xl font-bold text-white">
                {stats.totalMessages || 0}
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400 text-sm">שביעות רצון</span>
                <Sparkles className="w-4 h-4 text-yellow-400" />
              </div>
              <div className="text-2xl font-bold text-white">
                {stats.satisfactionRate ? `${Math.round(stats.satisfactionRate)}%` : '-'}
              </div>
            </div>
          </div>
        )}

        {/* Topics */}
        {personaData?.quickReplies && personaData.quickReplies.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              נושאים פופולריים
            </h3>
            <div className="flex flex-wrap gap-2">
              {personaData.quickReplies.map((topic: string, index: number) => (
                <button
                  key={index}
                  onClick={() => sendMessage(topic)}
                  className="text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 px-3 py-1.5 rounded-full border border-indigo-500/30 transition-colors"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-6 border-t border-gray-700">
          <p className="text-xs text-gray-500 text-center">
            מופעל ע"י AI
            <br />
            לא מחליף ייעוץ מקצועי
          </p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-gray-800/50 backdrop-blur-xl border-b border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-6 h-6 text-indigo-400" />
              <div>
                <h1 className="text-xl font-bold text-white">
                  שיחה עם @{username}
                </h1>
                <p className="text-sm text-gray-400">
                  תשובות מיידיות מבוססות AI
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>פעיל</span>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-900/20">
          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div className="flex items-start gap-3 max-w-[70%]">
                  {message.role === 'bot' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <div className={`
                    rounded-2xl px-4 py-3 shadow-lg
                    ${message.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-100 border border-gray-700'
                    }
                  `}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.text}
                    </p>
                    <p className="text-xs opacity-60 mt-2">
                      {message.timestamp.toLocaleTimeString('he-IL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-gray-300" />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing Indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-end"
            >
              <div className="flex items-start gap-3 max-w-[70%]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-gray-800/80 backdrop-blur-xl border-t border-gray-700 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="הקלד/י הודעה..."
                  disabled={isLoading}
                  rows={1}
                  className="w-full px-4 py-3 bg-gray-900 border-2 border-gray-700 rounded-2xl focus:border-indigo-500 focus:outline-none transition-colors disabled:opacity-50 text-white placeholder-gray-500 resize-none"
                  dir="auto"
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
              </div>
              <button
                onClick={() => sendMessage(inputText)}
                disabled={isLoading || !inputText.trim()}
                className="w-12 h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
                aria-label="שלח"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-xs text-gray-500 mt-3 text-center">
              מופעל על ידי AI • לא לשימוש רפואי או ייעוץ מקצועי
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
