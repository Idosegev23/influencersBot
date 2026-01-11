/**
 * ============================================
 * Context Builder v1
 * ============================================
 * 
 * Builds EngineContext from DB for each request.
 * Handles session creation, account loading, and limits.
 */

import { createClient } from '@supabase/supabase-js';
import type { 
  EngineContext, 
  AccountContext, 
  SessionContext, 
  UserContext,
  KnowledgeRefs,
  LimitsContext,
  RequestContext,
  AccountMode,
} from './context';

// ============================================
// Supabase Client
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// Input Types
// ============================================

export interface BuildContextInput {
  accountId: string;
  mode: AccountMode;
  sessionId?: string;
  previousResponseId?: string;
  traceId: string;
  requestId: string;
  anonUserId?: string;
}

// ============================================
// Context Builder
// ============================================

export async function buildContext(input: BuildContextInput): Promise<EngineContext> {
  const { accountId, mode, sessionId, previousResponseId, traceId, requestId, anonUserId } = input;

  // Load in parallel where possible
  const [account, session, limits] = await Promise.all([
    loadAccountContext(accountId, mode),
    loadOrCreateSession(accountId, sessionId, previousResponseId),
    loadLimitsContext(accountId),
  ]);

  const user: UserContext = {
    anonId: anonUserId || `anon_${Date.now()}`,
    isRepeatVisitor: session.messageCount > 0,
    sessionCount: 1,
  };

  const knowledge: KnowledgeRefs = {
    brandsRef: `brands:${accountId}`,
    contentIndexRef: `content:${accountId}`,
  };

  const request: RequestContext = {
    requestId,
    traceId,
    timestamp: new Date(),
    source: 'chat',
    messageId: `msg_${Date.now()}`,
    clientMessageId: requestId,
  };

  return {
    account,
    session,
    user,
    knowledge,
    limits,
    request,
  };
}

// ============================================
// Account Loading
// ============================================

async function loadAccountContext(accountId: string, mode: AccountMode): Promise<AccountContext> {
  // Try to load from accounts table first
  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (account) {
    return {
      id: account.id,
      mode: account.type as AccountMode,
      profileId: account.legacy_influencer_id || account.id,
      timezone: account.timezone || 'Asia/Jerusalem',
      language: account.language || 'he',
      plan: account.plan || 'free',
      allowedChannels: account.allowed_channels || ['chat'],
      security: account.security_config || {
        publicChatAllowed: true,
        requireAuthForSupport: false,
        allowedOrigins: [],
      },
      features: account.features || {
        supportFlowEnabled: true,
        salesFlowEnabled: false,
        whatsappEnabled: false,
        analyticsEnabled: true,
      },
    };
  }

  // Fallback: try to load from influencers table (legacy)
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id, username')
    .eq('id', accountId)
    .single();

  if (influencer) {
    // Create account for this influencer
    const { data: newAccount } = await supabase
      .from('accounts')
      .insert({
        type: 'creator',
        legacy_influencer_id: influencer.id,
        plan: 'pro',
      })
      .select()
      .single();

    if (newAccount) {
      return loadAccountContext(newAccount.id, mode);
    }
  }

  // Default fallback
  return {
    id: accountId,
    mode,
    profileId: accountId,
    timezone: 'Asia/Jerusalem',
    language: 'he',
    plan: 'free',
    allowedChannels: ['chat'],
    security: {
      publicChatAllowed: true,
      requireAuthForSupport: false,
      allowedOrigins: [],
    },
    features: {
      supportFlowEnabled: true,
      salesFlowEnabled: false,
      whatsappEnabled: false,
      analyticsEnabled: true,
    },
  };
}

// ============================================
// Session Loading / Creation
// ============================================

async function loadOrCreateSession(
  accountId: string,
  sessionId?: string,
  previousResponseId?: string
): Promise<SessionContext> {
  if (sessionId) {
    // Try to load existing session
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (session) {
      return {
        id: session.id,
        state: session.state || 'Chat.Active',
        version: session.version || 1,
        previousResponseId: previousResponseId || session.thread_id,
        lastActiveAt: new Date(session.updated_at),
        messageCount: session.message_count || 0,
      };
    }
  }

  // Create new session
  const { data: newSession, error } = await supabase
    .from('chat_sessions')
    .insert({
      influencer_id: accountId,
      state: 'Chat.Active',
      version: 1,
      message_count: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[ContextBuilder] Failed to create session:', error);
    // Return temporary session
    return {
      id: `temp_${Date.now()}`,
      state: 'Chat.Active',
      version: 1,
      lastActiveAt: new Date(),
      messageCount: 0,
    };
  }

  return {
    id: newSession.id,
    state: newSession.state || 'Chat.Active',
    version: newSession.version || 1,
    previousResponseId,
    lastActiveAt: new Date(),
    messageCount: 0,
  };
}

// ============================================
// Limits Loading
// ============================================

async function loadLimitsContext(accountId: string): Promise<LimitsContext> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Load current cost tracking
  const { data: costData } = await supabase
    .from('cost_tracking')
    .select('*')
    .eq('account_id', accountId)
    .eq('period_type', 'month')
    .gte('period_start', periodStart.toISOString().split('T')[0])
    .single();

  const tokensUsed = costData?.tokens_used || 0;
  const costUsed = parseFloat(costData?.estimated_cost || '0');
  const budgetLimit = parseFloat(costData?.budget_limit || '100'); // Default $100/month

  return {
    tokenBudgetRemaining: 1000000 - tokensUsed, // 1M tokens default
    tokenBudgetTotal: 1000000,
    costCeiling: budgetLimit,
    costUsed,
    rateLimitRemaining: 100, // 100 requests per minute default
    rateLimitResetAt: new Date(Date.now() + 60000),
    periodType: 'month',
    periodStart,
    periodEnd,
  };
}

// ============================================
// Session Update
// ============================================

export async function updateSessionState(
  sessionId: string,
  newState: string,
  incrementMessageCount: boolean = true
): Promise<boolean> {
  const updates: Record<string, unknown> = {
    state: newState,
    updated_at: new Date().toISOString(),
  };

  if (incrementMessageCount) {
    // Use RPC or raw SQL for atomic increment
    const { error } = await supabase.rpc('increment_session_message_count', {
      p_session_id: sessionId,
      p_new_state: newState,
    });

    if (error) {
      // Fallback to regular update
      const { error: updateError } = await supabase
        .from('chat_sessions')
        .update(updates)
        .eq('id', sessionId);

      return !updateError;
    }
    return true;
  }

  const { error } = await supabase
    .from('chat_sessions')
    .update(updates)
    .eq('id', sessionId);

  return !error;
}

// ============================================
// Account by Username (for /api/chat)
// ============================================

export async function getAccountByInfluencerUsername(username: string): Promise<{
  accountId: string;
  influencerId: string;
  mode: AccountMode;
} | null> {
  // Get influencer
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id')
    .eq('username', username)
    .single();

  if (!influencer) return null;

  // Get or create account
  let { data: account } = await supabase
    .from('accounts')
    .select('id, type')
    .eq('legacy_influencer_id', influencer.id)
    .single();

  if (!account) {
    // Create account
    const { data: newAccount } = await supabase
      .from('accounts')
      .insert({
        type: 'creator',
        legacy_influencer_id: influencer.id,
        plan: 'pro',
      })
      .select('id, type')
      .single();

    account = newAccount;
  }

  if (!account) return null;

  return {
    accountId: account.id,
    influencerId: influencer.id,
    mode: account.type as AccountMode,
  };
}



