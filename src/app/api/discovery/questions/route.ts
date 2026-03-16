import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getQuestions, submitQuestion, voteQuestion } from '@/lib/discovery/questions-service';

/**
 * GET /api/discovery/questions?username=X&sessionHash=Y
 * Returns current week questions + previous week answers
 */
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  const sessionHash = req.nextUrl.searchParams.get('sessionHash') || 'anonymous';

  if (!username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('config->>username', username)
      .eq('status', 'active')
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const data = await getQuestions(account.id, sessionHash);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Discovery Questions GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/discovery/questions
 * Submit a new question or vote on an existing one
 * Body: { username, action: 'submit' | 'vote', questionText?, questionId?, sessionHash }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, action, questionText, questionId, sessionHash } = body;

    if (!username || !action || !sessionHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient();
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('config->>username', username)
      .eq('status', 'active')
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (action === 'submit') {
      if (!questionText) {
        return NextResponse.json({ error: 'Missing questionText' }, { status: 400 });
      }
      const result = await submitQuestion(account.id, questionText, sessionHash);
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    if (action === 'vote') {
      if (!questionId) {
        return NextResponse.json({ error: 'Missing questionId' }, { status: 400 });
      }
      const result = await voteQuestion(questionId, sessionHash);
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[Discovery Questions POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
