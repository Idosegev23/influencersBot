'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Zap, Instagram, User, Lock, Phone } from 'lucide-react';

type WizardStep = 'username' | 'scraping' | 'settings' | 'complete' | 'resume-choice';

interface WizardState {
  step: WizardStep;
  username: string;
  jobId: string | null;
  accountId: string | null;
  scrapingComplete: boolean;
  subdomain: string;
  password: string;
  phoneNumber: string;
  whatsappEnabled: boolean;
  error: string | null;
  isLoading: boolean;
  // For resume functionality
  existingAccount?: any;
  existingJob?: any;
}

export default function AddInfluencerPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [state, setState] = useState<WizardState>({
    step: 'username',
    username: '',
    jobId: null,
    accountId: null,
    scrapingComplete: false,
    subdomain: '',
    password: '',
    phoneNumber: '',
    whatsappEnabled: false,
    error: null,
    isLoading: false,
  });

  // Polling for scraping progress
  const [jobStatus, setJobStatus] = useState<any>(null);

  useEffect(() => {
    fetch('/api/admin')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push('/admin');
        } else {
          setCheckingAuth(false);
        }
      })
      .catch(() => router.push('/admin'));
  }, [router]);

  // Prevent accidental page close during scraping
  useEffect(() => {
    if (state.step !== 'scraping' || !state.jobId) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'תהליך הסריקה עדיין רץ. האם אתה בטוח שברצונך לעזוב?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [state.step, state.jobId]);

  // Poll job status when in scraping step
  useEffect(() => {
    if (state.step !== 'scraping' || !state.jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scraping/status?jobId=${state.jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);

          if (data.status === 'completed') {
            setState((prev) => ({
              ...prev,
              scrapingComplete: true,
              step: 'settings',
            }));
            clearInterval(interval);
          } else if (data.status === 'failed') {
            setState((prev) => ({
              ...prev,
              error: data.error || 'Scraping failed',
              step: 'username',
              isLoading: false,
            }));
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    }, 5000); // Poll every 5 seconds (reduced from 2s to avoid rate limiting)

    return () => clearInterval(interval);
  }, [state.step, state.jobId]);

  // Handle resume from existing account
  const handleResumeExisting = async () => {
    const { existingAccount, existingJob } = state;
    
    if (!existingAccount) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const hasActiveJob = existingJob && (existingJob.status === 'running' || existingJob.status === 'pending' || existingJob.status === 'failed');

      if (hasActiveJob) {
        // Resume from existing job
        const nextStep = existingJob.status === 'failed' 
          ? (existingJob.error_step || existingJob.current_step) // Retry failed step
          : existingJob.current_step + 1; // Continue from next step
        
        console.log(`[Resume] Continuing job ${existingJob.id} from step ${nextStep}`);
        
        setState((prev) => ({
          ...prev,
          accountId: existingAccount.id,
          jobId: existingJob.id,
          step: 'scraping',
          isLoading: false,
        }));
        
        // Resume from the appropriate step
        if (nextStep <= 7) {
          executeNextStep(existingJob.id, nextStep);
        }
      } else {
        // No active job - start new one with existing account
        console.log(`[Resume] Starting new job for existing account ${existingAccount.id}`);
        
        const scrapingRes = await fetch('/api/scraping/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: state.username,
            accountId: existingAccount.id,
          }),
        });

        if (!scrapingRes.ok) {
          const error = await scrapingRes.json();
          throw new Error(error.error || 'Failed to start scraping');
        }

        const { jobId } = await scrapingRes.json();

        setState((prev) => ({
          ...prev,
          accountId: existingAccount.id,
          jobId,
          step: 'scraping',
          isLoading: false,
        }));
        
        executeNextStep(jobId, 1);
      }
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        error: error.message,
        isLoading: false,
        step: 'username',
      }));
    }
  };

  // Handle delete and restart
  const handleDeleteAndRestart = async () => {
    const { existingAccount, existingJob } = state;
    
    if (!existingAccount) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const username = state.username;

      // Delete job if exists
      if (existingJob) {
        await fetch(`/api/scraping/cancel?jobId=${existingJob.id}`, { method: 'DELETE' });
      }
      
      // Delete account
      await fetch(`/api/admin/accounts/${existingAccount.id}`, { method: 'DELETE' });
      
      console.log(`[Delete] Deleted account and job, starting fresh...`);
      
      // Wait a bit for deletion to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Create new account
      const accountRes = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          type: 'influencer',
        }),
      });

      if (!accountRes.ok) {
        const error = await accountRes.json();
        throw new Error(error.error || 'Failed to create account');
      }

      const { accountId } = await accountRes.json();

      // Start scraping job
      const scrapingRes = await fetch('/api/scraping/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          accountId,
        }),
      });

      if (!scrapingRes.ok) {
        const error = await scrapingRes.json();
        throw new Error(error.error || 'Failed to start scraping');
      }

      const { jobId } = await scrapingRes.json();

      setState((prev) => ({
        ...prev,
        jobId,
        accountId,
        step: 'scraping',
        isLoading: false,
        existingAccount: undefined,
        existingJob: undefined,
      }));

      // Start executing steps automatically
      executeNextStep(jobId, 1);
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        error: error.message || 'שגיאה במחיקת החשבון',
        isLoading: false,
        step: 'username',
        existingAccount: undefined,
        existingJob: undefined,
      }));
    }
  };

  // Handle cancel scraping
  const handleCancelScraping = async () => {
    const confirmed = window.confirm(
      'האם אתה בטוח שברצונך לבטל את תהליך הסריקה?\n\n' +
      'פעולה זו תמחק את כל הנתונים שנאספו עד כה ולא ניתן יהיה לשחזר אותם.'
    );

    if (!confirmed) return;

    try {
      // Delete the job and all associated data
      if (state.jobId) {
        await fetch(`/api/scraping/cancel?jobId=${state.jobId}`, {
          method: 'DELETE',
        });
      }

      // Delete the account
      if (state.accountId) {
        await fetch(`/api/admin/accounts/${state.accountId}`, {
          method: 'DELETE',
        });
      }

      // Reset to initial state
      setState({
        step: 'username',
        username: '',
        jobId: null,
        accountId: null,
        scrapingComplete: false,
        subdomain: '',
        password: '',
        phoneNumber: '',
        whatsappEnabled: false,
        error: null,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error canceling scraping:', error);
      setState((prev) => ({
        ...prev,
        error: 'שגיאה בביטול הריצה',
      }));
    }
  };

  // Step 1: Handle username submission
  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const username = state.username.trim().replace('@', '');
    if (!username) {
      setState((prev) => ({ ...prev, error: 'נא להזין שם משתמש' }));
      return;
    }

    setState((prev) => ({ 
      ...prev, 
      isLoading: true, 
      error: null,
      subdomain: username.toLowerCase().replace(/[^a-z0-9]/g, ''),
    }));

    try {
      // Check if account already exists
      const checkRes = await fetch(`/api/admin/accounts/check?username=${username}`);
      
      if (checkRes.ok) {
        const { exists, account, job } = await checkRes.json();
        
        if (exists && account) {
          // Account exists - show resume choice screen
          setState((prev) => ({
            ...prev,
            step: 'resume-choice',
            existingAccount: account,
            existingJob: job,
            isLoading: false,
          }));
          return;
        }
      }
      
      // Account doesn't exist - create new one
      const accountRes = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          type: 'influencer',
        }),
      });

      if (!accountRes.ok) {
        const error = await accountRes.json();
        throw new Error(error.error || 'Failed to create account');
      }

      const { accountId } = await accountRes.json();

      // Start scraping job
      const scrapingRes = await fetch('/api/scraping/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          accountId,
        }),
      });

      if (!scrapingRes.ok) {
        const error = await scrapingRes.json();
        throw new Error(error.error || 'Failed to start scraping');
      }

      const { jobId } = await scrapingRes.json();

      setState((prev) => ({
        ...prev,
        jobId,
        accountId,
        step: 'scraping',
        isLoading: false,
      }));

      // Start executing steps automatically
      executeNextStep(jobId, 1);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'אירעה שגיאה',
        isLoading: false,
      }));
    }
  };

  // Execute scraping steps
  const executeNextStep = async (jobId: string, step: number) => {
    if (step > 7) return;

    try {
      const res = await fetch('/api/scraping/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, step }),
      });

      if (!res.ok) {
        console.error(`Step ${step} failed`);
        return;
      }

      const data = await res.json();
      
      if (data.nextStep && data.nextStep <= 7) {
        // Continue to next step
        setTimeout(() => executeNextStep(jobId, data.nextStep), 1000);
      }
    } catch (error) {
      console.error(`Error executing step ${step}:`, error);
    }
  };

  // Handle publish
  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!state.password || state.password.length < 6) {
      setState((prev) => ({ 
        ...prev, 
        error: 'סיסמה חייבת להכיל לפחות 6 תווים' 
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const res = await fetch('/api/admin/influencers/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: state.accountId,
          username: state.username,
          subdomain: state.subdomain,
          password: state.password,
          phoneNumber: state.phoneNumber || null,
          whatsappEnabled: state.whatsappEnabled,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to finalize');
      }

      setState((prev) => ({ ...prev, step: 'complete', isLoading: false }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'אירעה שגיאה',
        isLoading: false,
      }));
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderStepIndicator = () => {
    const steps = [
      { id: 'username', label: 'שם משתמש', icon: Instagram },
      { id: 'scraping', label: 'סריקה ובניית פרסונה', icon: Zap },
      { id: 'settings', label: 'הגדרות', icon: User },
      { id: 'complete', label: 'סיום', icon: Lock },
    ];

    const currentIndex = steps.findIndex(s => s.id === state.step);

    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;

          return (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  isActive
                    ? 'bg-indigo-500 text-white'
                    : isCompleted
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-800 text-gray-500'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-2 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-700'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen admin-panel" dir="rtl">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-900/20 via-gray-950 to-purple-900/20" />

      {/* Header */}
      <header className="relative z-10 px-6 py-4 border-b border-gray-800">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה לדשבורד
          </Link>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-500" />
            <span className="font-semibold text-white">הוספת משפיען חדש</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {renderStepIndicator()}

        {/* Error Display */}
        {state.error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center"
          >
            {state.error}
          </motion.div>
        )}

        {/* Step 1: Username Input */}
        {state.step === 'username' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8"
          >
            <div className="text-center mb-8">
              <Instagram className="w-16 h-16 text-indigo-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">
                הזן שם משתמש אינסטגרם
              </h2>
              <p className="text-gray-400">
                המערכת תסרוק את הפרופיל ותבנה פרסונה מלאה
              </p>
            </div>

            <form onSubmit={handleUsernameSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  שם משתמש
                </label>
                <div className="relative">
                  <Instagram className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    value={state.username}
                    onChange={(e) => setState(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="username"
                    className="w-full pr-12 pl-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={state.isLoading}
                  />
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  אפשר להזין עם או בלי @
                </p>
              </div>

              <button
                type="submit"
                disabled={state.isLoading || !state.username.trim()}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {state.isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    יוצר חשבון...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    התחל סריקה
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}

        {/* Resume Choice Screen */}
        {state.step === 'resume-choice' && state.existingAccount && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8"
          >
            <div className="text-center mb-8">
              <Instagram className="w-16 h-16 text-indigo-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">
                חשבון קיים נמצא
              </h2>
              <p className="text-gray-400">
                @{state.username} כבר קיים במערכת
              </p>
            </div>

            {/* Account Info */}
            <div className="bg-gray-800/50 rounded-xl p-6 mb-6">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">חשבון:</span>
                  <span className="text-white font-medium">@{state.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">סטטוס:</span>
                  <span className="text-green-400">{state.existingAccount.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">נוצר:</span>
                  <span className="text-white">
                    {new Date(state.existingAccount.createdAt).toLocaleString('he-IL')}
                  </span>
                </div>
                {state.existingJob && (
                  <>
                    <div className="border-t border-gray-700 my-3"></div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">ריצה:</span>
                      <span className={`font-medium ${
                        state.existingJob.status === 'completed' ? 'text-green-400' :
                        state.existingJob.status === 'failed' ? 'text-red-400' :
                        'text-yellow-400'
                      }`}>
                        {state.existingJob.status === 'completed' ? '✅ הושלם' :
                         state.existingJob.status === 'failed' ? `❌ נכשל בשלב ${state.existingJob.error_step || state.existingJob.current_step}` :
                         `🔄 שלב ${state.existingJob.current_step} מתוך 7`}
                      </span>
                    </div>
                    {state.existingJob.error_message && (
                      <div className="text-xs text-red-400 mt-2">
                        שגיאה: {state.existingJob.error_message}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              <button
                onClick={handleResumeExisting}
                disabled={state.isLoading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-8 py-4 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {state.isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    מעבד...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-5 h-5" />
                    {state.existingJob ? 
                      `המשך מ${state.existingJob.status === 'failed' ? 'שלב שנכשל' : `שלב ${state.existingJob.current_step + 1}`}` :
                      'התחל ריצה חדשה עם הנתונים הקיימים'
                    }
                  </>
                )}
              </button>

              <button
                onClick={handleDeleteAndRestart}
                disabled={state.isLoading}
                className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/50 px-8 py-4 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🗑️ מחק הכל והתחל מאפס
              </button>

              <button
                onClick={() => setState((prev) => ({ ...prev, step: 'username', username: '' }))}
                disabled={state.isLoading}
                className="w-full text-gray-400 hover:text-white transition-colors py-2"
              >
                ← חזור
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Scraping Progress */}
        {state.step === 'scraping' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8"
          >
            <div className="text-center mb-8">
              <Zap className="w-16 h-16 text-indigo-500 mx-auto mb-4 animate-pulse" />
              <h2 className="text-2xl font-bold text-white mb-2">
                סורק ומנתח את הפרופיל
              </h2>
              <p className="text-gray-400 mb-4">
                תהליך זה עשוי לקחת 15-20 דקות
              </p>
              <button
                onClick={handleCancelScraping}
                className="text-red-400 hover:text-red-300 text-sm underline transition-colors"
              >
                בטל ריצה ומחק נתונים
              </button>
            </div>

            {jobStatus && (
              <div className="space-y-6">
                {/* Progress Bar */}
                <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${jobStatus.progress || 0}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                  />
                </div>

                {/* Current Step */}
                <div className="text-center">
                  <p className="text-lg font-medium text-white mb-1">
                    {jobStatus.currentStep ? `שלב ${jobStatus.currentStep} מתוך 7` : 'מתכונן...'}
                  </p>
                  <p className="text-sm text-gray-400">
                    {Math.round(jobStatus.progress || 0)}% הושלם
                  </p>
                </div>

                {/* Step Details */}
                {jobStatus.stepStatuses && (
                  <div className="space-y-3">
                    {jobStatus.stepStatuses.map((step: any, index: number) => (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-3 rounded-lg ${
                          step.status === 'completed'
                            ? 'bg-green-500/10 border border-green-500/20'
                            : step.status === 'running'
                            ? 'bg-indigo-500/10 border border-indigo-500/20'
                            : step.status === 'failed'
                            ? 'bg-red-500/10 border border-red-500/20'
                            : 'bg-gray-800'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            step.status === 'completed'
                              ? 'bg-green-500 text-white'
                              : step.status === 'running'
                              ? 'bg-indigo-500 text-white'
                              : step.status === 'failed'
                              ? 'bg-red-500 text-white'
                              : 'bg-gray-700 text-gray-400'
                          }`}
                        >
                          {step.step}
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium">{step.name}</p>
                          {step.duration && (
                            <p className="text-sm text-gray-400">
                              {Math.round(step.duration)}s
                            </p>
                          )}
                        </div>
                        {step.status === 'running' && (
                          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Step 3: Settings */}
        {state.step === 'settings' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8"
          >
            <div className="text-center mb-8">
              <User className="w-16 h-16 text-indigo-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">
                הגדרות חשבון
              </h2>
              <p className="text-gray-400">
                הפרסונה נבנתה בהצלחה! כעת נשאר להגדיר את פרטי הגישה
              </p>
            </div>

            <form onSubmit={handlePublish} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  תת-דומיין *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={state.subdomain}
                    onChange={(e) => setState(prev => ({ ...prev, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') }))}
                    className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="username"
                    required
                  />
                  <span className="text-gray-400 whitespace-nowrap">
                    .influencer.bot
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  סיסמת ניהול *
                </label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="password"
                    value={state.password}
                    onChange={(e) => setState(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full pr-12 pl-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="••••••"
                    minLength={6}
                    required
                  />
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  לפחות 6 תווים
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  מספר טלפון (אופציונלי)
                </label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="tel"
                    value={state.phoneNumber}
                    onChange={(e) => setState(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    className="w-full pr-12 pl-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="050-1234567"
                  />
                </div>
              </div>

              {state.phoneNumber && (
                <div className="flex items-center gap-3 p-4 bg-gray-800 rounded-lg">
                  <input
                    type="checkbox"
                    id="whatsapp"
                    checked={state.whatsappEnabled}
                    onChange={(e) => setState(prev => ({ ...prev, whatsappEnabled: e.target.checked }))}
                    className="w-5 h-5 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500"
                  />
                  <label htmlFor="whatsapp" className="text-white cursor-pointer">
                    הפעל התראות WhatsApp
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={state.isLoading}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {state.isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    שומר...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    פרסם משפיען
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}

        {/* Step 4: Complete */}
        {state.step === 'complete' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 text-center"
          >
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Zap className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">
              🎉 המשפיען נוסף בהצלחה!
            </h2>
            <p className="text-gray-400 mb-8">
              הפרסונה נבנתה והחשבון מוכן לשימוש
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={`/influencer/${state.username}/dashboard`}
                className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors"
              >
                לדשבורד המשפיען
              </Link>
              <Link
                href="/admin/dashboard"
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                חזרה לניהול
              </Link>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
