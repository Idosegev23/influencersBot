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

// GET - Get a single task by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

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

    // Get task with partnership info
    const { data: task, error } = await supabase
      .from('tasks')
      .select(`
        *,
        partnership:partnerships(id, brand_name, status)
      `)
      .eq('id', id)
      .eq('account_id', account.id)
      .single();

    if (error || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PATCH - Update a task
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { username, ...updates } = body;

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
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

    // Verify task belongs to this account
    const { data: existing } = await supabase
      .from('tasks')
      .select('account_id')
      .eq('id', id)
      .single();

    if (!existing || existing.account_id !== account.id) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Build sanitized updates
    const sanitizedUpdates: Record<string, unknown> = {};
    
    if (updates.partnership_id !== undefined) {
      // Verify partnership belongs to account if provided
      if (updates.partnership_id) {
        const { data: partnership } = await supabase
          .from('partnerships')
          .select('account_id')
          .eq('id', updates.partnership_id)
          .single();

        if (!partnership || partnership.account_id !== account.id) {
          return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
        }
      }
      sanitizedUpdates.partnership_id = updates.partnership_id || null;
    }
    
    if (updates.title !== undefined) {
      sanitizedUpdates.title = sanitizeHtml(updates.title);
    }
    if (updates.description !== undefined) {
      sanitizedUpdates.description = updates.description ? sanitizeHtml(updates.description) : null;
    }
    if (updates.type !== undefined) {
      sanitizedUpdates.type = updates.type;
    }
    if (updates.status !== undefined) {
      sanitizedUpdates.status = updates.status;
      // If marking as completed, set completed_at
      if (updates.status === 'completed') {
        sanitizedUpdates.completed_at = new Date().toISOString();
      }
    }
    if (updates.priority !== undefined) {
      sanitizedUpdates.priority = updates.priority;
    }
    if (updates.assignee !== undefined) {
      sanitizedUpdates.assignee = updates.assignee ? sanitizeHtml(updates.assignee) : null;
    }
    if (updates.due_date !== undefined) {
      sanitizedUpdates.due_date = updates.due_date || null;
    }
    if (updates.estimated_hours !== undefined) {
      sanitizedUpdates.estimated_hours = updates.estimated_hours || null;
    }
    if (updates.actual_hours !== undefined) {
      sanitizedUpdates.actual_hours = updates.actual_hours || null;
    }
    if (updates.checklist !== undefined) {
      sanitizedUpdates.checklist = updates.checklist || [];
    }
    if (updates.attachments !== undefined) {
      sanitizedUpdates.attachments = updates.attachments || [];
    }

    // Update task
    const { data: task, error } = await supabase
      .from('tasks')
      .update(sanitizedUpdates)
      .eq('id', id)
      .select(`
        *,
        partnership:partnerships(id, brand_name, status)
      `)
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE - Delete a task
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
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

    // Verify task belongs to this account
    const { data: existing } = await supabase
      .from('tasks')
      .select('account_id')
      .eq('id', id)
      .single();

    if (!existing || existing.account_id !== account.id) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Delete task
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}

