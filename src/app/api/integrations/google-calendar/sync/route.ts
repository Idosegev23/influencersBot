import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-helpers';
import { createClient } from '@/lib/supabase';
import { syncAllToCalendar } from '@/lib/integrations/google-calendar';

/**
 * POST /api/integrations/google-calendar/sync
 * סנכרון ידני של כל הפריטים ללוח השנה
 */
export async function POST(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (authCheck.error) {
    return authCheck.error;
  }

  const supabase = createClient();

  try {
    // Get user's calendar connection
    const { data: connection, error: connError } = await supabase
      .from('calendar_connections')
      .select('id, account_id, sync_enabled')
      .eq('user_id', authCheck.user.id)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'Calendar not connected. Please connect your Google Calendar first.' },
        { status: 404 }
      );
    }

    if (!connection.sync_enabled) {
      return NextResponse.json(
        { error: 'Calendar sync is disabled' },
        { status: 400 }
      );
    }

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('calendar_sync_log')
      .insert({
        calendar_connection_id: connection.id,
        sync_type: 'manual',
        sync_direction: 'to_calendar',
        status: 'success', // Will update if fails
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    try {
      // Perform sync
      const results = await syncAllToCalendar(connection.id, connection.account_id);

      // Update sync log with results
      await supabase
        .from('calendar_sync_log')
        .update({
          status: results.tasks.failed + results.partnerships.failed > 0 ? 'partial' : 'success',
          events_created: results.tasks.created + results.partnerships.created,
          events_updated: results.tasks.updated + results.partnerships.updated,
          errors_count: results.tasks.failed + results.partnerships.failed,
          completed_at: new Date().toISOString(),
          details: results,
        })
        .eq('id', syncLog!.id);

      // Update connection last sync
      await supabase
        .from('calendar_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
        })
        .eq('id', connection.id);

      return NextResponse.json({
        success: true,
        results,
        message: `Synced ${results.tasks.created + results.partnerships.created} events to calendar`,
      });
    } catch (syncError: any) {
      // Update sync log with error
      await supabase
        .from('calendar_sync_log')
        .update({
          status: 'failed',
          error_message: syncError.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog!.id);

      // Update connection
      await supabase
        .from('calendar_connections')
        .update({
          last_sync_status: 'failed',
          last_error: syncError.message,
        })
        .eq('id', connection.id);

      throw syncError;
    }
  } catch (error: any) {
    console.error('Error syncing calendar:', error);
    return NextResponse.json(
      { error: 'Failed to sync calendar', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/integrations/google-calendar/sync
 * קבל סטטוס הסנכרון האחרון
 */
export async function GET(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (authCheck.error) {
    return authCheck.error;
  }

  const supabase = createClient();

  try {
    // Get connection status
    const { data: connection } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', authCheck.user.id)
      .single();

    if (!connection) {
      return NextResponse.json({
        connected: false,
        message: 'Calendar not connected',
      });
    }

    // Get recent sync logs
    const { data: syncLogs } = await supabase
      .from('calendar_sync_log')
      .select('*')
      .eq('calendar_connection_id', connection.id)
      .order('started_at', { ascending: false })
      .limit(10);

    // Get synced events count
    const { count: eventsCount } = await supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true })
      .eq('calendar_connection_id', connection.id)
      .eq('sync_status', 'synced');

    return NextResponse.json({
      connected: true,
      sync_enabled: connection.sync_enabled,
      last_sync_at: connection.last_sync_at,
      last_sync_status: connection.last_sync_status,
      events_synced: eventsCount || 0,
      recent_syncs: syncLogs || [],
    });
  } catch (error: any) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status', details: error.message },
      { status: 500 }
    );
  }
}
