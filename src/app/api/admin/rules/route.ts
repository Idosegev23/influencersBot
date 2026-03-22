import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function checkAdminKey(request: NextRequest): boolean {
  return request.headers.get('x-admin-key') === 'dev-admin';
}

/**
 * GET /api/admin/rules?includeGlobal=true
 * List all decision rules
 */
export async function GET(request: NextRequest) {
  if (!checkAdminKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('decision_rules')
      .select('*')
      .order('priority', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ rules: data || [] });
  } catch (error) {
    console.error('[Rules] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/rules
 * Create rule or test rule
 */
export async function POST(request: NextRequest) {
  if (!checkAdminKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Test mode — evaluate rule against sample input
    if (body.action === 'test') {
      const { rule, message, intent, confidence, entities, mode } = body;
      const matchedConditions = (rule.conditions || []).map((c: { field: string; operator: string; value: unknown }) => {
        const context: Record<string, unknown> = { message, intent, confidence, entities, mode };
        const actual = context[c.field];
        let result = false;
        switch (c.operator) {
          case 'equals': result = actual === c.value; break;
          case 'contains': result = typeof actual === 'string' && actual.includes(String(c.value)); break;
          case 'gt': result = Number(actual) > Number(c.value); break;
          case 'lt': result = Number(actual) < Number(c.value); break;
          case 'gte': result = Number(actual) >= Number(c.value); break;
          default: result = actual === c.value;
        }
        return { field: c.field, expected: c.value, actual, result };
      });

      const matched = matchedConditions.length > 0 && matchedConditions.every((c: { result: boolean }) => c.result);
      return NextResponse.json({
        matched,
        matchedConditions,
        wouldApply: matched ? rule.actions : [],
      });
    }

    // Create new rule
    const supabase = await createClient();
    const { name, description, category, priority, conditions, actions, mode, accountId } = body;

    const { data, error } = await supabase
      .from('decision_rules')
      .insert({
        name,
        description: description || null,
        category: category || 'routing',
        priority: priority || 50,
        conditions: conditions || [],
        actions: actions || [],
        mode: mode || 'both',
        account_id: accountId || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error('[Rules] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/rules
 * Toggle rule enabled/disabled
 */
export async function PUT(request: NextRequest) {
  if (!checkAdminKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, enabled } = body;

    const supabase = await createClient();
    const { error } = await supabase
      .from('decision_rules')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Rules] PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/rules?id=...
 * Delete a rule
 */
export async function DELETE(request: NextRequest) {
  if (!checkAdminKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('decision_rules')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Rules] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
