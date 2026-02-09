import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Update chat configuration
export async function PATCH(req: NextRequest) {
  try {
    const { accountId, suggested_questions, greeting_message } = await req.json();

    if (!accountId) {
      return NextResponse.json(
        { error: 'Missing accountId' },
        { status: 400 }
      );
    }

    // Get current config
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Update config
    const updates: any = { config: account.config || {} };
    
    if (suggested_questions !== undefined) {
      updates.config.suggested_questions = suggested_questions;
    }
    
    if (greeting_message !== undefined) {
      updates.config.greeting_message = greeting_message;
    }

    const { error: updateError } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', accountId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
