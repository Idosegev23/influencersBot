import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@/lib/supabase/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

async function syncInstagramAndRegeneratePersona(accountId: string, instagramUsername: string) {
  const { runInfluencerScrapeOrchestration } = await import('@/lib/scraping/influencer-scrape-orchestrator');
  await runInfluencerScrapeOrchestration(instagramUsername, accountId, { processWithGemini: true });
}

/**
 * GET /api/influencer/chatbot/persona
 * Fetch current chatbot persona
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const accountId = auth.accountId;

    // Get persona
    const { data: persona, error: personaError } = await supabase
      .from('chatbot_persona')
      .select('*')
      .eq('account_id', accountId)
      .single();

    if (personaError && personaError.code !== 'PGRST116') {
      console.error('Failed to fetch persona:', personaError);
      return NextResponse.json({ error: 'Failed to fetch persona' }, { status: 500 });
    }

    // Return persona or null if not found
    return NextResponse.json({ persona: persona || null });
  } catch (error) {
    console.error('GET /api/influencer/chatbot/persona error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/influencer/chatbot/persona
 * Trigger manual sync from Instagram (starts background job)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const accountId = auth.accountId;
    const username = auth.username;

    // Get account with Instagram username
    const supabase = await createClient();
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, instagram_username')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (!account.instagram_username) {
      return NextResponse.json(
        { error: 'Instagram username not configured' },
        { status: 400 }
      );
    }

    // Start sync in background (don't await it!)
    syncInstagramAndRegeneratePersona(
      account.id,
      account.instagram_username
    ).catch((error) => {
      console.error('Background sync error:', error);
    });

    // Return immediately so UI can start polling for progress
    return NextResponse.json({ 
      success: true,
      message: 'Sync started in background. Check progress for status.',
      username: account.instagram_username,
    });
  } catch (error) {
    console.error('POST /api/influencer/chatbot/persona error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to start sync';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/** Fields that the AI generates and we snapshot before first manual edit */
const AI_SNAPSHOT_FIELDS = [
  'narrative_perspective', 'sass_level', 'storytelling_mode',
  'message_structure', 'emoji_usage', 'common_phrases',
  'voice_rules', 'knowledge_map', 'slang_map',
  'tone', 'bio', 'interests', 'directives', 'greeting_message',
];

/**
 * PATCH /api/influencer/chatbot/persona
 * Update persona fields manually.
 * On first manual edit, saves a snapshot of all AI-generated values.
 * Pass { restore: true } to restore from snapshot.
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const accountId = auth.accountId;
    const body = await req.json();

    // ---------- RESTORE MODE ----------
    if (body.restore === true) {
      const { data: existing } = await supabase
        .from('chatbot_persona')
        .select('ai_snapshot')
        .eq('account_id', accountId)
        .single();

      if (!existing?.ai_snapshot) {
        return NextResponse.json({ error: 'No AI snapshot to restore from' }, { status: 404 });
      }

      const restoreData: any = { updated_at: new Date().toISOString() };
      for (const field of AI_SNAPSHOT_FIELDS) {
        if (existing.ai_snapshot[field] !== undefined) {
          restoreData[field] = existing.ai_snapshot[field];
        }
      }

      const { data: restored, error: restoreError } = await supabase
        .from('chatbot_persona')
        .update(restoreData)
        .eq('account_id', accountId)
        .select()
        .single();

      if (restoreError) {
        console.error('Failed to restore persona:', restoreError);
        return NextResponse.json({ error: 'Failed to restore persona' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        persona: restored,
        message: 'Persona restored from AI snapshot',
      });
    }

    // ---------- NORMAL UPDATE ----------
    const {
      directives, tone, emoji_usage, greeting_message, bio, interests,
      narrative_perspective, sass_level, storytelling_mode, message_structure,
      common_phrases,
    } = body;

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (directives !== undefined) updates.directives = directives;
    if (tone !== undefined) updates.tone = tone;
    if (emoji_usage !== undefined) updates.emoji_usage = emoji_usage;
    if (greeting_message !== undefined) updates.greeting_message = greeting_message;
    if (bio !== undefined) updates.bio = bio;
    if (interests !== undefined) updates.interests = interests;
    if (narrative_perspective !== undefined) updates.narrative_perspective = narrative_perspective;
    if (sass_level !== undefined) updates.sass_level = sass_level;
    if (storytelling_mode !== undefined) updates.storytelling_mode = storytelling_mode;
    if (message_structure !== undefined) updates.message_structure = message_structure;
    if (common_phrases !== undefined) updates.common_phrases = common_phrases;

    // Check if persona exists
    const { data: existingPersona } = await supabase
      .from('chatbot_persona')
      .select('*')
      .eq('account_id', accountId)
      .single();

    let persona;
    if (existingPersona) {
      // Save AI snapshot on first manual edit (only once)
      if (!existingPersona.ai_snapshot) {
        const snapshot: any = {};
        for (const field of AI_SNAPSHOT_FIELDS) {
          if ((existingPersona as any)[field] !== undefined) {
            snapshot[field] = (existingPersona as any)[field];
          }
        }
        updates.ai_snapshot = snapshot;
      }

      const { data, error: updateError } = await supabase
        .from('chatbot_persona')
        .update(updates)
        .eq('account_id', accountId)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update persona:', updateError);
        return NextResponse.json({ error: 'Failed to update persona' }, { status: 500 });
      }
      persona = data;
    } else {
      const { data, error: insertError } = await supabase
        .from('chatbot_persona')
        .insert({
          account_id: accountId,
          name: auth.username || 'Influencer',
          ...updates,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create persona:', insertError);
        return NextResponse.json({ error: 'Failed to create persona' }, { status: 500 });
      }
      persona = data;
    }

    return NextResponse.json({
      success: true,
      persona,
      message: 'Persona updated successfully',
    });
  } catch (error) {
    console.error('PATCH /api/influencer/chatbot/persona error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
