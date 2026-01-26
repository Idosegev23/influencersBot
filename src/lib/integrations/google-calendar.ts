import { google } from 'googleapis';
import { createClient } from '@/lib/supabase';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL + '/api/integrations/google-calendar/callback';

/**
 * Create Google OAuth2 client
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/**
 * Get authorization URL for Google OAuth
 */
export function getAuthorizationUrl(userId: string): string {
  const oauth2Client = createOAuth2Client();
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    state: userId, // Pass user ID in state
    prompt: 'consent', // Force consent to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  return tokens;
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

/**
 * Get Calendar API client with valid tokens
 */
export async function getCalendarClient(connectionId: string) {
  const supabase = createClient();
  
  // Get connection
  const { data: connection, error } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('id', connectionId)
    .single();
  
  if (error || !connection) {
    throw new Error('Calendar connection not found');
  }
  
  // Check if token needs refresh
  const now = new Date();
  const expiresAt = new Date(connection.token_expires_at);
  
  let accessToken = connection.access_token;
  
  if (expiresAt < new Date(now.getTime() + 5 * 60 * 1000)) {
    // Token expires in < 5 minutes, refresh it
    const newTokens = await refreshAccessToken(connection.refresh_token);
    accessToken = newTokens.access_token!;
    
    // Update tokens in DB
    await supabase
      .from('calendar_connections')
      .update({
        access_token: newTokens.access_token,
        token_expires_at: new Date(now.getTime() + (newTokens.expiry_date || 3600) * 1000).toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', connectionId);
  }
  
  // Create OAuth2 client with access token
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: connection.refresh_token,
  });
  
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Sync task to Google Calendar
 */
export async function syncTaskToCalendar(
  connectionId: string,
  task: {
    id: string;
    title: string;
    description?: string;
    due_at: string;
    partnership_name?: string;
  }
) {
  const supabase = createClient();
  const calendar = await getCalendarClient(connectionId);
  
  // Get connection info
  const { data: connection } = await supabase
    .from('calendar_connections')
    .select('calendar_id')
    .eq('id', connectionId)
    .single();
  
  const calendarId = connection?.calendar_id || 'primary';
  
  // Check if event already exists
  const { data: existingEvent } = await supabase
    .from('calendar_events')
    .select('google_event_id')
    .eq('calendar_connection_id', connectionId)
    .eq('entity_type', 'task')
    .eq('entity_id', task.id)
    .single();
  
  const startTime = new Date(task.due_at);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration
  
  const eventData = {
    summary: task.title,
    description: task.description || `משימה: ${task.title}${task.partnership_name ? `\nשת"פ: ${task.partnership_name}` : ''}`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'Asia/Jerusalem',
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'Asia/Jerusalem',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'email', minutes: 60 },
      ],
    },
  };
  
  let googleEvent;
  
  if (existingEvent?.google_event_id) {
    // Update existing event
    const response = await calendar.events.update({
      calendarId,
      eventId: existingEvent.google_event_id,
      requestBody: eventData,
    });
    googleEvent = response.data;
  } else {
    // Create new event
    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventData,
    });
    googleEvent = response.data;
    
    // Save mapping
    await supabase
      .from('calendar_events')
      .insert({
        calendar_connection_id: connectionId,
        account_id: connection?.account_id,
        entity_type: 'task',
        entity_id: task.id,
        google_event_id: googleEvent.id,
        google_calendar_id: calendarId,
        title: task.title,
        description: task.description,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        google_event_data: googleEvent as any,
      });
  }
  
  return googleEvent;
}

/**
 * Sync partnership to Google Calendar (start & end dates)
 */
export async function syncPartnershipToCalendar(
  connectionId: string,
  partnership: {
    id: string;
    brand_name: string;
    campaign_name: string;
    start_date: string;
    end_date: string;
  }
) {
  const supabase = createClient();
  const calendar = await getCalendarClient(connectionId);
  
  const { data: connection } = await supabase
    .from('calendar_connections')
    .select('calendar_id, account_id')
    .eq('id', connectionId)
    .single();
  
  const calendarId = connection?.calendar_id || 'primary';
  
  // Create event for partnership duration (all-day)
  const eventData = {
    summary: `🤝 ${partnership.brand_name} - ${partnership.campaign_name}`,
    description: `שת"פ עם ${partnership.brand_name}\nקמפיין: ${partnership.campaign_name}`,
    start: {
      date: partnership.start_date.split('T')[0], // All-day format: YYYY-MM-DD
      timeZone: 'Asia/Jerusalem',
    },
    end: {
      date: partnership.end_date.split('T')[0],
      timeZone: 'Asia/Jerusalem',
    },
    colorId: '2', // Green color for partnerships
  };
  
  const response = await calendar.events.insert({
    calendarId,
    requestBody: eventData,
  });
  
  const googleEvent = response.data;
  
  // Save mapping
  await supabase
    .from('calendar_events')
    .insert({
      calendar_connection_id: connectionId,
      account_id: connection?.account_id,
      entity_type: 'partnership',
      entity_id: partnership.id,
      google_event_id: googleEvent.id!,
      google_calendar_id: calendarId,
      title: `${partnership.brand_name} - ${partnership.campaign_name}`,
      start_time: partnership.start_date,
      end_time: partnership.end_date,
      is_all_day: true,
      google_event_data: googleEvent as any,
    });
  
  return googleEvent;
}

/**
 * Delete event from Google Calendar
 */
export async function deleteEventFromCalendar(
  connectionId: string,
  googleEventId: string
) {
  const supabase = createClient();
  const calendar = await getCalendarClient(connectionId);
  
  const { data: connection } = await supabase
    .from('calendar_connections')
    .select('calendar_id')
    .eq('id', connectionId)
    .single();
  
  const calendarId = connection?.calendar_id || 'primary';
  
  try {
    await calendar.events.delete({
      calendarId,
      eventId: googleEventId,
    });
    
    // Mark as deleted in our DB
    await supabase
      .from('calendar_events')
      .update({ sync_status: 'deleted' })
      .eq('calendar_connection_id', connectionId)
      .eq('google_event_id', googleEventId);
      
    return true;
  } catch (error: any) {
    console.error('Failed to delete calendar event:', error);
    return false;
  }
}

/**
 * Sync all pending items to calendar
 */
export async function syncAllToCalendar(
  connectionId: string,
  accountId: string
) {
  const supabase = createClient();
  
  const results = {
    tasks: { created: 0, updated: 0, failed: 0 },
    partnerships: { created: 0, updated: 0, failed: 0 },
  };
  
  // Get all active tasks without calendar events
  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      due_at,
      partnership:partnerships(brand_name, campaign_name)
    `)
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .not('due_at', 'is', null);
  
  // Sync tasks
  for (const task of tasks || []) {
    try {
      await syncTaskToCalendar(connectionId, {
        id: task.id,
        title: task.title,
        description: task.description,
        due_at: task.due_at,
        partnership_name: task.partnership?.brand_name,
      });
      results.tasks.created++;
    } catch (error) {
      console.error(`Failed to sync task ${task.id}:`, error);
      results.tasks.failed++;
    }
  }
  
  // Get all active partnerships
  const { data: partnerships } = await supabase
    .from('partnerships')
    .select('id, brand_name, campaign_name, start_date, end_date')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .not('start_date', 'is', null)
    .not('end_date', 'is', null);
  
  // Sync partnerships
  for (const partnership of partnerships || []) {
    try {
      await syncPartnershipToCalendar(connectionId, partnership);
      results.partnerships.created++;
    } catch (error) {
      console.error(`Failed to sync partnership ${partnership.id}:`, error);
      results.partnerships.failed++;
    }
  }
  
  return results;
}
