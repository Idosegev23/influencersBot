import { createClient } from '@/lib/supabase';

export type ProjectSummary = {
  partnership: {
    id: string;
    brand_name: string;
    campaign_name: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    compensation_amount: number | null;
    description: string | null;
  };
  
  tasks: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    overdue: number;
    completion_rate: number;
    on_time_completion_rate: number;
  };
  
  deliverables: {
    total: number;
    completed: number;
    completion_rate: number;
  };
  
  roi: {
    investment: number;
    revenue: number;
    roi_percentage: number;
    total_impressions: number;
    total_clicks: number;
    total_conversions: number;
    conversion_rate: number;
  } | null;
  
  coupons: {
    total: number;
    total_usages: number;
    total_revenue: number;
    top_coupons: Array<{
      code: string;
      usage_count: number;
      revenue: number;
    }>;
  };
  
  timeline: {
    duration_days: number;
    days_remaining: number | null;
    is_completed: boolean;
    is_overdue: boolean;
  };
  
  generated_at: string;
};

/**
 * Generate comprehensive project summary for a partnership
 */
export async function generateProjectSummary(partnershipId: string): Promise<ProjectSummary> {
  const supabase = createClient();

  // 1. Get partnership details
  const { data: partnership, error: partnershipError } = await supabase
    .from('partnerships')
    .select('*')
    .eq('id', partnershipId)
    .single();

  if (partnershipError || !partnership) {
    throw new Error('Partnership not found');
  }

  // 2. Get tasks summary
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, status, due_date, completed_at')
    .eq('partnership_id', partnershipId);

  const tasksTotal = tasks?.length || 0;
  const tasksCompleted = tasks?.filter(t => t.status === 'completed').length || 0;
  const tasksInProgress = tasks?.filter(t => t.status === 'in_progress').length || 0;
  const tasksPending = tasks?.filter(t => t.status === 'pending').length || 0;
  const tasksOverdue = tasks?.filter(t => 
    t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date()
  ).length || 0;
  
  const tasksCompletionRate = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
  
  // Calculate on-time completion rate
  const completedTasks = tasks?.filter(t => t.status === 'completed') || [];
  const onTimeCompletions = completedTasks.filter(t => {
    if (!t.due_date || !t.completed_at) return true;
    return new Date(t.completed_at) <= new Date(t.due_date);
  }).length;
  const onTimeCompletionRate = completedTasks.length > 0 
    ? Math.round((onTimeCompletions / completedTasks.length) * 100) 
    : 0;

  // 3. Get deliverables (from parsed_data if available)
  const deliverablesTotal = partnership.deliverables_count || 0;
  const deliverablesCompleted = tasksCompleted; // Simplified: assume tasks = deliverables
  const deliverablesCompletionRate = deliverablesTotal > 0 
    ? Math.round((deliverablesCompleted / deliverablesTotal) * 100) 
    : 0;

  // 4. Get ROI data
  const { data: roiData } = await supabase
    .from('roi_tracking')
    .select('*')
    .eq('partnership_id', partnershipId)
    .single();

  const roi = roiData ? {
    investment: roiData.total_investment || 0,
    revenue: roiData.total_revenue || 0,
    roi_percentage: roiData.roi_percentage || 0,
    total_impressions: roiData.total_impressions || 0,
    total_clicks: roiData.total_clicks || 0,
    total_conversions: roiData.total_conversions || 0,
    conversion_rate: roiData.conversion_rate || 0,
  } : null;

  // 5. Get coupons data
  const { data: coupons } = await supabase
    .from('coupons')
    .select(`
      id,
      code,
      usage_count,
      coupon_usages (
        final_amount
      )
    `)
    .eq('partnership_id', partnershipId);

  const totalCoupons = coupons?.length || 0;
  const totalUsages = coupons?.reduce((sum, c) => sum + (c.usage_count || 0), 0) || 0;
  
  const topCoupons = (coupons || [])
    .map(c => ({
      code: c.code,
      usage_count: c.usage_count || 0,
      revenue: (c.coupon_usages || []).reduce((sum: number, u: any) => sum + (u.final_amount || 0), 0),
    }))
    .sort((a, b) => b.usage_count - a.usage_count)
    .slice(0, 5);

  const totalRevenue = topCoupons.reduce((sum, c) => sum + c.revenue, 0);

  // 6. Calculate timeline
  const startDate = partnership.start_date ? new Date(partnership.start_date) : null;
  const endDate = partnership.end_date ? new Date(partnership.end_date) : null;
  const now = new Date();

  let durationDays = 0;
  let daysRemaining: number | null = null;
  let isCompleted = partnership.status === 'completed';
  let isOverdue = false;

  if (startDate && endDate) {
    durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (!isCompleted) {
      daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      isOverdue = daysRemaining < 0;
    }
  }

  return {
    partnership: {
      id: partnership.id,
      brand_name: partnership.brand_name,
      campaign_name: partnership.campaign_name,
      status: partnership.status,
      start_date: partnership.start_date,
      end_date: partnership.end_date,
      compensation_amount: partnership.compensation_amount,
      description: partnership.description,
    },
    tasks: {
      total: tasksTotal,
      completed: tasksCompleted,
      in_progress: tasksInProgress,
      pending: tasksPending,
      overdue: tasksOverdue,
      completion_rate: tasksCompletionRate,
      on_time_completion_rate: onTimeCompletionRate,
    },
    deliverables: {
      total: deliverablesTotal,
      completed: deliverablesCompleted,
      completion_rate: deliverablesCompletionRate,
    },
    roi,
    coupons: {
      total: totalCoupons,
      total_usages: totalUsages,
      total_revenue: totalRevenue,
      top_coupons: topCoupons,
    },
    timeline: {
      duration_days: durationDays,
      days_remaining: daysRemaining,
      is_completed: isCompleted,
      is_overdue: isOverdue,
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Generate insights and recommendations based on project data
 */
export function generateInsights(summary: ProjectSummary): string[] {
  const insights: string[] = [];

  // Task completion insights
  if (summary.tasks.completion_rate === 100) {
    insights.push('🎉 כל המשימות הושלמו בהצלחה!');
  } else if (summary.tasks.overdue > 0) {
    insights.push(`⚠️ יש ${summary.tasks.overdue} משימות באיחור - מומלץ לטפל בהן בהקדם`);
  }

  // On-time completion
  if (summary.tasks.on_time_completion_rate >= 90) {
    insights.push(`✅ ${summary.tasks.on_time_completion_rate}% מהמשימות הושלמו בזמן - ביצועים מצוינים!`);
  } else if (summary.tasks.on_time_completion_rate < 70) {
    insights.push(`⏰ רק ${summary.tasks.on_time_completion_rate}% מהמשימות הושלמו בזמן - כדאי לשפר את ניהול הזמן`);
  }

  // ROI insights
  if (summary.roi) {
    if (summary.roi.roi_percentage > 100) {
      insights.push(`💰 ROI מעולה של ${summary.roi.roi_percentage.toFixed(0)}% - השת"פ משתלם מאוד!`);
    } else if (summary.roi.roi_percentage > 0) {
      insights.push(`📊 ROI חיובי של ${summary.roi.roi_percentage.toFixed(0)}% - השת"פ משתלם`);
    } else if (summary.roi.roi_percentage < 0) {
      insights.push(`📉 ROI שלילי (${summary.roi.roi_percentage.toFixed(0)}%) - כדאי לבחון את האסטרטגיה`);
    }

    if (summary.roi.conversion_rate > 5) {
      insights.push(`🎯 שיעור המרה גבוה (${summary.roi.conversion_rate.toFixed(1)}%) - הקהל מגיב מצוין!`);
    }
  }

  // Coupon insights
  if (summary.coupons.total_usages > 100) {
    insights.push(`🎫 ${summary.coupons.total_usages} שימושים בקופונים - המרה מעולה!`);
  }

  // Timeline insights
  if (summary.timeline.is_overdue) {
    insights.push('⏰ הפרויקט עבר את מועד הסיום - כדאי לסכם ולסגור');
  } else if (summary.timeline.days_remaining && summary.timeline.days_remaining <= 7) {
    insights.push(`⏳ נותרו ${summary.timeline.days_remaining} ימים - דחוף לסיים משימות פתוחות`);
  }

  // Default if no specific insights
  if (insights.length === 0) {
    insights.push('📊 הפרויקט מתקדם כצפוי');
  }

  return insights;
}
