/**
 * POST /api/cron/analyze-conversations
 * ניתוח שיחות יומי - רץ אחרי הסריקה היומית
 * מנתח שיחות מ-24 שעות אחרונות ומעדכן תובנות
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeConversations } from '@/lib/chatbot/conversation-learner';

export async function POST(req: NextRequest) {
  try {
    // Security: Verify cron secret
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Cron] Starting conversation analysis...');

    const supabase = await createClient();

    // Get all active accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, instagram_username')
      .eq('status', 'active');

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        message: 'No active accounts found',
        accountsAnalyzed: 0,
      });
    }

    // Analyze conversations for each account
    const results = [];

    for (const account of accounts) {
      try {
        console.log(`[Cron] Analyzing conversations for @${account.instagram_username}...`);
        
        const result = await analyzeConversations(account.id, 24); // Last 24 hours

        results.push({
          accountId: account.id,
          username: account.instagram_username,
          ...result,
        });

      } catch (error: any) {
        console.error(`[Cron] Failed to analyze @${account.instagram_username}:`, error.message);
        results.push({
          accountId: account.id,
          username: account.instagram_username,
          error: error.message,
        });
      }
    }

    // Calculate totals
    const totals = results.reduce(
      (acc, r) => ({
        insightsCreated: acc.insightsCreated + (r.insightsCreated || 0),
        insightsUpdated: acc.insightsUpdated + (r.insightsUpdated || 0),
        conversationsAnalyzed: acc.conversationsAnalyzed + (r.conversationsAnalyzed || 0),
      }),
      { insightsCreated: 0, insightsUpdated: 0, conversationsAnalyzed: 0 }
    );

    console.log(`[Cron] Analysis complete:`, totals);

    return NextResponse.json({
      success: true,
      message: 'Conversation analysis completed',
      accountsAnalyzed: accounts.length,
      totals,
      details: results,
    });

  } catch (error: any) {
    console.error('[Cron] /analyze-conversations error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
