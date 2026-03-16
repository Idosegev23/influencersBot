import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateWeeklyAnswers } from '@/lib/discovery/questions-service';

/**
 * POST /api/discovery/questions/answer
 * Weekly cron: generate answers for top 5 questions of each account
 */
export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient();

    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('type', 'creator')
      .eq('status', 'active');

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ success: true, answered: 0, message: 'No active accounts' });
    }

    let totalAnswered = 0;
    for (const account of accounts) {
      try {
        const name = account.config?.display_name || account.config?.username || 'Unknown';
        const answered = await generateWeeklyAnswers(account.id, name);
        totalAnswered += answered;
        if (answered > 0) {
          console.log(`[Discovery Answers] ${name}: answered ${answered} questions`);
        }
      } catch (err) {
        console.error(`[Discovery Answers] Failed for ${account.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      answered: totalAnswered,
      accounts: accounts.length,
    });
  } catch (err) {
    console.error('[Discovery Answers]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
