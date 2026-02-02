/**
 * Public Chat Page - עמוד צ'אט ציבורי לעוקבים
 * URL: /chat/[username]
 */

import ChatWidget from '@/components/chatbot/ChatWidget';

interface PageProps {
  params: {
    username: string;
  };
}

export default function PublicChatPage({ params }: PageProps) {
  const username = params.username;


  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            שיחה עם @{username}
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            שאל/י שאלות, קבל/י המלצות, וגלה/י קופונים בלעדיים
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💬</span>
              <span>תשובות מיידיות</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎁</span>
              <span>קופונים בלעדיים</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <span>מופעל ע"י AI</span>
            </div>
          </div>
        </div>

        {/* Chat Widget - always open on this page */}
        <div className="flex justify-center">
          <div className="w-full max-w-2xl">
            <ChatWidget 
              username={username} 
              initialOpen={true}
              position="bottom-right"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-sm text-gray-500">
        <p>מערכת צ'אטבוט מבוססת AI • לא מחליפה ייעוץ מקצועי</p>
      </footer>
    </div>
  );
}

// ============================================
// Metadata
// ============================================

export async function generateMetadata({ params }: PageProps) {
  return {
    title: `שיחה עם @${params.username}`,
    description: `שוחח/י עם הבוט של @${params.username}, קבל/י המלצות וקופונים בלעדיים`,
  };
}
