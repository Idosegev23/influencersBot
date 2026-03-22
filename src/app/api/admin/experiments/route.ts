import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function checkAdminKey(request: NextRequest): boolean {
  return request.headers.get('x-admin-key') === 'dev-admin';
}

/**
 * GET /api/admin/experiments
 * List experiments, or get results for a specific experiment
 */
export async function GET(request: NextRequest) {
  if (!checkAdminKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const experimentKey = searchParams.get('experimentKey');
    const supabase = await createClient();

    // Return results for a specific experiment
    if (action === 'results' && experimentKey) {
      const { data: experiment } = await supabase
        .from('experiments')
        .select('id, variants')
        .eq('key', experimentKey)
        .single();

      if (!experiment) {
        return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
      }

      // Get exposures grouped by variant and event type
      const { data: exposures } = await supabase
        .from('experiment_exposures')
        .select('variant_id, event_type')
        .eq('experiment_id', experiment.id);

      const variants = (experiment.variants as Array<{ id: string; name: string }>).map((v) => {
        const variantExposures = (exposures || []).filter(e => e.variant_id === v.id);
        const totalExposures = variantExposures.filter(e => e.event_type === 'exposure').length;
        const conversionEvents = ['coupon_copied', 'link_clicked', 'support_created', 'satisfied', 'unsatisfied'] as const;
        const conversions: Record<string, number> = {};
        const conversionRates: Record<string, number> = {};
        for (const event of conversionEvents) {
          const count = variantExposures.filter(e => e.event_type === event).length;
          conversions[event] = count;
          conversionRates[event] = totalExposures > 0 ? count / totalExposures : 0;
        }
        return {
          variantId: v.id,
          variantName: v.name,
          exposures: totalExposures,
          conversions,
          conversionRates,
        };
      });

      const totalExposures = (exposures || []).filter(e => e.event_type === 'exposure').length;
      return NextResponse.json({ experimentKey, totalExposures, variants });
    }

    // List all experiments
    const { data, error } = await supabase
      .from('experiments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const experiments = (data || []).map(e => ({
      id: e.id,
      key: e.key,
      name: e.name,
      description: e.description,
      variants: e.variants,
      allocation: e.allocation,
      targetMode: e.target_mode,
      targetIntents: e.target_intents,
      enabled: e.enabled,
      startAt: e.start_at,
      endAt: e.end_at,
      createdAt: e.created_at,
    }));

    return NextResponse.json({ experiments });
  } catch (error) {
    console.error('[Experiments] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/experiments
 * Create a new experiment
 */
export async function POST(request: NextRequest) {
  if (!checkAdminKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { key, name, description, allocation, targetMode, variants } = body;

    if (!key || !name) {
      return NextResponse.json({ error: 'key and name are required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Add IDs to variants
    const variantsWithIds = (variants || []).map((v: { name: string; weight: number; uiOverrides: Record<string, unknown> }, i: number) => ({
      id: `v${i}`,
      name: v.name,
      weight: v.weight,
      uiOverrides: v.uiOverrides || {},
    }));

    const { data, error } = await supabase
      .from('experiments')
      .insert({
        key,
        name,
        description: description || null,
        allocation: allocation || 50,
        target_mode: targetMode || 'both',
        variants: variantsWithIds,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ experiment: data });
  } catch (error) {
    console.error('[Experiments] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/experiments
 * Toggle experiment enabled/disabled
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
      .from('experiments')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Experiments] PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
