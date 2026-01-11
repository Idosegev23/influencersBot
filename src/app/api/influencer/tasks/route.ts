import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { sanitizeHtml } from '@/lib/sanitize';

// Check influencer authentication
async function checkAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_auth_${username}`);
  return authCookie?.value === 'authenticated';
}

// GET - List tasks for an influencer with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const partnershipId = searchParams.get('partnershipId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const type = searchParams.get('type');
    const dueAfter = searchParams.get('dueAfter');
    const dueBefore = searchParams.get('dueBefore');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Get account_id
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('legacy_influencer_id', influencer.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Build query with partnership join for better display
    let query = supabase
      .from('tasks')
      .select(`
        *,
        partnership:partnerships(id, brand_name, status)
      `, { count: 'exact' })
      .eq('account_id', account.id);

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
    const body = await req.json();
    const {
      username,
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

    if (!username || !title) {
      return NextResponse.json({ error: 'Username and title are required' }, { status: 400 });
    }

    // Check authentication
    const isAuth = await checkAuth(username);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Get account_id
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('legacy_influencer_id', influencer.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // If partnership_id provided, verify it belongs to this account
    if (partnership_id) {
      const { data: partnership } = await supabase
        .from('partnerships')
        .select('account_id')
        .eq('id', partnership_id)
        .single();

      if (!partnership || partnership.account_id !== account.id) {
        return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
      }
    }

    // Create task
    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        account_id: account.id,
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

