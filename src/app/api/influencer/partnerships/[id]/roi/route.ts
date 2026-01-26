import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/api-helpers';
import { ROICalculator } from '@/lib/roi/calculator';

// GET ROI metrics for a partnership
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partnershipId } = await context.params;

    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const supabase = await createClient();

    // Get ROI tracking
    let { data: roiData, error } = await supabase
      .from('roi_tracking')
      .select('*')
      .eq('partnership_id', partnershipId)
      .single();

    // If doesn't exist, create it
    if (error && error.code === 'PGRST116') {
      const { data: partnership } = await supabase
        .from('partnerships')
        .select('account_id, total_amount')
        .eq('id', partnershipId)
        .single();

      if (!partnership) {
        return NextResponse.json(
          { error: 'שת"פ לא נמצא' },
          { status: 404 }
        );
      }

      const { data: newRoiData } = await supabase
        .from('roi_tracking')
        .insert({
          partnership_id: partnershipId,
          account_id: partnership.account_id,
          total_investment: partnership.total_amount || 0,
        })
        .select()
        .single();

      roiData = newRoiData;
    }

    if (!roiData) {
      return NextResponse.json(
        { error: 'שגיאה בטעינת נתוני ROI' },
        { status: 500 }
      );
    }

    // Calculate comprehensive metrics
    const metrics = ROICalculator.calculate({
      investment: roiData.total_investment || 0,
      revenue: roiData.total_revenue || 0,
      impressions: roiData.total_impressions || 0,
      clicks: roiData.total_clicks || 0,
      conversions: roiData.total_conversions || 0,
    });

    const status = ROICalculator.getROIStatus(metrics.roi_percentage);

    return NextResponse.json({
      success: true,
      roi: {
        ...roiData,
        calculated_metrics: metrics,
        status,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/influencer/partnerships/[id]/roi:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}

// UPDATE ROI tracking
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partnershipId } = await context.params;

    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const supabase = await createClient();
    const body = await request.json();

    // Update ROI tracking
    const { data, error } = await supabase
      .from('roi_tracking')
      .update({
        total_investment: body.total_investment,
        organic_revenue: body.organic_revenue,
        total_impressions: body.total_impressions,
        total_clicks: body.total_clicks,
        updated_at: new Date().toISOString(),
      })
      .eq('partnership_id', partnershipId)
      .select()
      .single();

    if (error) {
      console.error('Error updating ROI tracking:', error);
      return NextResponse.json(
        { error: 'שגיאה בעדכון נתוני ROI' },
        { status: 500 }
      );
    }

    // Sync coupon metrics
    await supabase.rpc('sync_roi_metrics', {
      p_partnership_id: partnershipId,
    });

    return NextResponse.json({
      success: true,
      roi: data,
    });
  } catch (error) {
    console.error('Error in PATCH /api/influencer/partnerships/[id]/roi:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
