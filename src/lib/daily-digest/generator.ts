import { createClient } from '@/lib/supabase';

export type DailyDigestData = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  account: {
    id: string;
    name: string;
  };
  summary: {
    date: string;
    dayOfWeek: string;
  };
  yesterday: {
    newPartnerships: number;
    tasksCompleted: number;
    messagesReceived: number;
    couponUsages: number;
  };
  today: {
    tasks: Array<{
      id: string;
      title: string;
      priority: string;
      due_at: string;
      partnership_name?: string;
    }>;
    meetings: Array<{
      id: string;
      title: string;
      start_time: string;
      end_time: string;
    }>;
    deadlines: Array<{
      id: string;
      type: 'task' | 'invoice' | 'partnership';
      title: string;
      due_date: string;
    }>;
  };
  alerts: {
    overdue: Array<{
      type: 'task' | 'payment' | 'response';
      title: string;
      days_overdue: number;
    }>;
    upcoming: Array<{
      type: 'deadline' | 'payment' | 'contract';
      title: string;
      days_until: number;
    }>;
  };
  metrics: {
    activePartnerships: number;
    pendingPayments: number;
    unreadCommunications: number;
    couponPerformance: {
      copied: number;
      used: number;
      revenue: number;
    };
  };
};

/**
 * Generate daily digest data for a user
 */
export async function generateDailyDigest(
  userId: string,
  accountId: string
): Promise<DailyDigestData> {
  const supabase = createClient();

  // Date helpers
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
  const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));
  const endOfToday = new Date(today.setHours(23, 59, 59, 999));

  // Fetch user info
  const { data: user } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('id', userId)
    .single();

  // Fetch account info
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('id', accountId)
    .single();

  // === YESTERDAY'S ACTIVITY ===
  
  // New partnerships created yesterday
  const { count: newPartnerships } = await supabase
    .from('partnerships')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', startOfYesterday.toISOString())
    .lte('created_at', endOfYesterday.toISOString());

  // Tasks completed yesterday
  const { count: tasksCompleted } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'completed')
    .gte('completed_at', startOfYesterday.toISOString())
    .lte('completed_at', endOfYesterday.toISOString());

  // Messages received yesterday (brand communications)
  const { count: messagesReceived } = await supabase
    .from('communication_messages')
    .select(`
      *,
      communication:brand_communications!inner(account_id)
    `, { count: 'exact', head: true })
    .eq('communication.account_id', accountId)
    .eq('sender_type', 'brand')
    .gte('created_at', startOfYesterday.toISOString())
    .lte('created_at', endOfYesterday.toISOString());

  // Coupon usages yesterday
  const { count: couponUsages } = await supabase
    .from('coupon_usages')
    .select(`
      *,
      coupon:coupons!inner(account_id)
    `, { count: 'exact', head: true })
    .eq('coupon.account_id', accountId)
    .gte('used_at', startOfYesterday.toISOString())
    .lte('used_at', endOfYesterday.toISOString());

  // === TODAY'S TASKS ===

  const { data: todayTasks } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      priority,
      due_at,
      partnership:partnerships(id, brand_name, campaign_name)
    `)
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .gte('due_at', startOfToday.toISOString())
    .lte('due_at', endOfToday.toISOString())
    .order('due_at', { ascending: true })
    .limit(10);

  // === UPCOMING DEADLINES (next 3 days) ===

  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  // Task deadlines
  const { data: taskDeadlines } = await supabase
    .from('tasks')
    .select('id, title, due_at')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .gt('due_at', endOfToday.toISOString())
    .lte('due_at', threeDaysFromNow.toISOString())
    .order('due_at', { ascending: true })
    .limit(5);

  // Invoice deadlines
  const { data: invoiceDeadlines } = await supabase
    .from('invoices')
    .select('id, invoice_number, due_date')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .gt('due_date', endOfToday.toISOString())
    .lte('due_date', threeDaysFromNow.toISOString())
    .order('due_date', { ascending: true })
    .limit(5);

  // Partnership end dates
  const { data: partnershipDeadlines } = await supabase
    .from('partnerships')
    .select('id, brand_name, campaign_name, end_date')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .gt('end_date', endOfToday.toISOString())
    .lte('end_date', threeDaysFromNow.toISOString())
    .order('end_date', { ascending: true })
    .limit(5);

  // === ALERTS: OVERDUE ITEMS ===

  // Overdue tasks
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('id, title, due_at')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .lt('due_at', startOfToday.toISOString())
    .order('due_at', { ascending: true })
    .limit(10);

  // Overdue payments
  const { data: overduePayments } = await supabase
    .from('invoices')
    .select('id, invoice_number, due_date, amount')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .lt('due_date', startOfToday.toISOString())
    .order('due_date', { ascending: true })
    .limit(10);

  // Waiting for response (communications)
  const { data: waitingResponse } = await supabase
    .from('brand_communications')
    .select('id, subject, last_message_at, brand_name')
    .eq('account_id', accountId)
    .eq('status', 'waiting_response')
    .lt('last_message_at', new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()) // 3 days ago
    .order('last_message_at', { ascending: true })
    .limit(5);

  // === METRICS ===

  // Active partnerships
  const { count: activePartnerships } = await supabase
    .from('partnerships')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'active');

  // Pending payments
  const { count: pendingPayments } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'pending');

  // Unread communications
  const { data: unreadComms } = await supabase
    .from('brand_communications')
    .select('unread_count')
    .eq('account_id', accountId)
    .gt('unread_count', 0);
  
  const unreadCommunications = unreadComms?.reduce((sum, c) => sum + c.unread_count, 0) || 0;

  // Coupon performance (last 7 days)
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentCoupons } = await supabase
    .from('coupons')
    .select(`
      usage_count,
      coupon_usages(final_amount)
    `)
    .eq('account_id', accountId)
    .gte('created_at', sevenDaysAgo.toISOString());

  const couponsCopied = recentCoupons?.reduce((sum, c) => sum + (c.usage_count || 0), 0) || 0;
  const couponsUsed = recentCoupons?.flatMap(c => c.coupon_usages).length || 0;
  const couponRevenue = recentCoupons
    ?.flatMap(c => c.coupon_usages)
    .reduce((sum: number, usage: any) => sum + (usage?.final_amount || 0), 0) || 0;

  // === COMPILE DIGEST DATA ===

  return {
    user: {
      id: user?.id || userId,
      name: user?.name || 'משתמש',
      email: user?.email || '',
    },
    account: {
      id: account?.id || accountId,
      name: account?.name || '',
    },
    summary: {
      date: today.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }),
      dayOfWeek: today.toLocaleDateString('he-IL', { weekday: 'long' }),
    },
    yesterday: {
      newPartnerships: newPartnerships || 0,
      tasksCompleted: tasksCompleted || 0,
      messagesReceived: messagesReceived || 0,
      couponUsages: couponUsages || 0,
    },
    today: {
      tasks: todayTasks?.map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        due_at: t.due_at,
        partnership_name: t.partnership?.brand_name || t.partnership?.campaign_name,
      })) || [],
      meetings: [], // TODO: Add calendar integration
      deadlines: [
        ...(taskDeadlines?.map(t => ({
          id: t.id,
          type: 'task' as const,
          title: t.title,
          due_date: t.due_at,
        })) || []),
        ...(invoiceDeadlines?.map(i => ({
          id: i.id,
          type: 'invoice' as const,
          title: `חשבונית ${i.invoice_number}`,
          due_date: i.due_date,
        })) || []),
        ...(partnershipDeadlines?.map(p => ({
          id: p.id,
          type: 'partnership' as const,
          title: `סיום שת"פ: ${p.brand_name} - ${p.campaign_name}`,
          due_date: p.end_date,
        })) || []),
      ],
    },
    alerts: {
      overdue: [
        ...(overdueTasks?.map(t => ({
          type: 'task' as const,
          title: t.title,
          days_overdue: Math.floor((today.getTime() - new Date(t.due_at).getTime()) / (24 * 60 * 60 * 1000)),
        })) || []),
        ...(overduePayments?.map(p => ({
          type: 'payment' as const,
          title: `תשלום - ${p.invoice_number} (₪${p.amount})`,
          days_overdue: Math.floor((today.getTime() - new Date(p.due_date).getTime()) / (24 * 60 * 60 * 1000)),
        })) || []),
        ...(waitingResponse?.map(w => ({
          type: 'response' as const,
          title: `${w.brand_name}: ${w.subject}`,
          days_overdue: Math.floor((today.getTime() - new Date(w.last_message_at).getTime()) / (24 * 60 * 60 * 1000)),
        })) || []),
      ],
      upcoming: [],
    },
    metrics: {
      activePartnerships: activePartnerships || 0,
      pendingPayments: pendingPayments || 0,
      unreadCommunications,
      couponPerformance: {
        copied: couponsCopied,
        used: couponsUsed,
        revenue: couponRevenue,
      },
    },
  };
}
