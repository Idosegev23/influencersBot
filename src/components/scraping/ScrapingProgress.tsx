/**
 * ScrapingProgress Component
 * מנהל את תהליך הסריקה של 7 השלבים באופן אוטומטי
 * כולל לוגים בזמן אמת וטיפול בשגיאות
 */

'use client';

import { useState, useEffect } from 'react';

// ============================================
// Type Definitions
// ============================================

interface StepInfo {
  step: number;
  name: string;
  nameHe: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  result?: any;
  error?: string;
}

interface ScrapingProgressProps {
  accountId: string;
  username: string;
  onComplete?: () => void;
}

// ============================================
// Constants
// ============================================

const STEP_DESCRIPTIONS = [
  { step: 1, nameEn: 'Instagram Posts', nameHe: 'סריקת פוסטים', description: '500 פוסטים אחרונים מ-Instagram' },
  { step: 2, nameEn: 'Comments', nameHe: 'סריקת תגובות', description: '150 פוסטים × 50 תגובות' },
  { step: 3, nameEn: 'Profile', nameHe: 'פרופיל', description: 'bio, followers, category' },
  { step: 4, nameEn: 'Hashtags', nameHe: 'האשטגים', description: '20 hashtags × 30 posts' },
  { step: 5, nameEn: 'Search', nameHe: 'חיפוש', description: 'מיקום בשוק' },
  { step: 6, nameEn: 'Preprocessing', nameHe: 'עיבוד מידע', description: 'ניתוח, clustering, timeline' },
  { step: 7, nameEn: 'Gemini Persona', nameHe: 'בניית פרסונה', description: 'Gemini Pro - קול, ידע, גבולות' },
];

// ============================================
// Main Component
// ============================================

export default function ScrapingProgress({ accountId, username, onComplete }: ScrapingProgressProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<StepInfo[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Initialize step statuses
  useEffect(() => {
    const initialStatuses: StepInfo[] = STEP_DESCRIPTIONS.map(desc => ({
      step: desc.step,
      name: desc.nameEn,
      nameHe: desc.nameHe,
      description: desc.description,
      status: 'pending',
    }));
    setStepStatuses(initialStatuses);
  }, []);

  // Add log message
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('he-IL');
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Start scraping process
  const startScraping = async () => {
    setIsRunning(true);
    setError(null);
    setLogs([]);
    addLog('🚀 מתחיל תהליך סריקה...');

    try {
      // Create job
      addLog('יוצר job חדש...');
      const startRes = await fetch('/api/scraping/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, username }),
      });

      if (!startRes.ok) {
        throw new Error('Failed to start scraping job');
      }

      const startData = await startRes.json();
      setJobId(startData.jobId);
      addLog(`✅ Job נוצר: ${startData.jobId}`);

      // Run all steps sequentially
      await runAllSteps(startData.jobId, startData.nextStep);

    } catch (err: any) {
      console.error('[ScrapingProgress] Error:', err);
      setError(`שגיאה בהתחלת הסריקה: ${err.message}`);
      addLog(`❌ שגיאה: ${err.message}`);
      setIsRunning(false);
    }
  };

  // Run all steps sequentially
  const runAllSteps = async (jobId: string, startFrom: number = 1) => {
    for (let step = startFrom; step <= 7; step++) {
      setCurrentStep(step);
      updateStepStatus(step, 'running');
      addLog(`⏳ מתחיל שלב ${step}/7: ${STEP_DESCRIPTIONS[step - 1].nameHe}...`);

      try {
        const stepRes = await fetch('/api/scraping/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, step }),
        });

        if (!stepRes.ok) {
          const errorData = await stepRes.json();
          throw new Error(errorData.error || 'Step failed');
        }

        const stepData = await stepRes.json();

        // Update UI
        updateStepStatus(step, 'completed', stepData.result);
        addLog(`✅ שלב ${step} הושלם (${stepData.duration}s)`);
        
        if (stepData.result) {
          addLog(`   📊 ${formatStepResult(step, stepData.result)}`);
        }

        // Check if all done
        if (stepData.completed) {
          setIsRunning(false);
          addLog('🎉 הפרסונה נבנתה בהצלחה! הצ\'אטבוט מוכן לשימוש.');
          
          if (onComplete) {
            onComplete();
          }
          break;
        }

      } catch (err: any) {
        console.error(`[ScrapingProgress] Step ${step} failed:`, err);
        updateStepStatus(step, 'failed', null, err.message);
        setError(`שלב ${step} נכשל: ${err.message}`);
        addLog(`❌ שלב ${step} נכשל: ${err.message}`);
        setIsRunning(false);
        return;
      }
    }
  };

  // Update step status in state
  const updateStepStatus = (
    step: number,
    status: 'pending' | 'running' | 'completed' | 'failed',
    result?: any,
    errorMessage?: string
  ) => {
    setStepStatuses(prev => {
      const updated = [...prev];
      const stepIndex = step - 1;
      
      if (updated[stepIndex]) {
        updated[stepIndex] = {
          ...updated[stepIndex],
          status,
          result,
          error: errorMessage,
        };
      }
      
      return updated;
    });
  };

  // Retry a failed step
  const retryStep = async (step: number) => {
    if (!jobId) return;

    setError(null);
    addLog(`🔄 מנסה שוב שלב ${step}...`);

    try {
      // Reset the step
      const retryRes = await fetch('/api/scraping/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, step }),
      });

      if (!retryRes.ok) {
        throw new Error('Failed to retry step');
      }

      addLog(`✅ שלב ${step} אופס, מתחיל מחדש...`);

      // Continue from this step
      setIsRunning(true);
      await runAllSteps(jobId, step);

    } catch (err: any) {
      console.error('[ScrapingProgress] Retry error:', err);
      setError(`שגיאה בניסיון חוזר: ${err.message}`);
      addLog(`❌ שגיאה בניסיון חוזר: ${err.message}`);
    }
  };

  // Format step result for display
  const formatStepResult = (step: number, result: any): string => {
    if (!result) return '';

    switch (step) {
      case 1:
        return `${result.postsCount} פוסטים נסרקו`;
      case 2:
        return `${result.commentsCount} תגובות, ${result.ownerReplies} תגובות של בעל החשבון`;
      case 3:
        return `${result.followers} עוקבים, ${result.posts} פוסטים`;
      case 4:
        return `${result.hashtagsTracked} hashtags נותחו`;
      case 5:
        return `${result.queriesExecuted} חיפושים בוצעו`;
      case 6:
        return `${result.topicsCount} נושאים, ${result.faqCandidatesCount} שאלות נפוצות`;
      case 7:
        return `${result.coreTopics} נושאי ליבה, טון: ${result.voiceTone}`;
      default:
        return JSON.stringify(result);
    }
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">בניית פרסונת צ'אטבוט</h2>
          <p className="text-gray-600">תהליך של 7 שלבים, כ-20-30 דקות</p>
        </div>

        {!isRunning && !jobId && (
          <button
            onClick={startScraping}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg"
          >
            🚀 התחל סריקה מלאה
          </button>
        )}
      </div>

      {isRunning && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-blue-800 font-medium">
              תהליך בעבודה... אנא המתן (עד 10 דקות לכל שלב)
            </span>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="space-y-3">
        {stepStatuses.map((stepInfo) => {
          const { step, nameHe, description, status, result, error } = stepInfo;

          return (
            <div
              key={step}
              className={`
                p-4 rounded-lg border-2 transition-all
                ${status === 'completed' ? 'border-green-500 bg-green-50' : ''}
                ${status === 'running' ? 'border-blue-500 bg-blue-50 animate-pulse' : ''}
                ${status === 'failed' ? 'border-red-500 bg-red-50' : ''}
                ${status === 'pending' ? 'border-gray-300 bg-gray-50' : ''}
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  {/* Status Icon */}
                  <div className="text-2xl">
                    {status === 'completed' && '✅'}
                    {status === 'running' && '⏳'}
                    {status === 'failed' && '❌'}
                    {status === 'pending' && '⏸️'}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">
                        {step}. {nameHe}
                      </h3>
                      {status === 'running' && (
                        <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                          רץ עכשיו
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{description}</p>

                    {/* Result */}
                    {status === 'completed' && result && (
                      <div className="mt-2 text-sm text-gray-700">
                        📊 {formatStepResult(step, result)}
                      </div>
                    )}

                    {/* Error */}
                    {status === 'failed' && error && (
                      <div className="mt-2 text-sm text-red-700">
                        ⚠️ {error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Retry Button */}
                {status === 'failed' && !isRunning && (
                  <button
                    onClick={() => retryStep(step)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    🔄 נסה שוב
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Alert */}
      {error && !isRunning && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-semibold text-red-800 mb-1">שגיאה בתהליך</h3>
              <p className="text-red-700">{error}</p>
              <p className="text-sm text-red-600 mt-2">
                לחץ על "נסה שוב" בשלב הרלוונטי כדי להמשיך
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {!isRunning && currentStep === 7 && !error && jobId && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <span className="text-3xl">🎉</span>
            <div className="flex-1">
              <h3 className="font-semibold text-green-800 text-xl mb-2">
                הפרסונה נבנתה בהצלחה!
              </h3>
              <p className="text-green-700 mb-3">
                הצ'אטבוט מוכן לשימוש. העוקבים שלך יכולים עכשיו לשוחח עם הפרסונה שלך.
              </p>
              <div className="flex gap-3">
                <a
                  href={`/chat/${username}`}
                  target="_blank"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  🔗 פתח צ'אט
                </a>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
                >
                  🔄 רענן דף
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Console */}
      <div className="bg-gray-900 text-gray-100 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-sm">
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
          <span className="font-semibold">📋 לוג תהליך</span>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            נקה
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="text-gray-500">אין הודעות עדיין...</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log, idx) => (
              <div key={idx} className="text-xs">
                {log}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {jobId && (
        <div className="bg-white rounded-lg border-2 border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">התקדמות כוללת</span>
            <span className="text-sm text-gray-600">
              {currentStep}/7 שלבים ({Math.round((currentStep / 7) * 100)}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="bg-gradient-to-r from-purple-600 to-blue-600 h-full transition-all duration-500"
              style={{ width: `${(currentStep / 7) * 100}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}
