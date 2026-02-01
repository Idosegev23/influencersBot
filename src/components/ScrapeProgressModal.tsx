'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, X, Instagram } from 'lucide-react';

interface ScrapeProgress {
  username: string;
  status: 'starting' | 'scraping_posts' | 'scraping_reels' | 'analyzing' | 'saving' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  details?: {
    postsScraped?: number;
    reelsScraped?: number;
    brandsFound?: number;
    couponsFound?: number;
    productsFound?: number;
  };
  error?: string;
  startedAt: string;
  estimatedTimeRemaining?: number;
}

interface Props {
  username: string;
  isOpen: boolean;
  onComplete: (success: boolean) => void;
}

export default function ScrapeProgressModal({ username, isOpen, onComplete }: Props) {
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    let intervalId: NodeJS.Timeout;
    let elapsedIntervalId: NodeJS.Timeout;

    const fetchProgress = async () => {
      try {
        const res = await fetch(`/api/influencer/scrape-progress/${username}`);
        
        if (res.status === 404) {
          // No progress found yet - still initializing
          return;
        }
        
        if (!res.ok) {
          console.error('Failed to fetch progress');
          return;
        }

        const data = await res.json();
        setProgress(data.progress);

        // Check if completed or failed
        if (data.progress.status === 'completed') {
          clearInterval(intervalId);
          clearInterval(elapsedIntervalId);
          setTimeout(() => onComplete(true), 2000); // Wait 2 seconds before closing
        } else if (data.progress.status === 'failed') {
          clearInterval(intervalId);
          clearInterval(elapsedIntervalId);
          setTimeout(() => onComplete(false), 3000);
        }
      } catch (error) {
        console.error('Error fetching progress:', error);
      }
    };

    // Fetch immediately
    fetchProgress();

    // Poll every 2 seconds
    intervalId = setInterval(fetchProgress, 2000);

    // Update elapsed time every second
    elapsedIntervalId = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(intervalId);
      clearInterval(elapsedIntervalId);
    };
  }, [isOpen, username, onComplete]);

  if (!isOpen) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
            <Instagram className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              סורק פרופיל
            </h2>
            <p className="text-sm text-gray-500">@{username}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              {progress?.currentStep || 'מאתחל...'}
            </span>
            <span className="text-sm text-gray-500">
              {progress?.progress || 0}%
            </span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress?.status === 'completed'
                  ? 'bg-green-500'
                  : progress?.status === 'failed'
                  ? 'bg-red-500'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500'
              }`}
              style={{ width: `${progress?.progress || 0}%` }}
            >
              {progress?.status !== 'completed' && progress?.status !== 'failed' && (
                <div className="w-full h-full shimmer" />
              )}
            </div>
          </div>
        </div>

        {/* Status Icon */}
        <div className="flex justify-center mb-4">
          {progress?.status === 'completed' ? (
            <div className="p-3 bg-green-100 rounded-full animate-bounce">
              <Check className="w-8 h-8 text-green-600" />
            </div>
          ) : progress?.status === 'failed' ? (
            <div className="p-3 bg-red-100 rounded-full">
              <X className="w-8 h-8 text-red-600" />
            </div>
          ) : (
            <div className="p-3 bg-purple-100 rounded-full">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            </div>
          )}
        </div>

        {/* Details */}
        {progress?.details && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {progress.details.postsScraped !== undefined && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-900">
                  {progress.details.postsScraped}
                </div>
                <div className="text-xs text-gray-600">פוסטים</div>
              </div>
            )}
            {progress.details.reelsScraped !== undefined && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-900">
                  {progress.details.reelsScraped}
                </div>
                <div className="text-xs text-gray-600">ריילס</div>
              </div>
            )}
            {progress.details.brandsFound !== undefined && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-purple-600">
                  {progress.details.brandsFound}
                </div>
                <div className="text-xs text-gray-600">מותגים</div>
              </div>
            )}
            {progress.details.couponsFound !== undefined && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-pink-600">
                  {progress.details.couponsFound}
                </div>
                <div className="text-xs text-gray-600">קופונים</div>
              </div>
            )}
          </div>
        )}

        {/* Time Info */}
        <div className="flex justify-between text-sm text-gray-600 mb-4">
          <span>זמן שעבר: {formatTime(elapsed)}</span>
          {progress?.estimatedTimeRemaining !== undefined && progress.estimatedTimeRemaining > 0 && (
            <span>נותרו: ~{formatTime(progress.estimatedTimeRemaining)}</span>
          )}
        </div>

        {/* Error Message */}
        {progress?.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-800">{progress.error}</p>
          </div>
        )}

        {/* Success Message */}
        {progress?.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800 text-center font-medium">
              הסריקה הושלמה בהצלחה! ✨
            </p>
          </div>
        )}

        {/* Note */}
        {progress?.status !== 'completed' && progress?.status !== 'failed' && (
          <div className="text-xs text-gray-500 text-center">
            תהליך זה עשוי לקחת 1-2 דקות. אנא המתן...
          </div>
        )}
      </div>

      <style jsx>{`
        .shimmer {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.3) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  );
}
