/**
 * GET/PATCH /api/manage/settings
 * Widget settings management for website owners
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateManageSession } from '@/lib/manage/auth';

/**
 * GET — returns widget config (prompt, colors, welcome message)
 */
export async function GET() {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const { data: account, error } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', session.accountId)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const config = account.config || {};
    return NextResponse.json({
      success: true,
      widget: config.widget || {},
      displayName: config.display_name || config.username || '',
      domain: config.widget?.domain || config.username || '',
    });
  } catch (error: any) {
    console.error('[ManageSettings] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH — deep-merges into config.widget (prompt, colors, welcome)
 * Body: { prompt?: {...}, primaryColor?: string, welcomeMessage?: string, ... }
 */
export async function PATCH(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = await createClient();

    // Get current config
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', session.accountId)
      .single();

    if (fetchError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const currentConfig = account.config || {};
    const currentWidget = currentConfig.widget || {};

    // Deep merge: handle prompt sub-object separately for proper merging
    const { prompt: newPrompt, ...otherWidgetFields } = body;
    const updatedWidget = {
      ...currentWidget,
      ...otherWidgetFields,
    };

    if (newPrompt) {
      updatedWidget.prompt = {
        ...(currentWidget.prompt || {}),
        ...newPrompt,
      };
    }

    const updatedConfig = {
      ...currentConfig,
      widget: updatedWidget,
    };

    const { error: updateError } = await supabase
      .from('accounts')
      .update({ config: updatedConfig })
      .eq('id', session.accountId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update settings', details: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, widget: updatedWidget });
  } catch (error: any) {
    console.error('[ManageSettings] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
