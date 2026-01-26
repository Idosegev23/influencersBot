// Partnership analytics and dashboard data

import { createClient } from '@/lib/supabase';

export interface PartnershipOverview {
  total_partnerships: number;
  active_partnerships: number;
  total_revenue: number;
  pending_revenue: number;
  avg_deal_size: number;
  completion_rate: number;
}

export interface PartnershipPipeline {
  status: string;
  count: number;
  total_value: number;
  percentage: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  count: number;
}

export class PartnershipAnalytics {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabase: ReturnType<typeof createClient>) {
    this.supabase = supabase;
  }

  /**
   * Get partnerships overview
   */
  async getOverview(accountId: string): Promise<PartnershipOverview> {
    try {
      // Get all partnerships
      const { data: partnerships } = await this.supabase
        .from('partnerships')
        .select('status, total_amount')
        .eq('account_id', accountId);

      if (!partnerships || partnerships.length === 0) {
        return this.getDefaultOverview();
      }

      const totalPartnerships = partnerships.length;
      const activePartnerships = partnerships.filter(
        (p) => p.status === 'active' || p.status === 'in_progress'
      ).length;

      const totalRevenue = partnerships
        .filter((p) => p.status === 'completed')
        .reduce((sum, p) => sum + (p.total_amount || 0), 0);

      const pendingRevenue = partnerships
        .filter((p) => p.status !== 'completed' && p.status !== 'cancelled')
        .reduce((sum, p) => sum + (p.total_amount || 0), 0);

      const avgDealSize =
        totalPartnerships > 0
          ? partnerships.reduce((sum, p) => sum + (p.total_amount || 0), 0) /
            totalPartnerships
          : 0;

      const completedCount = partnerships.filter(
        (p) => p.status === 'completed'
      ).length;
      const completionRate =
        totalPartnerships > 0 ? (completedCount / totalPartnerships) * 100 : 0;

      return {
        total_partnerships: totalPartnerships,
        active_partnerships: activePartnerships,
        total_revenue: Math.round(totalRevenue),
        pending_revenue: Math.round(pendingRevenue),
        avg_deal_size: Math.round(avgDealSize),
        completion_rate: Math.round(completionRate * 10) / 10,
      };
    } catch (error) {
      console.error('Error getting partnership overview:', error);
      return this.getDefaultOverview();
    }
  }

  /**
   * Get pipeline breakdown by status
   */
  async getPipeline(accountId: string): Promise<PartnershipPipeline[]> {
    try {
      const { data: partnerships } = await this.supabase
        .from('partnerships')
        .select('status, total_amount')
        .eq('account_id', accountId);

      if (!partnerships || partnerships.length === 0) {
        return [];
      }

      // Group by status
      const grouped = partnerships.reduce((acc, p) => {
        const status = p.status || 'unknown';
        if (!acc[status]) {
          acc[status] = { count: 0, total_value: 0 };
        }
        acc[status].count++;
        acc[status].total_value += p.total_amount || 0;
        return acc;
      }, {} as Record<string, { count: number; total_value: number }>);

      const totalValue = partnerships.reduce(
        (sum, p) => sum + (p.total_amount || 0),
        0
      );

      // Convert to array
      return Object.entries(grouped).map(([status, data]) => ({
        status,
        count: data.count,
        total_value: Math.round(data.total_value),
        percentage:
          totalValue > 0 ? Math.round((data.total_value / totalValue) * 100) : 0,
      }));
    } catch (error) {
      console.error('Error getting pipeline:', error);
      return [];
    }
  }

  /**
   * Get monthly revenue trend
   */
  async getMonthlyRevenue(
    accountId: string,
    months: number = 12
  ): Promise<MonthlyRevenue[]> {
    try {
      const { data: partnerships } = await this.supabase
        .from('partnerships')
        .select('status, total_amount, created_at')
        .eq('account_id', accountId)
        .eq('status', 'completed')
        .order('created_at', { ascending: true });

      if (!partnerships || partnerships.length === 0) {
        return this.generateEmptyMonthlyData(months);
      }

      // Group by month
      const monthlyData = new Map<string, { revenue: number; count: number }>();

      partnerships.forEach((p) => {
        const date = new Date(p.created_at);
        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, '0')}`;

        if (!monthlyData.has(monthKey)) {
          monthlyData.set(monthKey, { revenue: 0, count: 0 });
        }

        const data = monthlyData.get(monthKey)!;
        data.revenue += p.total_amount || 0;
        data.count++;
      });

      // Generate last N months
      const result: MonthlyRevenue[] = [];
      const now = new Date();

      for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, '0')}`;

        const data = monthlyData.get(monthKey) || { revenue: 0, count: 0 };

        result.push({
          month: date.toLocaleDateString('he-IL', {
            month: 'short',
            year: 'numeric',
          }),
          revenue: Math.round(data.revenue),
          count: data.count,
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting monthly revenue:', error);
      return this.generateEmptyMonthlyData(months);
    }
  }

  /**
   * Get upcoming deadlines
   */
  async getUpcomingDeadlines(accountId: string, days: number = 30) {
    try {
      const now = new Date();
      const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      // Get tasks with upcoming deadlines
      const { data: tasks } = await this.supabase
        .from('tasks')
        .select('*, partnerships(id, brand_name, campaign_name)')
        .eq('account_id', accountId)
        .gte('due_date', now.toISOString())
        .lte('due_date', future.toISOString())
        .neq('status', 'completed')
        .order('due_date', { ascending: true })
        .limit(10);

      return tasks || [];
    } catch (error) {
      console.error('Error getting upcoming deadlines:', error);
      return [];
    }
  }

  /**
   * Get partnerships for calendar view
   */
  async getPartnershipsForCalendar(
    accountId: string,
    startDate: string,
    endDate: string
  ) {
    try {
      const { data: partnerships } = await this.supabase
        .from('partnerships')
        .select('id, brand_name, campaign_name, start_date, end_date, status')
        .eq('account_id', accountId)
        .or(`start_date.gte.${startDate},end_date.lte.${endDate}`)
        .order('start_date', { ascending: true });

      return partnerships || [];
    } catch (error) {
      console.error('Error getting partnerships for calendar:', error);
      return [];
    }
  }

  // Helpers
  private getDefaultOverview(): PartnershipOverview {
    return {
      total_partnerships: 0,
      active_partnerships: 0,
      total_revenue: 0,
      pending_revenue: 0,
      avg_deal_size: 0,
      completion_rate: 0,
    };
  }

  private generateEmptyMonthlyData(months: number): MonthlyRevenue[] {
    const result: MonthlyRevenue[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push({
        month: date.toLocaleDateString('he-IL', {
          month: 'short',
          year: 'numeric',
        }),
        revenue: 0,
        count: 0,
      });
    }

    return result;
  }
}

export default PartnershipAnalytics;
