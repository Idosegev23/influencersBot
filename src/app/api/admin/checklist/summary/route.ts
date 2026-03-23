import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET — returns checklist progress for all accounts (or a specific one)
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');

  const supabase = getSupabase();
  let query = supabase
    .from('account_checklist')
    .select('account_id, completed');

  if (accountId) {
    query = query.eq('account_id', accountId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by account_id
  const progressMap: Record<string, { total: number; completed: number }> = {};
  (data || []).forEach((row: { account_id: string; completed: boolean }) => {
    if (!progressMap[row.account_id]) {
      progressMap[row.account_id] = { total: 0, completed: 0 };
    }
    progressMap[row.account_id].total++;
    if (row.completed) progressMap[row.account_id].completed++;
  });

  return NextResponse.json({ progress: progressMap });
}
