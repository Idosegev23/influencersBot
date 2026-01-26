import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { trackInstagramMentions, getBrandedHashtags } from '@/lib/social-listening/instagram-tracker';

/**
 * Cron Job: Social Listening
 * Runs every 6 hours to track Instagram mentions
 * 
 * Schedule: 0 star-slash-6 star star star (every 6 hours)
 */
export async function GET(req: NextRequest) {
  console.log('🔍 Social Listening Cron Job started');

  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient();

    // Get all active accounts with Instagram usernames
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, instagram_username')
      .not('instagram_username', 'is', null);

    if (accountsError) {
      console.error('Failed to fetch accounts:', accountsError);
      return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }

    if (!accounts || accounts.length === 0) {
      console.log('No accounts with Instagram usernames found');
      return NextResponse.json({ success: true, message: 'No accounts to process' });
    }

    console.log(`Processing ${accounts.length} accounts...`);

    const results = [];

    for (const account of accounts) {
      try {
        console.log(`Processing account ${account.id} (@${account.instagram_username})`);

        // Get branded hashtags for this account
        const hashtags = await getBrandedHashtags(account.id);

        // Track mentions
        const result = await trackInstagramMentions(
          account.id,
          account.instagram_username,
          hashtags
        );

        results.push({
          accountId: account.id,
          username: account.instagram_username,
          success: true,
          mentionsCount: result.count,
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to process account ${account.id}:`, error);
        results.push({
          accountId: account.id,
          username: account.instagram_username,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalMentions = results.reduce((sum, r) => sum + (r.mentionsCount || 0), 0);

    console.log(`✅ Social Listening completed: ${successCount}/${accounts.length} accounts processed, ${totalMentions} mentions tracked`);

    return NextResponse.json({
      success: true,
      message: `Processed ${accounts.length} accounts`,
      results,
      summary: {
        totalAccounts: accounts.length,
        successCount,
        failureCount: accounts.length - successCount,
        totalMentions,
      },
    });
  } catch (error) {
    console.error('Social Listening Cron Job error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
