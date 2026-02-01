'use client';

import { useState, useEffect, useRef } from 'react';

type Message = {
  id: string;
  sender_type: 'influencer' | 'brand' | 'agent' | 'system';
  sender_name: string;
  message_text: string;
  attachments?: any[];
  created_at: string;
  is_read: boolean;
};

type Communication = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  brand_name: string;
  brand_contact_name?: string;
  brand_contact_email?: string;
  created_at: string;
};

type CommunicationThreadProps = {
  communicationId: string;
  username?: string;
  onUpdate?: () => void;
};

export default function CommunicationThread({ communicationId, username, onUpdate }: CommunicationThreadProps) {
  const [communication, setCommunication] = useState<Communication | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Message composer
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCommunication();
  }, [communicationId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchCommunication = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/influencer/communications/${communicationId}`);
      if (!res.ok) throw new Error('Failed to fetch communication');

      const data = await res.json();
      setCommunication(data.communication);
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error('Error fetching communication:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const res = await fetch(`/api/influencer/communications/${communicationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_text: newMessage }),
      });

      if (!res.ok) throw new Error('Failed to send message');

      const data = await res.json();
      setMessages([...messages, data.message]);
      setNewMessage('');
      
      // Notify parent component to refresh if callback provided
      if (onUpdate) {
        onUpdate();
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      alert('שגיאה בשליחת הודעה: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('he-IL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSenderColor = (senderType: string) => {
    switch (senderType) {
      case 'influencer': return 'bg-blue-100 border-blue-300';
      case 'brand': return 'bg-gray-100 border-gray-300';
      case 'agent': return 'bg-purple-100 border-purple-300';
      case 'system': return 'bg-yellow-50 border-yellow-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">טוען שיחה...</p>
        </div>
      </div>
    );
  }

  if (error || !communication) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">שגיאה בטעינת שיחה: {error}</p>
        <button
          onClick={fetchCommunication}
          className="mt-2 text-red-600 hover:text-red-800 underline"
        >
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-2">{communication.subject}</h2>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{communication.brand_name}</span>
          {communication.brand_contact_name && (
            <>
              <span>•</span>
              <span>{communication.brand_contact_name}</span>
            </>
          )}
          {communication.brand_contact_email && (
            <>
              <span>•</span>
              <a href={`mailto:${communication.brand_contact_email}`} className="text-blue-600 hover:underline">
                {communication.brand_contact_email}
              </a>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender_type === 'influencer' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-2xl rounded-lg border p-4 ${getSenderColor(msg.sender_type)}`}
            >
              {/* Sender info */}
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-sm">{msg.sender_name}</span>
                <span className="text-xs text-gray-500">{formatDate(msg.created_at)}</span>
              </div>

              {/* Message text */}
              <div className="text-gray-800 whitespace-pre-wrap">{msg.message_text}</div>

              {/* Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-3 space-y-1">
                  {msg.attachments.map((att: any, idx: number) => (
                    <a
                      key={idx}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                      </svg>
                      {att.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="כתוב הודעה... (Enter לשלוח, Shift+Enter לשורה חדשה)"
            rows={3}
            disabled={sending}
            className="flex-1 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-100"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors self-end"
          >
            {sending ? 'שולח...' : 'שלח'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          💡 טיפ: לחץ Enter לשלוח, Shift+Enter לשורה חדשה
        </p>
      </div>
    </div>
  );
}
