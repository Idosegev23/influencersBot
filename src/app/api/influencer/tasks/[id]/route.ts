import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeHtml } from '@/lib/sanitize';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

// GET - Get a single task by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Auth check with requireInfluencerAuth
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      console.error(`[Tasks GET] Unauthorized access attempt for task ${id}`);
      return auth.response!;
    }

    const accountId = auth.accountId;
    console.log(`[Tasks GET] Fetching task ${id} for account ${accountId}`);

    const supabase = await createClient();

    // Get task with partnership info
    const { data: task, error } = await supabase
      .from('tasks')
      .select(`
        *,
        partnership:partnerships(id, brand_name, status)
      `)
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error) {
      console.error(`[Tasks GET] Database error for task ${id}:`, error);
      return NextResponse.json(
        { error: 'שגיאה בטעינת המשימה', details: error.message },
        { status: 500 }
      );
    }

    if (!task) {
      console.error(`[Tasks GET] Task ${id} not found for account ${accountId}`);
      return NextResponse.json({ error: 'המשימה לא נמצאה' }, { status: 404 });
    }

    console.log(`[Tasks GET] Successfully fetched task ${id}`);
    return NextResponse.json({ task });
  } catch (error) {
    console.error('[Tasks GET] Unexpected error:', error);
    return NextResponse.json(
      { error: 'שגיאה בטעינת המשימה', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
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
    const { ...updates } = body;

    // Auth check with requireInfluencerAuth
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      console.error(`[Tasks PATCH] Unauthorized access attempt for task ${id}`);
      return auth.response!;
    }

    const accountId = auth.accountId;
    console.log(`[Tasks PATCH] Updating task ${id} for account ${accountId}`);

    const supabase = await createClient();

    // Verify task belongs to this account
    const { data: existing } = await supabase
      .from('tasks')
      .select('account_id')
      .eq('id', id)
      .single();

    if (!existing || existing.account_id !== accountId) {
      console.error(`[Tasks PATCH] Task ${id} not found or unauthorized for account ${accountId}`);
      return NextResponse.json({ error: 'המשימה לא נמצאה' }, { status: 404 });
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

        if (!partnership || partnership.account_id !== accountId) {
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
      console.error(`[Tasks PATCH] Database error for task ${id}:`, error);
      return NextResponse.json(
        { error: 'שגיאה בעדכון המשימה', details: error.message },
        { status: 500 }
      );
    }

    console.log(`[Tasks PATCH] Successfully updated task ${id}`);
    return NextResponse.json({ task });
  } catch (error) {
    console.error('[Tasks PATCH] Unexpected error:', error);
    return NextResponse.json(
      { error: 'שגיאה בעדכון המשימה', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a task
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth check with requireInfluencerAuth
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      console.error(`[Tasks DELETE] Unauthorized access attempt for task ${id}`);
      return auth.response!;
    }

    const accountId = auth.accountId;
    console.log(`[Tasks DELETE] Deleting task ${id} for account ${accountId}`);

    const supabase = await createClient();

    // Verify task belongs to this account
    const { data: existing } = await supabase
      .from('tasks')
      .select('account_id')
      .eq('id', id)
      .single();

    if (!existing || existing.account_id !== accountId) {
      console.error(`[Tasks DELETE] Task ${id} not found or unauthorized for account ${accountId}`);
      return NextResponse.json({ error: 'המשימה לא נמצאה' }, { status: 404 });
    }

    // Delete task
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`[Tasks DELETE] Database error for task ${id}:`, error);
      return NextResponse.json(
        { error: 'שגיאה במחיקת המשימה', details: error.message },
        { status: 500 }
      );
    }

    console.log(`[Tasks DELETE] Successfully deleted task ${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tasks DELETE] Unexpected error:', error);
    return NextResponse.json(
      { error: 'שגיאה במחיקת המשימה', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

