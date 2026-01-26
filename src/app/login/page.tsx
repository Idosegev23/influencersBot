'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, LogIn, AlertCircle, Loader2, User } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      setError('נא למלא את כל השדות');
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const response = await fetch('/api/influencer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setError('משתמש לא נמצא');
        } else if (response.status === 401) {
          setError('סיסמה שגויה');
        } else {
          setError(data.error || 'שגיאה בהתחברות');
        }
        return;
      }

      // Success! Redirect
      const destination = redirectTo || `/influencer/${username.trim()}`;
      router.push(destination);
    } catch (error) {
      console.error('Login error:', error);
      setError('שגיאה בהתחברות. נסה שוב.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-blue-50" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Login Card */}
        <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              התחברות למערכת
            </h1>
            <p className="text-sm text-gray-600">
              InfluencerBot Management
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username Field */}
            <div>
              <label 
                htmlFor="username" 
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                שם משתמש
              </label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="הזן שם משתמש"
                  className="w-full pr-10 pl-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:bg-white"
                  disabled={isAuthenticating}
                  autoFocus
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                סיסמה
              </label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="הזן סיסמה"
                  className="w-full pr-10 pl-10 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:bg-white"
                  disabled={isAuthenticating}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors hover:bg-gray-100"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-gray-400" />
                  ) : (
                    <Eye className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200"
              >
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </motion.div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={isAuthenticating || !username.trim() || !password.trim()}
              className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-500 to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              {isAuthenticating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  מתחבר...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <LogIn className="w-5 h-5" />
                  התחבר
                </span>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              יש בעיה בהתחברות?{' '}
              <button
                onClick={() => {
                  alert('צור קשר עם התמיכה בכתובת support@influencerbot.com');
                }}
                className="text-purple-600 underline hover:text-purple-700 transition-colors"
              >
                צור קשר עם התמיכה
              </button>
            </p>
          </div>
        </div>

        {/* Quick Access Hint */}
        <div className="mt-6 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-gray-200">
          <p className="text-xs text-gray-600 text-center">
            💡 <strong>טיפ:</strong> משפיענים יכולים להיכנס גם דרך{' '}
            <code className="px-1.5 py-0.5 bg-gray-100 rounded text-purple-600">/influencer/[username]/login</code>
          </p>
        </div>
      </motion.div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
