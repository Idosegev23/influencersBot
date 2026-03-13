'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Zap, Instagram, User, Lock, Phone, Building2 } from 'lucide-react';

type WizardStep = 'username' | 'scraping' | 'processing' | 'settings' | 'complete' | 'resume-choice';

interface WizardState {
  step: WizardStep;
  username: string;
  jobId: string | null;
  accountId: string | null;
  scrapingComplete: boolean;
  processingComplete: boolean;
  subdomain: string;
  password: string;
  phoneNumber: string;
  whatsappEnabled: boolean;
  accountType: 'creator' | 'brand';
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
    processingComplete: false,
    subdomain: '',
    password: '',
    phoneNumber: '',
    whatsappEnabled: false,
    accountType: 'creator',
    error: null,
    isLoading: false,
  });

  // Polling for scraping progress
  const [jobStatus, setJobStatus] = useState<any>(null);

  // Processing status
  const [processingStatus, setProcessingStatus] = useState<any>(null);

  // Transcription progress (NEW!)
  const [transcriptionProgress, setTranscriptionProgress] = useState<any>(null);

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

  // Poll processing status when in processing step
  useEffect(() => {
    if (state.step !== 'processing' || !state.accountId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/process/status?accountId=${state.accountId}`);
        if (res.ok) {
          const data = await res.json();
          setProcessingStatus(data.status);

          // Check if persona is built
          if (data.status?.hasPersona) {
            console.log('[Processing] Persona built successfully!');
            setState((prev) => ({
              ...prev,
              processingComplete: true,
              step: 'settings',
            }));
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error('[Processing] Failed to get status:', error);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [state.step, state.accountId]);

  // ⚡ NEW: Poll transcription progress when in processing step
  useEffect(() => {
    if (state.step !== 'processing' || !state.accountId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/transcribe/progress?accountId=${state.accountId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setTranscriptionProgress(data.progress);
          }
        }
      } catch (error) {
        console.error('[Transcription] Failed to get progress:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [state.step, state.accountId]);

  // Poll job status when in scraping step (NEW SYSTEM)
  useEffect(() => {
    if (state.step !== 'scraping' || !state.jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/status?jobId=${state.jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);

          if (data.status === 'succeeded') {
            setState((prev) => ({
              ...prev,
              scrapingComplete: true,
              step: 'processing', // ⚡ Move to processing step
            }));
            clearInterval(interval);

            // ⚡ REMOVED: startContentProcessing() - orchestrator handles this automatically!
          } else if (data.status === 'failed') {
            setState((prev) => ({
              ...prev,
              error: data.error_message || 'Scraping failed',
              step: 'username',
              isLoading: false,
            }));
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [state.step, state.jobId]);

  // Handle resume from existing account
  const handleResumeExisting = async () => {
    const { existingAccount, existingJob } = state;

    if (!existingAccount) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Check if scan already completed successfully
      const scanCompleted = existingJob && existingJob.status === 'succeeded';

      if (scanCompleted) {
        // ✅ Scan already completed - processing runs automatically by orchestrator!
        console.log(`[Resume] Scan already completed - orchestrator handles processing automatically for account ${existingAccount.id}`);

        setState((prev) => ({
          ...prev,
          accountId: existingAccount.id,
          jobId: existingJob.id,
          scrapingComplete: true,
          step: 'processing', // ⚡ Go to processing step!
          isLoading: false,
        }));

        // ⚡ REMOVED: startContentProcessing(existingAccount.id);
        // Processing is handled by newScanOrchestrator automatically to avoid duplicate runs!
        return;
      }

      const hasActiveJob = existingJob && (existingJob.status === 'running' || existingJob.status === 'pending');

      if (hasActiveJob) {
        // Resume from existing job
        const nextStep = existingJob.current_step + 1; // Continue from next step

        console.log(`[Resume] Continuing job ${existingJob.id} from step ${nextStep}`);

        setState((prev) => ({
          ...prev,
          accountId: existingAccount.id,
          jobId: existingJob.id,
          step: 'scraping',
          isLoading: false,
        }));

        // NEW: Scan continues automatically
      } else {
        // Job failed or doesn't exist - start new scan
        console.log(`[Resume] Starting new job for existing account ${existingAccount.id}`);

        const scrapingRes = await fetch('/api/scan/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: state.username,
            accountId: existingAccount.id,
            force: true, // ⚡ עקוף TTL check
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

        // NEW: Scan starts automatically when created!
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

      // Delete job if exists (NEW SYSTEM - jobs are in scan_jobs table)
      if (existingJob) {
        await fetch(`/api/scan/status?jobId=${existingJob.id}`, { method: 'DELETE' });
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
          type: state.accountType,
        }),
      });

      if (!accountRes.ok) {
        const error = await accountRes.json();
        throw new Error(error.error || 'Failed to create account');
      }

      const { accountId } = await accountRes.json();

      // Start scraping job with NEW system
      const scrapingRes = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          accountId,
          force: true, // ⚡ עקוף TTL check
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

      // NEW: Scan starts automatically when created!
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
      // Delete the job and all associated data (NEW SYSTEM)
      if (state.jobId) {
        await fetch(`/api/scan/status?jobId=${state.jobId}`, {
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
        processingComplete: false,
        subdomain: '',
        password: '',
        phoneNumber: '',
        whatsappEnabled: false,
        accountType: 'creator',
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
      // Check account status with smart resume logic
      const statusRes = await fetch(`/api/admin/accounts/status?username=${username}`);

      if (statusRes.ok) {
        const status = await statusRes.json();

        if (status.exists) {
          // Account exists - determine what to do based on status
          const { recommendation, accountId, hasPosts, hasPersona } = status;

          console.log('[Resume] Status:', status);
          console.log('[Resume] Recommendation:', recommendation);

          setState((prev) => ({
            ...prev,
            accountId,
            username,
            existingAccount: { id: accountId, username },
            existingJob: status.lastJob,
            isLoading: false,
          }));

          // Auto-navigate based on recommendation
          if (recommendation.action === 'skip_to_settings') {
            // Everything done - skip to settings
            setState((prev) => ({
              ...prev,
              step: 'settings',
              scrapingComplete: true,
              processingComplete: true,
            }));
          } else if (recommendation.action === 'start_processing') {
            // Scan done, need processing
            setState((prev) => ({
              ...prev,
              step: 'processing',
              scrapingComplete: true,
              processingComplete: false,
            }));
            // ⚡ REMOVED: startContentProcessing(accountId) - orchestrator handles this automatically!
          } else if (recommendation.action === 'continue_scan') {
            // Continue existing scan
            setState((prev) => ({
              ...prev,
              step: 'scraping',
              jobId: recommendation.jobId,
              scrapingComplete: false,
            }));
          } else {
            // Start new scan (show resume-choice first)
            setState((prev) => ({
              ...prev,
              step: 'resume-choice',
            }));
          }

          return;
        }
      }

      // Account doesn't exist - create new one
      const accountRes = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          type: state.accountType,
        }),
      });

      if (!accountRes.ok) {
        const error = await accountRes.json();
        throw new Error(error.error || 'Failed to create account');
      }

      const { accountId } = await accountRes.json();

      // Start scraping job with NEW system
      const scrapingRes = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          accountId,
          force: true, // ⚡ עקוף TTL check
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

      // NEW: Scan starts automatically when created!
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'אירעה שגיאה',
        isLoading: false,
      }));
    }
  };

  // NEW SYSTEM: Scan starts automatically when job is created
  // No need for triggerWorker() - /api/scan/start runs it immediately!

  // ============================================
  // Content Processing Functions
  // ============================================

  /**
   * ⚡ REMOVED: startContentProcessing()
   * Processing is now handled automatically by newScanOrchestrator to prevent duplicate runs!
   * The orchestrator calls processAccountContent() once at the end of the scan.
   */


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
      const res = await fetch('/api/admin/accounts/finalize', {
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
        <div className="w-8 h-8 border-2 border-[#a094e0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderStepIndicator = () => {
    const steps = [
      { id: 'username', label: 'שם משתמש', icon: Instagram },
      { id: 'scraping', label: 'סריקת תוכן', icon: Zap },
      { id: 'processing', label: 'עיבוד ופרסונה', icon: Zap },
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
                className="flex items-center gap-2 px-4 py-2 rounded-full transition-all"
                style={
                  isActive
                    ? { background: 'rgba(160, 148, 224, 0.15)', color: '#a094e0', border: '1px solid rgba(160, 148, 224, 0.3)' }
                    : isCompleted
                    ? { background: 'rgba(94, 234, 212, 0.08)', color: '#5eead4', border: '1px solid rgba(94, 234, 212, 0.15)' }
                    : { background: 'rgba(255, 255, 255, 0.02)', color: 'rgba(237, 233, 248, 0.25)', border: '1px solid rgba(255, 255, 255, 0.04)' }
                }
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className="w-8 h-0.5 mx-2"
                  style={{ background: isCompleted ? '#5eead4' : 'rgba(255, 255, 255, 0.06)' }}
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
      {/* Header */}
      <header
        className="relative z-10 px-6 py-4"
        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/admin/dashboard"
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה לדשבורד
          </Link>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" style={{ color: '#a094e0' }} />
            <span className="font-semibold" style={{ color: '#ede9f8' }}>הוספת משפיען חדש</span>
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
            className="pill pill-red mb-6 px-4 py-3 text-sm text-center w-full"
          >
            {state.error}
          </motion.div>
        )}

        {/* Step 1: Username Input */}
        {state.step === 'username' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="admin-card p-8"
          >
            <div className="text-center mb-8">
              <Instagram className="w-16 h-16 mx-auto mb-4" style={{ color: '#a094e0' }} />
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#ede9f8' }}>
                הזן שם משתמש אינסטגרם
              </h2>
              <p style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                המערכת תסרוק את הפרופיל ותבנה פרסונה מלאה
              </p>
            </div>

            <form onSubmit={handleUsernameSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
                  שם משתמש
                </label>
                <div className="relative">
                  <Instagram className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'rgba(237, 233, 248, 0.25)' }} />
                  <input
                    type="text"
                    value={state.username}
                    onChange={(e) => setState(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="username"
                    className="admin-input w-full !rounded-xl pr-12 pl-4 py-3"
                    disabled={state.isLoading}
                  />
                </div>
                <p className="mt-2 text-sm" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>
                  אפשר להזין עם או בלי @
                </p>
              </div>

              {/* Account Type Selector */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
                  סוג חשבון
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setState(prev => ({ ...prev, accountType: 'creator' }))}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all"
                    style={
                      state.accountType === 'creator'
                        ? { background: 'rgba(160, 148, 224, 0.1)', border: '1px solid rgba(160, 148, 224, 0.3)', color: '#ede9f8' }
                        : { background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', color: 'rgba(237, 233, 248, 0.35)' }
                    }
                  >
                    <User className="w-5 h-5" />
                    משפיען / יוצר תוכן
                  </button>
                  <button
                    type="button"
                    onClick={() => setState(prev => ({ ...prev, accountType: 'brand' }))}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all"
                    style={
                      state.accountType === 'brand'
                        ? { background: 'rgba(160, 148, 224, 0.1)', border: '1px solid rgba(160, 148, 224, 0.3)', color: '#ede9f8' }
                        : { background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', color: 'rgba(237, 233, 248, 0.35)' }
                    }
                  >
                    <Building2 className="w-5 h-5" />
                    מותג
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={state.isLoading || !state.username.trim()}
                className="btn-primary w-full py-3 font-medium flex items-center justify-center gap-2"
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
            className="admin-card p-8"
          >
            <div className="text-center mb-8">
              <Instagram className="w-16 h-16 mx-auto mb-4" style={{ color: '#a094e0' }} />
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#ede9f8' }}>
                חשבון קיים נמצא
              </h2>
              <p style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                @{state.username} כבר קיים במערכת
              </p>
            </div>

            {/* Account Info */}
            <div
              className="rounded-xl p-6 mb-6"
              style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
            >
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(237, 233, 248, 0.35)' }}>חשבון:</span>
                  <span className="font-medium" style={{ color: '#ede9f8' }}>@{state.username}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(237, 233, 248, 0.35)' }}>סטטוס:</span>
                  <span style={{ color: '#5eead4' }}>{state.existingAccount.status}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(237, 233, 248, 0.35)' }}>נוצר:</span>
                  <span style={{ color: '#ede9f8' }}>
                    {new Date(state.existingAccount.createdAt).toLocaleString('he-IL')}
                  </span>
                </div>
                {state.existingJob && (
                  <>
                    <div className="my-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }} />
                    <div className="flex justify-between">
                      <span style={{ color: 'rgba(237, 233, 248, 0.35)' }}>ריצה:</span>
                      <span className="font-medium" style={{
                        color: state.existingJob.status === 'completed' ? '#5eead4' :
                               state.existingJob.status === 'failed' ? '#f87171' :
                               '#fbbf24'
                      }}>
                        {state.existingJob.status === 'completed' ? '✅ הושלם' :
                         state.existingJob.status === 'failed' ? `❌ נכשל בשלב ${state.existingJob.error_step || state.existingJob.current_step}` :
                         `🔄 שלב ${state.existingJob.current_step} מתוך 7`}
                      </span>
                    </div>
                    {state.existingJob.error_message && (
                      <div className="text-xs mt-2" style={{ color: '#f87171' }}>
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
                className="btn-primary w-full py-4 font-medium flex items-center justify-center gap-2"
              >
                {state.isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
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
                className="w-full py-4 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.15)' }}
              >
                🗑️ מחק הכל והתחל מאפס
              </button>

              <button
                onClick={() => setState((prev) => ({ ...prev, step: 'username', username: '' }))}
                disabled={state.isLoading}
                className="btn-ghost w-full py-2"
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
            className="admin-card p-8"
          >
            <div className="text-center mb-8">
              <Zap className="w-16 h-16 mx-auto mb-4 animate-pulse" style={{ color: '#a094e0' }} />
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#ede9f8' }}>
                סורק ומנתח את הפרופיל
              </h2>
              <p className="mb-4" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                תהליך זה עשוי לקחת 15-20 דקות
              </p>
              <button
                onClick={handleCancelScraping}
                className="text-sm underline transition-colors"
                style={{ color: '#f87171' }}
              >
                בטל ריצה ומחק נתונים
              </button>
            </div>

            {jobStatus && (
              <div className="space-y-6">
                {/* Progress Bar */}
                <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.06)' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${jobStatus.progress || 0}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full rounded-full"
                    style={{ background: '#a094e0' }}
                  />
                </div>

                {/* Current Status */}
                <div className="text-center">
                  <p className="text-lg font-medium mb-1" style={{ color: '#ede9f8' }}>
                    {jobStatus.status === 'queued' && '⏳ ממתין בתור...'}
                    {jobStatus.status === 'running' && `🔄 ${jobStatus.current_step || 'סורק נתונים'}...`}
                    {jobStatus.status === 'succeeded' && '✅ סריקה הושלמה!'}
                    {jobStatus.status === 'failed' && '❌ נכשל'}
                  </p>
                  <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                    {Math.round(jobStatus.progress || 0)}% הושלם
                  </p>
                </div>

                {/* Detailed Steps */}
                {jobStatus.steps && Object.keys(jobStatus.steps).length > 0 && (
                  <div
                    className="rounded-xl p-5 space-y-3"
                    style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
                  >
                    <p className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: '#ede9f8' }}>
                      🔍 שלבי הסריקה בזמן אמת:
                    </p>
                    <div className="space-y-3">
                      {Object.entries(jobStatus.steps).map(([key, step]: [string, any]) => (
                        <div
                          key={key}
                          className="flex items-start gap-3 p-2 rounded-lg transition-colors"
                          style={{ background: 'transparent' }}
                        >
                          <span className={`text-lg mt-0.5 flex-shrink-0 ${step.status === 'running' ? 'animate-pulse' : ''}`}
                            style={{
                              color: step.status === 'completed' ? '#5eead4' :
                                     step.status === 'running' ? '#a094e0' :
                                     step.status === 'failed' ? '#f87171' :
                                     'rgba(237, 233, 248, 0.25)'
                            }}
                          >
                            {step.status === 'completed' && '✅'}
                            {step.status === 'running' && '🔄'}
                            {step.status === 'failed' && '❌'}
                            {step.status === 'pending' && '⏸️'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: 'rgba(237, 233, 248, 0.7)' }}>{step.message || key}</p>
                            {step.timestamp && (
                              <p className="text-xs mt-0.5" style={{ color: 'rgba(237, 233, 248, 0.2)' }}>
                                {new Date(step.timestamp).toLocaleTimeString('he-IL')}
                              </p>
                            )}
                          </div>
                          {step.progress > 0 && (
                            <span className="text-xs font-mono" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                              {step.progress}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Results Summary */}
                {jobStatus.results && (
                  <div
                    className="rounded-xl p-4 space-y-2"
                    style={{ background: 'rgba(94, 234, 212, 0.04)', border: '1px solid rgba(94, 234, 212, 0.1)' }}
                  >
                    <p className="text-sm font-medium mb-3" style={{ color: '#ede9f8' }}>✅ נסרק בהצלחה:</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {jobStatus.results.profile && (
                        <div className="flex items-center gap-2">
                          <span style={{ color: '#5eead4' }}>✓</span>
                          <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>פרופיל</span>
                        </div>
                      )}
                      {jobStatus.results.posts_count > 0 && (
                        <div className="flex items-center gap-2">
                          <span style={{ color: '#5eead4' }}>✓</span>
                          <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>{jobStatus.results.posts_count} פוסטים</span>
                        </div>
                      )}
                      {jobStatus.results.highlights_count > 0 && (
                        <div className="flex items-center gap-2">
                          <span style={{ color: '#5eead4' }}>✓</span>
                          <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>{jobStatus.results.highlights_count} הילייטס</span>
                        </div>
                      )}
                      {jobStatus.results.comments_count > 0 && (
                        <div className="flex items-center gap-2">
                          <span style={{ color: '#5eead4' }}>✓</span>
                          <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>{jobStatus.results.comments_count} תגובות</span>
                        </div>
                      )}
                      {jobStatus.results.websites_crawled > 0 && (
                        <div className="flex items-center gap-2">
                          <span style={{ color: '#5eead4' }}>✓</span>
                          <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>{jobStatus.results.websites_crawled} אתרים</span>
                        </div>
                      )}
                      {jobStatus.results.transcripts_count > 0 && (
                        <div className="flex items-center gap-2">
                          <span style={{ color: '#5eead4' }}>✓</span>
                          <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>{jobStatus.results.transcripts_count} תמלולים</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {jobStatus.error && (
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)' }}
                  >
                    <p className="font-medium mb-1" style={{ color: '#f87171' }}>שגיאה:</p>
                    <p className="text-sm" style={{ color: '#fca5a5' }}>{jobStatus.error.message}</p>
                    {jobStatus.error.code && (
                      <p className="text-xs mt-2" style={{ color: '#f87171' }}>קוד: {jobStatus.error.code}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Step 3: Processing Content & Building Persona */}
        {state.step === 'processing' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="admin-card p-8"
          >
            <div className="text-center mb-8">
              <Zap className="w-16 h-16 mx-auto mb-4 animate-pulse" style={{ color: '#a094e0' }} />
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#ede9f8' }}>
                מעבד תוכן ובונה פרסונה 🤖
              </h2>
              {/* ⚡ Show transcription progress in header */}
              {transcriptionProgress && transcriptionProgress.total > 0 && (
                <p className="font-medium mb-1" style={{ color: '#a094e0' }}>
                  מתמלל סרטון {transcriptionProgress.completed + 1} מתוך {transcriptionProgress.total}
                </p>
              )}
              <p style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                תמלול סרטונים + ניתוח AI + בניית אישיות ייחודית
              </p>
            </div>

            {/* Processing Stats */}
            {processingStatus && (
              <div className="space-y-4">
                {/* Progress Indicator */}
                <div className="flex items-center justify-center gap-3 mb-6">
                  <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#a094e0', borderTopColor: 'transparent' }} />
                  <span className="font-medium" style={{ color: '#ede9f8' }}>מעבד...</span>
                </div>

                {/* Current Content */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
                >
                  <p className="text-sm font-medium mb-3" style={{ color: '#ede9f8' }}>📊 תוכן זמין:</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>פוסטים</span>
                      <span className="font-medium" style={{ color: '#ede9f8' }}>{processingStatus.content?.posts || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>Stories</span>
                      <span className="font-medium" style={{ color: '#ede9f8' }}>{processingStatus.content?.highlights || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>תמלולים</span>
                      <span className="font-medium" style={{ color: '#ede9f8' }}>{processingStatus.transcriptions?.completed || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'rgba(237, 233, 248, 0.5)' }}>בהמתנה</span>
                      <span style={{ color: 'rgba(237, 233, 248, 0.35)' }}>{processingStatus.transcriptions?.pending || 0}</span>
                    </div>
                  </div>
                </div>

                {/* ⚡ Transcription Progress */}
                {transcriptionProgress && transcriptionProgress.total > 0 && (
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(160, 148, 224, 0.06)', border: '1px solid rgba(160, 148, 224, 0.15)' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium" style={{ color: '#ede9f8' }}>🎤 התקדמות תמלול:</p>
                      <span className="font-bold" style={{ color: '#a094e0' }}>
                        {transcriptionProgress.completed}/{transcriptionProgress.total}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 mb-3 rounded-full overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.06)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${transcriptionProgress.percentage || 0}%` }}
                        transition={{ duration: 0.3 }}
                        className="h-full rounded-full"
                        style={{ background: '#a094e0' }}
                      />
                    </div>

                    {/* Status Breakdown */}
                    <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                      <div className="text-center">
                        <div className="font-bold" style={{ color: '#5eead4' }}>{transcriptionProgress.completed}</div>
                        <div style={{ color: 'rgba(237, 233, 248, 0.35)' }}>הושלם</div>
                      </div>
                      {transcriptionProgress.processing > 0 && (
                        <div className="text-center">
                          <div className="font-bold animate-pulse" style={{ color: '#a094e0' }}>{transcriptionProgress.processing}</div>
                          <div style={{ color: 'rgba(237, 233, 248, 0.35)' }}>מתמלל</div>
                        </div>
                      )}
                      {transcriptionProgress.pending > 0 && (
                        <div className="text-center">
                          <div className="font-bold" style={{ color: '#fbbf24' }}>{transcriptionProgress.pending}</div>
                          <div style={{ color: 'rgba(237, 233, 248, 0.35)' }}>ממתין</div>
                        </div>
                      )}
                      {transcriptionProgress.failed > 0 && (
                        <div className="text-center">
                          <div className="font-bold" style={{ color: '#f87171' }}>{transcriptionProgress.failed}</div>
                          <div style={{ color: 'rgba(237, 233, 248, 0.35)' }}>נכשל</div>
                        </div>
                      )}
                    </div>

                    {/* Recent Transcriptions Summary */}
                    {transcriptionProgress.recentTranscriptions && transcriptionProgress.recentTranscriptions.length > 0 && (
                      <div className="pt-3" style={{ borderTop: '1px solid rgba(160, 148, 224, 0.15)' }}>
                        <p className="text-xs mb-2" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>תמלולים אחרונים:</p>
                        <div className="space-y-2">
                          {transcriptionProgress.recentTranscriptions.map((t: any, i: number) => (
                            <div
                              key={i}
                              className="text-xs rounded p-2"
                              style={{ background: 'rgba(255, 255, 255, 0.02)' }}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span style={{ color: '#a094e0' }}>{t.sourceType}</span>
                                <span style={{ color: 'rgba(237, 233, 248, 0.25)' }}>{t.language}</span>
                              </div>
                              <p className="truncate" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>{t.preview}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Persona Status */}
                {processingStatus.hasPersona ? (
                  <div
                    className="rounded-xl p-4 text-center"
                    style={{ background: 'rgba(94, 234, 212, 0.06)', border: '1px solid rgba(94, 234, 212, 0.15)' }}
                  >
                    <p className="font-medium mb-2" style={{ color: '#5eead4' }}>✅ הפרסונה נבנתה בהצלחה!</p>
                    {processingStatus.persona && (
                      <div className="text-xs space-y-1" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
                        <p>שם: {processingStatus.persona.name}</p>
                        <p>טון: {processingStatus.persona.tone}</p>
                        <p>{processingStatus.persona.topics} נושאים | {processingStatus.persona.products} מוצרים | {processingStatus.persona.coupons} קופונים</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="rounded-xl p-4 text-center"
                    style={{ background: 'rgba(160, 148, 224, 0.06)', border: '1px solid rgba(160, 148, 224, 0.15)' }}
                  >
                    <p className="font-medium" style={{ color: '#a094e0' }}>🤖 בונה פרסונה...</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>זה עשוי לקחת 1-3 דקות</p>
                  </div>
                )}

                {/* Processing Steps */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
                >
                  <p className="text-sm font-medium mb-3" style={{ color: '#ede9f8' }}>⚡ מה קורה עכשיו:</p>
                  <div className="space-y-2 text-xs" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
                    <div className="flex items-center gap-2">
                      <span style={{ color: processingStatus.transcriptions?.completed > 0 ? '#5eead4' : '#a094e0' }}>
                        {processingStatus.transcriptions?.completed > 0 ? '✓' : '⏳'}
                      </span>
                      <span>תמלול סרטונים באמצעות Gemini 3 Pro</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: processingStatus.hasPersona ? '#5eead4' : '#a094e0' }}>
                        {processingStatus.hasPersona ? '✓' : '⏳'}
                      </span>
                      <span>ניתוח תוכן וזיהוי דפוסים</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: processingStatus.hasPersona ? '#5eead4' : '#a094e0' }}>
                        {processingStatus.hasPersona ? '✓' : '⏳'}
                      </span>
                      <span>בניית פרסונה AI ייחודית</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: processingStatus.hasPersona ? '#5eead4' : '#a094e0' }}>
                        {processingStatus.hasPersona ? '✓' : '⏳'}
                      </span>
                      <span>זיהוי מוצרים, קופונים ושותפויות</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!processingStatus && (
              <div className="text-center" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#a094e0', borderTopColor: 'transparent' }} />
                <p>מתחבר למערכת העיבוד...</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Step 4: Settings */}
        {state.step === 'settings' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="admin-card p-8"
          >
            <div className="text-center mb-8">
              <User className="w-16 h-16 mx-auto mb-4" style={{ color: '#a094e0' }} />
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#ede9f8' }}>
                הגדרות חשבון
              </h2>
              <p style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                הפרסונה נבנתה בהצלחה! כעת נשאר להגדיר את פרטי הגישה
              </p>
            </div>

            <form onSubmit={handlePublish} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
                  תת-דומיין *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={state.subdomain}
                    onChange={(e) => setState(prev => ({ ...prev, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') }))}
                    className="admin-input flex-1 !rounded-xl px-4 py-3"
                    placeholder="username"
                    required
                  />
                  <span style={{ color: 'rgba(237, 233, 248, 0.35)' }} className="whitespace-nowrap">
                    .influencer.bot
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
                  סיסמת ניהול *
                </label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'rgba(237, 233, 248, 0.25)' }} />
                  <input
                    type="password"
                    value={state.password}
                    onChange={(e) => setState(prev => ({ ...prev, password: e.target.value }))}
                    className="admin-input w-full !rounded-xl pr-12 pl-4 py-3"
                    placeholder="••••••"
                    minLength={6}
                    required
                  />
                </div>
                <p className="mt-2 text-sm" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>
                  לפחות 6 תווים
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
                  מספר טלפון (אופציונלי)
                </label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'rgba(237, 233, 248, 0.25)' }} />
                  <input
                    type="tel"
                    value={state.phoneNumber}
                    onChange={(e) => setState(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    className="admin-input w-full !rounded-xl pr-12 pl-4 py-3"
                    placeholder="050-1234567"
                  />
                </div>
              </div>

              {state.phoneNumber && (
                <div
                  className="flex items-center gap-3 p-4 rounded-xl"
                  style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
                >
                  <input
                    type="checkbox"
                    id="whatsapp"
                    checked={state.whatsappEnabled}
                    onChange={(e) => setState(prev => ({ ...prev, whatsappEnabled: e.target.checked }))}
                    className="w-5 h-5 rounded"
                    style={{ accentColor: '#a094e0' }}
                  />
                  <label htmlFor="whatsapp" className="cursor-pointer" style={{ color: '#ede9f8' }}>
                    הפעל התראות WhatsApp
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={state.isLoading}
                className="btn-primary w-full py-3 font-medium flex items-center justify-center gap-2"
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

        {/* Step 5: Complete */}
        {state.step === 'complete' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="admin-card p-8 text-center"
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(94, 234, 212, 0.1)', border: '1px solid rgba(94, 234, 212, 0.2)' }}
            >
              <Zap className="w-10 h-10" style={{ color: '#5eead4' }} />
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ color: '#ede9f8' }}>
              🎉 המשפיען נוסף בהצלחה!
            </h2>
            <p className="mb-8" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
              הפרסונה נבנתה והחשבון מוכן לשימוש
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={`/influencer/${state.username}/dashboard`}
                className="btn-primary px-6 py-3 font-medium"
              >
                לדשבורד המשפיען
              </Link>
              <Link
                href="/admin/dashboard"
                className="btn-ghost px-6 py-3 font-medium"
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
