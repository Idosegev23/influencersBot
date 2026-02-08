/**
 * Scan Jobs Repository
 * ניהול תור המשימות לסריקה
 */

import { createClient } from '@/lib/supabase/server';

// ============================================
// Type Definitions
// ============================================

export interface ScanJob {
  id: string;
  platform: 'instagram' | 'tiktok' | 'youtube';
  username: string;
  account_id?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  priority: number;
  requested_by?: string;
  attempt: number;
  max_attempts: number;
  next_run_at: string;
  locked_at?: string;
  locked_by?: string;
  started_at?: string;
  finished_at?: string;
  error_code?: string;
  error_message?: string;
  result_summary?: any;
  config?: any;
  step_logs?: ScanStepLog[]; // ⚡ NEW: Real-time logs for UI
  created_at: string;
  updated_at: string;
}

export interface ScanStepLog {
  step: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  timestamp: string;
}

export interface CreateScanJobParams {
  username: string;
  account_id?: string;
  priority?: number;
  requested_by?: string;
  config?: any;
}

export interface TTLCheckResult {
  can_scan: boolean;
  reason: string;
  last_scan?: string;
}

// ============================================
// Repository Class
// ============================================

export class ScanJobsRepository {
  private supabase: any;

  constructor() {
    // Supabase will be initialized in methods
  }

  private async getClient() {
    if (!this.supabase) {
      this.supabase = await createClient();
    }
    return this.supabase;
  }

  /**
   * Create a new scan job
   */
  async create(params: CreateScanJobParams): Promise<ScanJob> {
    const supabase = await this.getClient();

    const { data, error } = await supabase
      .from('scan_jobs')
      .insert({
        platform: 'instagram',
        username: params.username,
        account_id: params.account_id,
        priority: params.priority || 100,
        requested_by: params.requested_by,
        config: params.config || {},
        status: 'queued',
        attempt: 0,
        max_attempts: 3,
        next_run_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create scan job: ${error.message}`);
    }

    return data;
  }

  /**
   * Get job by ID
   */
  async getById(jobId: string): Promise<ScanJob | null> {
    const supabase = await this.getClient();

    const { data, error } = await supabase
      .from('scan_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get scan job: ${error.message}`);
    }

    return data;
  }

  /**
   * Get next job to run (using DB function for atomic lock)
   */
  async getNextJob(workerId: string): Promise<ScanJob | null> {
    const supabase = await this.getClient();

    const { data: jobId, error: funcError } = await supabase
      .rpc('get_next_scan_job', { worker_id: workerId })
      .single();

    if (funcError) {
      throw new Error(`Failed to get next job: ${funcError.message}`);
    }

    if (!jobId) {
      return null; // No jobs available
    }

    // Fetch the locked job
    return this.getById(jobId);
  }

  /**
   * Mark job as succeeded
   */
  async markSucceeded(jobId: string, resultSummary: any = {}): Promise<void> {
    const supabase = await this.getClient();

    const { error } = await supabase.rpc('mark_scan_job_succeeded', {
      job_id: jobId,
      summary: resultSummary,
    });

    if (error) {
      throw new Error(`Failed to mark job as succeeded: ${error.message}`);
    }
  }

  /**
   * Mark job as failed
   */
  async markFailed(jobId: string, errorCode: string, errorMessage: string): Promise<void> {
    const supabase = await this.getClient();

    const { error } = await supabase.rpc('mark_scan_job_failed', {
      job_id: jobId,
      err_code: errorCode,
      err_message: errorMessage,
    });

    if (error) {
      throw new Error(`Failed to mark job as failed: ${error.message}`);
    }
  }

  /**
   * Mark job as running (for immediate execution)
   */
  async markRunning(jobId: string, workerId: string = 'api'): Promise<void> {
    const supabase = await this.getClient();

    const { error } = await supabase
      .from('scan_jobs')
      .update({
        status: 'running',
        locked_at: new Date().toISOString(),
        locked_by: workerId,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to mark job as running: ${error.message}`);
    }
  }

  /**
   * Cancel a job
   */
  async cancel(jobId: string): Promise<void> {
    const supabase = await this.getClient();

    const { error } = await supabase
      .from('scan_jobs')
      .update({
        status: 'cancelled',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .in('status', ['queued', 'running']);

    if (error) {
      throw new Error(`Failed to cancel job: ${error.message}`);
    }
  }

  /**
   * ⚡ NEW: Add a step log to a job (for real-time UI updates)
   */
  async addStepLog(
    jobId: string,
    step: string,
    status: 'pending' | 'running' | 'completed' | 'failed',
    progress: number,
    message: string
  ): Promise<void> {
    const supabase = await this.getClient();

    // Get current logs
    const { data: job } = await supabase
      .from('scan_jobs')
      .select('step_logs')
      .eq('id', jobId)
      .single();

    const currentLogs = job?.step_logs || [];
    
    // Add new log entry
    const newLog: ScanStepLog = {
      step,
      status,
      progress,
      message,
      timestamp: new Date().toISOString(),
    };

    const updatedLogs = [...currentLogs, newLog];

    // Update job with new logs
    const { error } = await supabase
      .from('scan_jobs')
      .update({
        step_logs: updatedLogs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) {
      console.error(`Failed to add step log: ${error.message}`);
      // Don't throw - logging shouldn't fail the job
    }
  }

  /**
   * Check if username can be scanned (TTL check)
   */
  async canScan(username: string, ttlHours: number = 24): Promise<TTLCheckResult> {
    const supabase = await this.getClient();

    const { data, error } = await supabase
      .rpc('can_scan_username', {
        p_username: username,
        ttl_hours: ttlHours,
      })
      .single();

    if (error) {
      throw new Error(`Failed to check TTL: ${error.message}`);
    }

    return data;
  }

  /**
   * Get recent jobs for username
   */
  async getRecentJobs(username: string, limit: number = 10): Promise<ScanJob[]> {
    const supabase = await this.getClient();

    const { data, error } = await supabase
      .from('scan_jobs')
      .select('*')
      .eq('username', username)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get recent jobs: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get jobs by account
   */
  async getByAccount(accountId: string, limit: number = 20): Promise<ScanJob[]> {
    const supabase = await this.getClient();

    const { data, error } = await supabase
      .from('scan_jobs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get jobs by account: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get failed jobs for retry
   */
  async getFailedJobs(limit: number = 50): Promise<ScanJob[]> {
    const supabase = await this.getClient();

    const { data, error } = await supabase
      .from('scan_jobs')
      .select('*')
      .eq('status', 'failed')
      .order('finished_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get failed jobs: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Release stale locks
   */
  async releaseStaleLocks(maxLockDurationMinutes: number = 15): Promise<number> {
    const supabase = await this.getClient();

    const { data: releasedCount, error } = await supabase
      .rpc('release_stale_scan_jobs', {
        max_lock_duration_minutes: maxLockDurationMinutes,
      })
      .single();

    if (error) {
      throw new Error(`Failed to release stale locks: ${error.message}`);
    }

    return releasedCount || 0;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    queued: number;
    running: number;
    succeeded_today: number;
    failed_today: number;
  }> {
    const supabase = await this.getClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [queued, running, succeededToday, failedToday] = await Promise.all([
      supabase.from('scan_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      supabase.from('scan_jobs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
      supabase.from('scan_jobs').select('id', { count: 'exact', head: true })
        .eq('status', 'succeeded')
        .gte('finished_at', today.toISOString()),
      supabase.from('scan_jobs').select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('finished_at', today.toISOString()),
    ]);

    return {
      queued: queued.count || 0,
      running: running.count || 0,
      succeeded_today: succeededToday.count || 0,
      failed_today: failedToday.count || 0,
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let repoInstance: ScanJobsRepository | null = null;

export function getScanJobsRepo(): ScanJobsRepository {
  if (!repoInstance) {
    repoInstance = new ScanJobsRepository();
  }
  return repoInstance;
}
