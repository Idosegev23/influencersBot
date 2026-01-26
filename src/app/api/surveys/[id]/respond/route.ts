import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/surveys/[id]/respond
 * Submit survey response (public endpoint - no auth required)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Parse request body
    const body = await req.json();
    const { score, feedback, questions_answers } = body;

    // Validate score
    if (!score || score < 1 || score > 10) {
      return NextResponse.json(
        { error: 'Score must be between 1 and 10' },
        { status: 400 }
      );
    }

    // Update survey
    const { data: survey, error } = await supabase
      .from('satisfaction_surveys')
      .update({
        score,
        feedback: feedback || null,
        questions_answers: questions_answers || {},
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update survey:', error);
      return NextResponse.json(
        { error: 'Failed to submit survey' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'תודה על המשוב!',
      survey,
    });
  } catch (error) {
    console.error('POST /api/surveys/[id]/respond error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
