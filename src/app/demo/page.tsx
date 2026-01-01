'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Send,
  Sparkles,
  Package,
  MessageCircle,
  ChefHat,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Demo data
const demoInfluencer = {
  name: 'שרה קוק',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
  type: 'food',
  bio: 'יוצרת תוכן קולינרי, מתמחה במתכונים בריאים וטעימים',
};

const demoProducts = [
  { id: '1', name: 'סיר לחץ חשמלי', brand: 'InstaPot', code: 'SARAH20', discount: '20%' },
  { id: '2', name: 'שמן זית אורגני', brand: 'Terra', code: 'COOK15', discount: '15%' },
  { id: '3', name: 'סט סכינים מקצועי', brand: 'Wusthof', code: null, discount: null },
];

const demoResponses: Record<string, string> = {
  default: 'היי! אני העוזרת הוירטואלית של שרה. אני יכולה לעזור לך עם מתכונים, קופונים, וטיפים למטבח. מה תרצה לדעת?',
  coupon: 'יש לנו כמה קופונים מעולים!\n\n**InstaPot** - קוד SARAH20 לקבלת 20% הנחה על סיר לחץ חשמלי\n\n**Terra** - קוד COOK15 ל-15% הנחה על שמן זית אורגני\n\nפשוט הזינו את הקוד בקופה!',
  recipe: 'הנה מתכון מהיר לפסטה ברוטב עגבניות טריות:\n\n**מרכיבים:**\n- 400 גרם פסטה\n- 4 עגבניות בשלות\n- 3 שיני שום\n- בזיליקום טרי\n- שמן זית\n\n**הוראות:**\n1. בשלו את הפסטה לפי ההוראות\n2. קלו שום בשמן זית\n3. הוסיפו עגבניות קצוצות\n4. ערבבו עם הפסטה והבזיליקום\n\nבתיאבון!',
  help: 'אני כאן כדי לעזור! אני יכולה:\n\n- לתת לך **מתכונים** מהירים וטעימים\n- לשתף **קופונים** והנחות על מוצרים\n- לתת **טיפים** למטבח\n\nפשוט שאלי אותי מה שתרצי!',
};

export default function DemoPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'assistant', content: demoResponses.default },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getResponse = (message: string): string => {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('קופון') || lowerMessage.includes('הנחה') || lowerMessage.includes('קוד')) {
      return demoResponses.coupon;
    }
    if (lowerMessage.includes('מתכון') || lowerMessage.includes('אוכל') || lowerMessage.includes('מהיר')) {
      return demoResponses.recipe;
    }
    if (lowerMessage.includes('עזרה') || lowerMessage.includes('מה את')) {
      return demoResponses.help;
    }
    return 'תודה על השאלה! בגרסה המלאה הבוט יענה על כל שאלה בהתאם לתוכן של המשפיען. נסו לשאול על קופונים או מתכונים!';
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageContent = inputValue.trim();
    setInputValue('');
    setIsTyping(true);

    // Simulate typing delay
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: getResponse(messageContent),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsTyping(false);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const suggestedQuestions = [
    'מה הקופון הכי שווה?',
    'יש מתכון מהיר?',
    'מה את יכולה לעשות?',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-orange-100">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
            <span className="hidden sm:inline">חזרה</span>
          </Link>
          
          <div className="flex items-center gap-3">
            <img
              src={demoInfluencer.avatar}
              alt={demoInfluencer.name}
              className="w-10 h-10 rounded-xl object-cover"
            />
            <div>
              <h1 className="font-semibold text-gray-900 text-sm">
                העוזרת של {demoInfluencer.name.split(' ')[0]}
              </h1>
              <p className="text-xs text-orange-600">דמו אינטראקטיבי</p>
            </div>
          </div>

          <Link
            href="/admin/add"
            className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:from-orange-400 hover:to-amber-400 transition-all"
          >
            צור בוט משלך
          </Link>
        </div>
      </header>

      {/* Demo Banner */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center py-2 text-sm">
        <Sparkles className="w-4 h-4 inline-block mr-2" />
        זהו דמו אינטראקטיבי - הבוט האמיתי יתאים את עצמו לתוכן שלך!
      </div>

      <div className="max-w-4xl mx-auto flex flex-col lg:flex-row gap-6 p-4 lg:p-6">
        {/* Chat Section */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden min-h-[500px] lg:min-h-[600px]">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                      msg.role === 'user'
                        ? 'bg-orange-500 text-white rounded-tr-sm'
                        : 'bg-orange-50 text-gray-800 rounded-tl-sm border border-orange-100'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap">
                      {msg.content.split('\n').map((line, i) => (
                        <span key={i}>
                          {line.startsWith('**') && line.endsWith('**') ? (
                            <strong>{line.slice(2, -2)}</strong>
                          ) : line.startsWith('**') ? (
                            <>
                              <strong>{line.split('**')[1]}</strong>
                              {line.split('**')[2]}
                            </>
                          ) : (
                            line
                          )}
                          {i < msg.content.split('\n').length - 1 && <br />}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <div className="flex justify-end">
                <div className="bg-orange-50 border border-orange-100 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1">
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInputValue(q);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-2 text-sm bg-orange-50 text-orange-700 rounded-lg border border-orange-200 hover:bg-orange-100 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-orange-100">
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="שאלו אותי משהו..."
                className="flex-1 px-4 py-3 rounded-xl border border-orange-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 outline-none transition-all"
                disabled={isTyping}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isTyping}
                className="px-5 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-400 hover:to-amber-400 disabled:opacity-40 transition-all"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:w-80 space-y-4">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-orange-100 p-5 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <img
                src={demoInfluencer.avatar}
                alt={demoInfluencer.name}
                className="w-16 h-16 rounded-xl object-cover"
              />
              <div>
                <h2 className="font-bold text-gray-900">{demoInfluencer.name}</h2>
                <div className="flex items-center gap-1 text-sm text-orange-600">
                  <ChefHat className="w-4 h-4" />
                  יוצרת תוכן קולינרי
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600">{demoInfluencer.bio}</p>
          </div>

          {/* Products */}
          <div className="bg-white rounded-2xl border border-orange-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" />
              מוצרים וקופונים
            </h3>
            <div className="space-y-3">
              {demoProducts.map((product) => (
                <div
                  key={product.id}
                  className="p-3 bg-orange-50 rounded-xl border border-orange-100"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-orange-600 font-medium">{product.brand}</p>
                      <p className="text-sm font-medium text-gray-900">{product.name}</p>
                    </div>
                    {product.code && (
                      <button
                        onClick={() => handleCopyCode(product.code!)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                      >
                        {copiedCode === product.code ? (
                          <>
                            <Check className="w-3 h-3 text-green-500" />
                            הועתק
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            {product.code}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {product.discount && (
                    <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                      {product.discount} הנחה
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <Link
            href="/admin/add"
            className="block p-5 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl text-white text-center hover:from-orange-400 hover:to-amber-400 transition-all shadow-lg shadow-orange-500/25"
          >
            <Sparkles className="w-8 h-8 mx-auto mb-2" />
            <p className="font-bold mb-1">רוצה בוט כזה?</p>
            <p className="text-sm opacity-90">צור צ'אטבוט משלך עכשיו</p>
            <ExternalLink className="w-4 h-4 mx-auto mt-2 opacity-70" />
          </Link>
        </div>
      </div>
    </div>
  );
}






