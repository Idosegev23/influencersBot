import { NextRequest, NextResponse } from 'next/server';
import { generateProjectSummary, generateInsights } from '@/lib/project-summary/generator';

/**
 * GET /api/influencer/partnerships/[id]/summary
 * Generate project summary for a partnership
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Generate summary
    const summary = await generateProjectSummary(id);
    
    // Generate insights
    const insights = generateInsights(summary);

    return NextResponse.json({ 
      summary,
      insights,
    });
  } catch (error) {
    console.error('Failed to generate project summary:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
