/**
 * Resume Helper - מנגנון חכם להמשך מאיפה שעצרנו
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export type ResumeAction = 
  | { action: 'start_scan'; reason: string }
  | { action: 'continue_scan'; jobId: string; reason: string }
  | { action: 'start_processing'; reason: string }
  | { action: 'skip_to_settings'; reason: string };

export interface AccountStatus {
  accountId: string;
  username: string;
  
  // Data status
  hasPosts: boolean;
  hasHighlights: boolean;
  hasComments: boolean;
  hasPersona: boolean;
  
  // Counts
  postsCount: number;
  highlightsCount: number;
  commentsCount: number;
  
  // Last scan job
  lastJob?: {
    id: string;
    status: string;
    createdAt: string;
    results?: any;
  };
  
  // Recommendation
  recommendation: ResumeAction;
}

/**
 * Check account status and determine what to do next
 */
export async function checkAccountStatus(username: string): Promise<AccountStatus | null> {
  // Use direct client with service role (for API route usage)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }
  
  const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

  // Get account (username is stored in config.username)
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*');
  
  // Find account by config.username
  const account = accounts?.find(acc => 
    acc.config?.username === username || 
    acc.config?.display_name === username
  );

  if (!account) {
    return null;
  }

  const accountId = account.id;
  const actualUsername = account.config?.username || username;

  // Check data counts
  const [
    { count: postsCount },
    { count: highlightsCount },
    { count: commentsCount },
  ] = await Promise.all([
    supabase.from('instagram_posts').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
    supabase.from('instagram_highlight_items').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
    supabase.from('instagram_comments').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
  ]);

  // Check persona
  const { data: persona } = await supabase
    .from('chatbot_persona')
    .select('id')
    .eq('account_id', accountId)
    .single();

  // Get last scan job
  const { data: lastJob } = await supabase
    .from('scan_jobs')
    .select('id, status, created_at, result_summary, error_code, error_message')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const hasPosts = (postsCount || 0) > 0;
  const hasHighlights = (highlightsCount || 0) > 0;
  const hasComments = (commentsCount || 0) > 0;
  const hasPersona = !!persona;

  // Determine recommendation
  let recommendation: ResumeAction;

  if (lastJob?.status === 'running' || lastJob?.status === 'pending') {
    // Job is running - continue it
    recommendation = {
      action: 'continue_scan',
      jobId: lastJob.id,
      reason: 'יש ריצה פעילה',
    };
  } else if (lastJob?.status === 'succeeded' && (hasPosts || hasHighlights)) {
    // Scan completed, has data
    if (hasPersona) {
      // Everything done - go to settings
      recommendation = {
        action: 'skip_to_settings',
        reason: 'הסריקה והעיבוד הושלמו - ניתן להגדיר חשבון',
      };
    } else {
      // Need to process and build persona
      recommendation = {
        action: 'start_processing',
        reason: 'הסריקה הושלמה - צריך לעבד ולבנות פרסונה',
      };
    }
  } else if (lastJob?.status === 'failed') {
    // Failed job - restart scan
    recommendation = {
      action: 'start_scan',
      reason: 'הריצה הקודמת נכשלה - התחל מחדש',
    };
  } else if (hasPosts || hasHighlights) {
    // Has data but no recent job - process what we have
    recommendation = {
      action: 'start_processing',
      reason: 'יש נתונים קיימים - מתחיל עיבוד',
    };
  } else {
    // No data - start fresh scan
    recommendation = {
      action: 'start_scan',
      reason: 'אין נתונים - מתחיל סריקה חדשה',
    };
  }

  return {
    accountId,
    username: actualUsername,
    
    hasPosts,
    hasHighlights,
    hasComments,
    hasPersona,
    
    postsCount: postsCount || 0,
    highlightsCount: highlightsCount || 0,
    commentsCount: commentsCount || 0,
    
    lastJob: lastJob ? {
      id: lastJob.id,
      status: lastJob.status,
      createdAt: lastJob.created_at,
      results: lastJob.result_summary, // ⚡ Fixed: result_summary not results
    } : undefined,
    
    recommendation,
  };
}
