import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

// GET - Get daily task summary
export async function GET(req: NextRequest) {
  try {
    // Auth check with cookie-based auth (no RLS loop)
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const { searchParams } = new URL(req.url);
    const days = searchParams.get('days') ? parseInt(searchParams.get('days')!) : 7;

    const accountId = auth.accountId;

    // Get upcoming tasks (using the helper function from migration)
    const { data: upcomingTasks, error: upcomingError } = await supabase
      .rpc('get_upcoming_tasks', {
        p_account_id: accountId,
        p_days: days
      });

    if (upcomingError) {
      console.error('Error fetching upcoming tasks:', upcomingError);
    }

    // Get task counts by status
    const { data: taskCounts, error: countsError } = await supabase
      .from('tasks')
      .select('status')
      .eq('account_id', account.id)
      .neq('status', 'cancelled');

    if (countsError) {
      console.error('Error fetching task counts:', countsError);
      return NextResponse.json({ error: 'Failed to fetch task counts' }, { status: 500 });
    }

    // Calculate counts
    const statusCounts = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0,
      total: taskCounts?.length || 0
    };

    taskCounts?.forEach(task => {
      if (task.status in statusCounts) {
        statusCounts[task.status as keyof typeof statusCounts]++;
      }
    });

    // Get overdue tasks
    const now = new Date().toISOString();
    const { data: overdueTasks, error: overdueError } = await supabase
      .from('tasks')
      .select(`
        *,
        partnership:partnerships(id, brand_name, status)
      `)
      .eq('account_id', account.id)
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .lt('due_date', now)
      .order('due_date', { ascending: true });

    if (overdueError) {
      console.error('Error fetching overdue tasks:', overdueError);
    }

    // Get tasks completed today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { data: completedToday, error: completedError } = await supabase
      .from('tasks')
      .select('id')
      .eq('account_id', account.id)
      .eq('status', 'completed')
      .gte('completed_at', todayStart.toISOString());

    if (completedError) {
      console.error('Error fetching completed tasks:', completedError);
    }

    // Get tasks by priority
    const { data: highPriorityTasks, error: priorityError } = await supabase
      .from('tasks')
      .select(`
        *,
        partnership:partnerships(id, brand_name, status)
      `)
      .eq('account_id', account.id)
      .in('status', ['pending', 'in_progress'])
      .in('priority', ['high', 'urgent'])
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true })
      .limit(10);

    if (priorityError) {
      console.error('Error fetching high priority tasks:', priorityError);
    }

    return NextResponse.json({
      summary: {
        statusCounts,
        completedToday: completedToday?.length || 0,
        overdueCount: overdueTasks?.length || 0,
        upcomingCount: upcomingTasks?.length || 0,
      },
      upcoming: upcomingTasks || [],
      overdue: overdueTasks || [],
      highPriority: highPriorityTasks || [],
    });
  } catch (error) {
    console.error('Get task summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch task summary' }, { status: 500 });
  }
}

