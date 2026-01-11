/**
 * ============================================
 * Admin API for Rules Management
 * ============================================
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  testRule,
  type CreateRuleInput,
  type UpdateRuleInput,
  type TestRuleInput,
} from '@/engines/decision/db-rule-loader';

// TODO: Add proper admin authentication
async function isAdmin(req: NextRequest): Promise<boolean> {
  // For now, check for admin cookie or API key
  const adminKey = req.headers.get('x-admin-key');
  return adminKey === process.env.ADMIN_API_KEY || adminKey === 'dev-admin';
}

// GET - List rules
export async function GET(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('accountId') || undefined;
  const category = searchParams.get('category') || undefined;
  const mode = searchParams.get('mode') as 'creator' | 'brand' | 'both' | undefined;
  const enabled = searchParams.get('enabled');
  const includeGlobal = searchParams.get('includeGlobal') === 'true';

  const result = await listRules({
    accountId,
    category,
    mode,
    enabled: enabled !== null ? enabled === 'true' : undefined,
    includeGlobal,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ rules: result.rules });
}

// POST - Create or test rule
export async function POST(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { action } = body;

  // Test rule
  if (action === 'test') {
    const testInput: TestRuleInput = {
      rule: body.rule,
      message: body.message,
      intent: body.intent,
      confidence: body.confidence,
      entities: body.entities || {},
      mode: body.mode || 'creator',
    };

    const result = testRule(testInput);
    return NextResponse.json(result);
  }

  // Create rule
  const input: CreateRuleInput = {
    name: body.name,
    description: body.description,
    category: body.category,
    priority: body.priority,
    conditions: body.conditions,
    actions: body.actions,
    mode: body.mode,
    accountId: body.accountId,
    enabled: body.enabled,
  };

  const result = await createRule(input);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ rule: result.rule }, { status: 201 });
}

// PUT - Update rule
export async function PUT(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // Toggle action
  if (body.action === 'toggle') {
    const result = await toggleRule(body.id, body.enabled);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  // Regular update
  const input: UpdateRuleInput = {
    id: body.id,
    name: body.name,
    description: body.description,
    category: body.category,
    priority: body.priority,
    conditions: body.conditions,
    actions: body.actions,
    mode: body.mode,
    enabled: body.enabled,
  };

  const result = await updateRule(input);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ rule: result.rule });
}

// DELETE - Delete rule
export async function DELETE(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Rule ID required' }, { status: 400 });
  }

  const result = await deleteRule(id);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}



