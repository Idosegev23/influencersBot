/**
 * ============================================
 * Admin API for Experiments Management
 * ============================================
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listExperiments,
  createExperiment,
  toggleExperiment,
  getExperimentResults,
  type CreateExperimentInput,
} from '@/engines/experiments';

// TODO: Add proper admin authentication
async function isAdmin(req: NextRequest): Promise<boolean> {
  const adminKey = req.headers.get('x-admin-key');
  return adminKey === process.env.ADMIN_API_KEY || adminKey === 'dev-admin';
}

// GET - List experiments or get results
export async function GET(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const experimentKey = searchParams.get('experimentKey');

  // Get experiment results
  if (action === 'results' && experimentKey) {
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : undefined;
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : undefined;

    const results = await getExperimentResults(experimentKey, startDate, endDate);
    return NextResponse.json(results);
  }

  // List all experiments
  const result = await listExperiments();

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ experiments: result.experiments });
}

// POST - Create experiment
export async function POST(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  const input: CreateExperimentInput = {
    key: body.key,
    name: body.name,
    description: body.description,
    variants: body.variants,
    allocation: body.allocation,
    targetMode: body.targetMode,
    targetIntents: body.targetIntents,
    enabled: body.enabled,
    startAt: body.startAt ? new Date(body.startAt) : undefined,
    endAt: body.endAt ? new Date(body.endAt) : undefined,
  };

  const result = await createExperiment(input);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ experiment: result.experiment }, { status: 201 });
}

// PUT - Toggle experiment
export async function PUT(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, enabled } = body;

  if (!id || enabled === undefined) {
    return NextResponse.json({ error: 'ID and enabled required' }, { status: 400 });
  }

  const result = await toggleExperiment(id, enabled);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}



