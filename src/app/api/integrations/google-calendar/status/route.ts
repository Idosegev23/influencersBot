import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';

/**
 * GET /api/integrations/google-calendar/status
 * Check if user has connected Google Calendar
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Check if calendar connection exists
    const { data: connection } = await supabase
      .from('google_calendar_connections')
      .select('id, connected_at')
      .eq('account_id', influencer.id)
      .single();

    return NextResponse.json({
      connected: !!connection,
      connectedAt: connection?.connected_at || null,
    });
  } catch (error) {
    console.error('Error checking calendar status:', error);
    return NextResponse.json(
      { connected: false },
      { status: 200 }
    );
  }
}
