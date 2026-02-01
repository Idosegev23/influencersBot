import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sanitizeHtml } from '@/lib/sanitize';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

// GET - List tasks for an influencer with filters
export async function GET(req: NextRequest) {
  try {
    // Auth check with cookie-based auth (no RLS loop)
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const { searchParams } = new URL(req.url);
    const partnershipId = searchParams.get('partnershipId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const type = searchParams.get('type');
    const dueAfter = searchParams.get('dueAfter');
    const dueBefore = searchParams.get('dueBefore');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    const accountId = auth.accountId;

    // Build query with partnership join for better display
    let query = supabase
      .from('tasks')
      .select(`
        *,
        partnership:partnerships(id, brand_name, status)
      `, { count: 'exact' })
      .eq('account_id', accountId);

    // Apply filters
    if (partnershipId) {
      query = query.eq('partnership_id', partnershipId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (priority) {
      query = query.eq('priority', priority);
    }
    if (type) {
      query = query.eq('type', type);
    }
    if (dueAfter) {
      query = query.gte('due_date', dueAfter);
    }
    if (dueBefore) {
      query = query.lte('due_date', dueBefore);
    }

    // Apply pagination and ordering
    const { data: tasks, error, count } = await query
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }

    return NextResponse.json({ 
      tasks: tasks || [], 
      total: count || 0,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST - Create a new task
export async function POST(req: NextRequest) {
  try {
    // Auth check with cookie-based auth (no RLS loop)
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const body = await req.json();
    const {
      partnership_id,
      title,
      description,
      type,
      status,
      priority,
      assignee,
      due_date,
      estimated_hours,
      checklist,
      attachments,
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const accountId = auth.accountId;

    // If partnership_id provided, verify it belongs to this account
    if (partnership_id) {
      const { data: partnership } = await supabase
        .from('partnerships')
        .select('account_id')
        .eq('id', partnership_id)
        .single();

      if (!partnership || partnership.account_id !== accountId) {
        return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
      }
    }

    // Create task
    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        account_id: accountId,
        partnership_id: partnership_id || null,
        title: sanitizeHtml(title),
        description: description ? sanitizeHtml(description) : null,
        type: type || 'general',
        status: status || 'pending',
        priority: priority || 'medium',
        assignee: assignee ? sanitizeHtml(assignee) : null,
        due_date: due_date || null,
        estimated_hours: estimated_hours || null,
        checklist: checklist || [],
        attachments: attachments || [],
      })
      .select(`
        *,
        partnership:partnerships(id, brand_name, status)
      `)
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

