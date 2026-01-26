'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';

export default function InfluencerLoginPage({ 
  params 
}: { 
  params: Promise<{ username: string }> 
}) {
  const { username } = use(params);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('[Login] Attempting login for:', username);
      
      const res = await fetch('/api/influencer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          password 
        }),
      });

      const data = await res.json();
      console.log('[Login] Response status:', res.status);
      console.log('[Login] Response data:', data);

      if (res.ok) {
        console.log('[Login] Success! Redirecting to dashboard');
        router.push(`/influencer/${username}/dashboard`);
      } else {
        console.error('[Login] Failed:', data.error);
        setError(data.error || 'שגיאה בהתחברות');
      }
    } catch (err) {
      console.error('[Login] Exception:', err);
      setError('שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style jsx>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f3f4f6;
          padding: 16px;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          background: white;
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        .avatar {
          width: 80px;
          height: 80px;
          border-radius: 16px;
          background: linear-gradient(135deg, #ec4899, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 32px;
          font-weight: bold;
          margin: 0 auto 16px;
        }
        h1 {
          font-size: 24px;
          font-weight: bold;
          color: #111827;
          text-align: center;
          margin: 0 0 8px;
        }
        .subtitle {
          font-size: 14px;
          color: #6b7280;
          text-align: center;
          margin-bottom: 24px;
        }
        label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 8px;
        }
        input {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid #d1d5db;
          font-size: 14px;
          margin-bottom: 16px;
          font-family: inherit;
          background: white;
          color: #111827;
        }
        input::placeholder {
          color: #9ca3af;
        }
        input:focus {
          outline: none;
          border-color: #ec4899;
          box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.1);
        }
        button {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          background: linear-gradient(135deg, #ec4899, #8b5cf6);
          color: white !important;
          font-size: 16px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          font-family: inherit;
        }
        button:hover:not(:disabled) {
          opacity: 0.9;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          padding: 12px;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 16px;
        }
        .footer {
          font-size: 12px;
          color: #9ca3af;
          text-align: center;
          margin-top: 16px;
        }
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #6b7280;
          font-size: 14px;
          margin-bottom: 24px;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          width: auto;
        }
        .back-btn:hover {
          color: #111827;
        }
      `}</style>

      <div className="login-container" dir="rtl">
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <button 
            className="back-btn"
            onClick={() => router.push(`/chat/${username}`)}
          >
            ← חזרה לצ'אט
          </button>

          <div className="login-card">
            <div className="avatar">
              {username.charAt(0).toUpperCase()}
            </div>
            
            <h1>כניסה לפאנל ניהול</h1>
            <div className="subtitle">@{username}</div>
            
            <form onSubmit={handleSubmit}>
              {error && <div className="error">{error}</div>}
              
              <label htmlFor="password">סיסמה</label>
              <input 
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="הזן את הסיסמה שלך"
                disabled={loading}
                autoFocus
              />
              
              <button type="submit" disabled={loading || !password}>
                {loading ? 'מתחבר...' : 'התחבר'}
              </button>
            </form>
            
            <div className="footer">
              יש בעיה? צור קשר עם התמיכה
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
