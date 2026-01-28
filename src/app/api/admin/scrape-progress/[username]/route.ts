import { NextRequest, NextResponse } from 'next/server';
import { getProgress } from '@/lib/scraping-progress';

/**
 * GET /api/admin/scrape-progress/[username]
 * Get scraping progress for a specific user
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    
    const progress = await getProgress(username);
    
    if (!progress) {
      return NextResponse.json(
        { error: 'No scraping in progress' },
        { status: 404 }
      );
    }

    return NextResponse.json({ progress });
  } catch (error) {
    console.error('Error fetching scrape progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}
