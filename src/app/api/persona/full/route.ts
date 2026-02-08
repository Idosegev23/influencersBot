/**
 * GET /api/persona/full?accountId=xxx
 * מחזיר את כל פרטי הפרסונה כולל gemini_raw_output
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: persona, error } = await supabase
      .from('chatbot_persona')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('[Persona Full API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch persona', details: error.message },
        { status: 500 }
      );
    }

    if (!persona) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      persona,
    });

  } catch (error: any) {
    console.error('[Persona Full API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
