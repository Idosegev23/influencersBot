import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';

// GET - Get influencer details by username
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const influencer = await getInfluencerByUsername(username);

    if (!influencer) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      influencer: {
        id: influencer.id,
        username: influencer.username,
        display_name: influencer.display_name,
        profile_image_url: influencer.profile_image_url,
      },
    });
  } catch (error: any) {
    console.error('[GET /api/influencer/[username]] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get influencer' },
      { status: 500 }
    );
  }
}
