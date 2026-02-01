import { NextRequest, NextResponse } from 'next/server';
import { getProgress } from '@/lib/scraping-progress';

/**
 * GET /api/influencer/scrape-progress/[username]
 * Get scraping progress for a user
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const resolvedParams = await params;
    const username = resolvedParams.username;

    // Get progress from Redis (or return null if not found)
    const progress = await getProgress(username);

    if (!progress) {
      return NextResponse.json(
        { error: 'No progress found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ progress });
  } catch (error) {
    console.error('Error fetching progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}
