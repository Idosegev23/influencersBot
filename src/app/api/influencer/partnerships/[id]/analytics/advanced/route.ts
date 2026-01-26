import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedCouponAnalytics } from '@/lib/analytics/coupons-advanced';

/**
 * GET /api/influencer/partnerships/[id]/analytics/advanced
 * Get advanced coupon analytics for a partnership
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const analytics = await getAdvancedCouponAnalytics(id);

    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('Failed to get advanced analytics:', error);
    return NextResponse.json(
      { error: 'Failed to get analytics' },
      { status: 500 }
    );
  }
}
