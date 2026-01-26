import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-helpers';
import { getAuthorizationUrl } from '@/lib/integrations/google-calendar';

/**
 * GET /api/integrations/google-calendar/connect
 * התחל OAuth flow - מפנה ל-Google לאישור
 */
export async function GET(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authorized) {
    return authCheck.response!;
  }

  try {
    const authUrl = getAuthorizationUrl(authCheck.user!.id);
    
    return NextResponse.json({
      authUrl,
      message: 'Redirect user to this URL to authorize calendar access',
    });
  } catch (error: any) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL', details: error.message },
      { status: 500 }
    );
  }
}
