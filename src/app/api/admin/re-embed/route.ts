/**
 * POST /api/admin/re-embed
 * Re-embed all document chunks for all accounts (or a specific account).
 * Use after switching embedding models (e.g., OpenAI → Gemini).
 *
 * Auth: CRON_SECRET bearer token
 * Body (optional): { accountId?: string }
 *   - If accountId provided, re-embeds only that account
 *   - Otherwise, re-embeds ALL active accounts sequentially
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ingestAllForAccount } from '@/lib/rag/ingest';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

// Allow up to 10 minutes for full re-embed of all accounts
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  try {
    // Auth: Admin cookie OR CRON_SECRET
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;
    const hasCronToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
    if (!hasCronToken) {
      const denied = await requireAdminAuth();
      if (denied) return denied;
    }

    const body = await req.json().catch(() => ({}));
    const { accountId } = body;

    const supabase = createClient();
    const startTime = Date.now();

    // Get accounts to process
    let accountIds: string[];

    if (accountId) {
      accountIds = [accountId];
    } else {
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('id, config')
        .eq('status', 'active');

      if (error || !accounts) {
        return NextResponse.json(
          { error: `Failed to fetch accounts: ${error?.message}` },
          { status: 500 }
        );
      }

      accountIds = accounts.map(a => a.id);
      console.log(`[Re-Embed] Found ${accountIds.length} active accounts`);
    }

    // Process each account
    const results: Array<{
      accountId: string;
      total: number;
      byType: Record<string, number>;
      errors: string[];
      durationMs: number;
    }> = [];

    let totalChunks = 0;
    let totalErrors = 0;

    for (const id of accountIds) {
      const accountStart = Date.now();
      console.log(`[Re-Embed] Processing account ${id} (${results.length + 1}/${accountIds.length})`);

      try {
        const result = await ingestAllForAccount(id);
        const durationMs = Date.now() - accountStart;

        results.push({
          accountId: id,
          total: result.total,
          byType: result.byType,
          errors: result.errors,
          durationMs,
        });

        totalChunks += result.total;
        totalErrors += result.errors.length;

        console.log(`[Re-Embed] Account ${id}: ${result.total} docs in ${Math.round(durationMs / 1000)}s`);
      } catch (err: any) {
        const durationMs = Date.now() - accountStart;
        results.push({
          accountId: id,
          total: 0,
          byType: {},
          errors: [err.message || String(err)],
          durationMs,
        });
        totalErrors++;
        console.error(`[Re-Embed] Account ${id} failed:`, err.message);
      }
    }

    const totalDuration = Math.round((Date.now() - startTime) / 1000);

    console.log(`[Re-Embed] Complete: ${totalChunks} docs across ${accountIds.length} accounts in ${totalDuration}s`);

    return NextResponse.json({
      success: totalErrors === 0,
      accountsProcessed: accountIds.length,
      totalDocuments: totalChunks,
      totalErrors,
      durationSeconds: totalDuration,
      results,
    });
  } catch (error: any) {
    console.error('[Re-Embed] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
