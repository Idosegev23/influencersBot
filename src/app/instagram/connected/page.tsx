'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CheckCircle, Instagram } from 'lucide-react';

function ConnectedContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('username') || '';
  const error = searchParams.get('error');

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f4f5f7' }}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
            <Instagram className="w-8 h-8" style={{ color: '#ef4444' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ color: '#1c1c1e' }}>שגיאה בהתחברות</h1>
          <p className="text-sm mb-6" style={{ color: '#888' }}>{decodeURIComponent(error)}</p>
          <p className="text-sm" style={{ color: '#aaa' }}>נסו שוב או פנו למנהל המערכת.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f4f5f7' }}>
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'linear-gradient(135deg, rgba(225, 48, 108, 0.1), rgba(131, 58, 180, 0.1))' }}>
          <CheckCircle className="w-10 h-10" style={{ color: '#10b981' }} />
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: '#1c1c1e' }}>ההתחברות הצליחה!</h1>
        {username && (
          <p className="text-lg mb-2" style={{ color: '#333' }}>
            <Instagram className="w-5 h-5 inline-block ml-1" style={{ color: '#E1306C' }} />
            @{username}
          </p>
        )}
        <p className="text-sm mb-8" style={{ color: '#888' }}>
          חשבון האינסטגרם שלך חובר בהצלחה למערכת.
          <br />אפשר לסגור את העמוד הזה.
        </p>
        <div className="w-12 h-1 rounded-full mx-auto" style={{ background: 'linear-gradient(90deg, #E1306C, #833AB4)' }} />
      </div>
    </div>
  );
}

export default function InstagramConnectedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f5f7' }}>
        <div className="w-8 h-8 border-2 border-[#E1306C] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ConnectedContent />
    </Suspense>
  );
}
