import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/api-helpers';

// Get all notification rules (for admin panel)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user } = authResult;
    const supabase = await createClient();

    // Check if user is admin
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json(
        { error: 'אין הרשאה לצפות בכללים' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('notification_rules')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notification rules:', error);
      return NextResponse.json(
        { error: 'שגיאה בטעינת כללים' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rules: data || [],
    });
  } catch (error) {
    console.error('Error in GET /api/admin/notification-rules:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}

// Create new notification rule (for admin)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user } = authResult;
    const supabase = await createClient();

    // Check if user is admin
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json(
        { error: 'אין הרשאה ליצור כללים' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from('notification_rules')
      .insert({
        name: body.name,
        description: body.description || null,
        trigger_type: body.trigger_type,
        timing_value: body.timing_value || null,
        timing_unit: body.timing_unit || null,
        channels: body.channels || ['in_app'],
        template: body.template || null,
        is_active: body.is_active !== false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating notification rule:', error);
      return NextResponse.json(
        { error: 'שגיאה ביצירת כלל' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rule: data,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/notification-rules:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
