/**
 * POST /api/influencer/settings — Save widget & persona settings
 * Authenticated via influencer session cookie (same as other /api/influencer/* routes)
 *
 * Body: { username, widget?, theme?, greeting_message?, suggested_questions?, persona?, ... }
 * Writes to accounts.config (merges widget sub-object) + chatbot_persona
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

const COOKIE_PREFIX = 'influencer_session_';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 });
    }

    // ── Auth: verify influencer session cookie ──
    const cookieStore = await cookies();
    const session = cookieStore.get(`${COOKIE_PREFIX}${username}`);
    if (session?.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // ── Find account by username ──
    const { data: account, error: fetchErr } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('config->>username', username)
      .eq('status', 'active')
      .maybeSingle();

    if (fetchErr || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const currentConfig = account.config || {};

    // ── Build updated config ──
    const updatedConfig = { ...currentConfig };

    // Widget-specific fields (what widget.js reads via /api/widget/config)
    if (body.widget) {
      updatedConfig.widget = {
        ...(currentConfig.widget || {}),
        ...body.widget,
      };
    }

    // Theme (colors, fonts, darkMode)
    if (body.theme) {
      updatedConfig.theme = body.theme;
    }

    // Greeting message
    if (body.greeting_message !== undefined) {
      updatedConfig.greeting_message = body.greeting_message;
    }

    // Suggested questions
    if (body.suggested_questions !== undefined) {
      updatedConfig.suggested_questions = body.suggested_questions;
    }

    // White-label
    if (body.hide_branding !== undefined) {
      updatedConfig.hide_branding = body.hide_branding;
    }
    if (body.custom_logo_url !== undefined) {
      updatedConfig.custom_logo_url = body.custom_logo_url;
    }

    // Scrape settings
    if (body.scrape_settings !== undefined) {
      updatedConfig.scrape_settings = body.scrape_settings;
    }

    // Phone / WhatsApp
    if (body.phone_number !== undefined) {
      updatedConfig.phone_number = body.phone_number;
    }
    if (body.whatsapp_enabled !== undefined) {
      updatedConfig.whatsapp_enabled = body.whatsapp_enabled;
    }

    // Persona preferences stored in config (emoji_style has no DB column)
    if (body.persona?.emoji_style !== undefined) {
      updatedConfig.persona_emoji_style = body.persona.emoji_style;
    }

    // ── Write config back ──
    const { error: updateErr } = await supabase
      .from('accounts')
      .update({ config: updatedConfig, updated_at: new Date().toISOString() })
      .eq('id', account.id);

    if (updateErr) {
      console.error('[influencer/settings] DB update error:', updateErr);
      return NextResponse.json(
        { error: 'Failed to save settings', details: updateErr.message },
        { status: 500 },
      );
    }

    // ── Update chatbot_persona if persona fields were sent ──
    if (body.persona) {
      const personaUpdate: Record<string, unknown> = {};
      if (body.persona.tone !== undefined) personaUpdate.tone = body.persona.tone;
      if (body.persona.style !== undefined) personaUpdate.response_style = body.persona.style;
      if (body.persona.interests !== undefined) personaUpdate.topics = body.persona.interests;
      if (body.persona.signature_phrases !== undefined) personaUpdate.common_phrases = body.persona.signature_phrases;
      if (body.persona.language !== undefined) personaUpdate.language = body.persona.language;

      if (Object.keys(personaUpdate).length > 0) {
        personaUpdate.updated_at = new Date().toISOString();
        const { error: personaErr } = await supabase
          .from('chatbot_persona')
          .update(personaUpdate)
          .eq('account_id', account.id);

        if (personaErr) {
          console.warn('[influencer/settings] Persona update warning:', personaErr.message);
          // Non-fatal — config was already saved
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[influencer/settings] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}
