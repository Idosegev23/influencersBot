// ROI Calculator Logic

export interface ROIMetrics {
  investment: number;
  revenue: number;
  roi_percentage: number;
  roi_multiple: number;
  profit: number;
  break_even: boolean;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  ctr?: number;
  conversion_rate?: number;
  cost_per_click?: number;
  cost_per_conversion?: number;
  cost_per_impression?: number;
}

export class ROICalculator {
  /**
   * Calculate comprehensive ROI metrics
   */
  static calculate(params: {
    investment: number;
    revenue: number;
    impressions?: number;
    clicks?: number;
    conversions?: number;
  }): ROIMetrics {
    const {
      investment,
      revenue,
      impressions = 0,
      clicks = 0,
      conversions = 0,
    } = params;

    // Core ROI calculations
    const profit = revenue - investment;
    const roi_percentage =
      investment > 0 ? ((profit / investment) * 100) : 0;
    const roi_multiple = investment > 0 ? (revenue / investment) : 0;
    const break_even = revenue >= investment;

    // Engagement metrics
    const ctr =
      impressions > 0 ? (clicks / impressions) * 100 : 0;
    const conversion_rate =
      clicks > 0 ? (conversions / clicks) * 100 : 0;

    // Cost metrics
    const cost_per_click = clicks > 0 ? investment / clicks : 0;
    const cost_per_conversion =
      conversions > 0 ? investment / conversions : 0;
    const cost_per_impression =
      impressions > 0 ? investment / impressions : 0;

    return {
      investment,
      revenue,
      roi_percentage: Math.round(roi_percentage * 100) / 100,
      roi_multiple: Math.round(roi_multiple * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      break_even,
      impressions,
      clicks,
      conversions,
      ctr: Math.round(ctr * 100) / 100,
      conversion_rate: Math.round(conversion_rate * 100) / 100,
      cost_per_click: Math.round(cost_per_click * 100) / 100,
      cost_per_conversion: Math.round(cost_per_conversion * 100) / 100,
      cost_per_impression: Math.round(cost_per_impression * 1000) / 1000,
    };
  }

  /**
   * Get ROI status (Good, Average, Poor)
   */
  static getROIStatus(roiPercentage: number): {
    status: 'excellent' | 'good' | 'average' | 'poor';
    color: string;
    label: string;
  } {
    if (roiPercentage >= 300) {
      return {
        status: 'excellent',
        color: 'text-green-600',
        label: 'מצוין! ROI גבוה מאוד',
      };
    } else if (roiPercentage >= 100) {
      return {
        status: 'good',
        color: 'text-blue-600',
        label: 'טוב! ROI חיובי',
      };
    } else if (roiPercentage >= 0) {
      return {
        status: 'average',
        color: 'text-orange-600',
        label: 'ממוצע - יש מקום לשיפור',
      };
    } else {
      return {
        status: 'poor',
        color: 'text-red-600',
        label: 'נמוך - הפסד כספי',
      };
    }
  }

  /**
   * Calculate projected ROI based on goals
   */
  static projectROI(params: {
    investment: number;
    target_conversions: number;
    avg_order_value: number;
    profit_margin: number; // As percentage (e.g., 30 for 30%)
  }): {
    projected_revenue: number;
    projected_profit: number;
    projected_roi: number;
  } {
    const { investment, target_conversions, avg_order_value, profit_margin } =
      params;

    const projected_revenue = target_conversions * avg_order_value;
    const profit_from_sales = projected_revenue * (profit_margin / 100);
    const projected_profit = profit_from_sales - investment;
    const projected_roi =
      investment > 0 ? (projected_profit / investment) * 100 : 0;

    return {
      projected_revenue: Math.round(projected_revenue * 100) / 100,
      projected_profit: Math.round(projected_profit * 100) / 100,
      projected_roi: Math.round(projected_roi * 100) / 100,
    };
  }

  /**
   * Compare two partnerships ROI
   */
  static compare(
    partnership1: ROIMetrics,
    partnership2: ROIMetrics
  ): {
    winner: 'partnership1' | 'partnership2' | 'tie';
    difference: number;
    insights: string[];
  } {
    const insights: string[] = [];

    // Compare ROI
    const roiDiff =
      partnership1.roi_percentage - partnership2.roi_percentage;

    if (Math.abs(roiDiff) < 5) {
      insights.push('ROI דומה בין שני השת"פים');
    } else if (roiDiff > 0) {
      insights.push(
        `שת"פ 1 מצליח יותר עם ROI גבוה ב-${Math.abs(roiDiff).toFixed(1)}%`
      );
    } else {
      insights.push(
        `שת"פ 2 מצליח יותר עם ROI גבוה ב-${Math.abs(roiDiff).toFixed(1)}%`
      );
    }

    // Compare conversion rates
    if (partnership1.conversion_rate && partnership2.conversion_rate) {
      const convDiff =
        partnership1.conversion_rate - partnership2.conversion_rate;
      if (Math.abs(convDiff) > 1) {
        insights.push(
          convDiff > 0
            ? 'שת"פ 1 עם conversion rate טוב יותר'
            : 'שת"פ 2 עם conversion rate טוב יותר'
        );
      }
    }

    return {
      winner:
        roiDiff > 5
          ? 'partnership1'
          : roiDiff < -5
          ? 'partnership2'
          : 'tie',
      difference: Math.abs(roiDiff),
      insights,
    };
  }

  /**
   * Generate tracking URL with UTM parameters
   */
  static generateTrackingURL(params: {
    base_url: string;
    campaign: string;
    source: string;
    medium: string;
    coupon_code?: string;
  }): string {
    const { base_url, campaign, source, medium, coupon_code } = params;

    const url = new URL(base_url);
    url.searchParams.set('utm_campaign', campaign);
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', medium);

    if (coupon_code) {
      url.searchParams.set('coupon', coupon_code);
    }

    return url.toString();
  }
}

export default ROICalculator;
