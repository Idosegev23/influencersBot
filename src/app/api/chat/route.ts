import { NextRequest, NextResponse } from 'next/server';
import { chat, buildInfluencerInstructions } from '@/lib/openai';
import { 
  getInfluencerBySubdomain,
  getInfluencerByUsername, 
  createChatSession, 
  saveChatMessage,
  getProductsByInfluencer,
  getContentByInfluencer,
  trackEvent,
  supabase,
} from '@/lib/supabase';
import {
  sanitizeChatMessage,
  sanitizeUsername,
  isValidSessionId,
  isValidResponseId,
} from '@/lib/sanitize';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Sanitize inputs
    const rawIdentifier = body.username || body.subdomain;
    const identifier = rawIdentifier ? sanitizeUsername(rawIdentifier) : null;
    const message = body.message ? sanitizeChatMessage(body.message) : null;
    const sessionId = body.sessionId && isValidSessionId(body.sessionId) ? body.sessionId : null;
    const responseId = body.responseId && isValidResponseId(body.responseId) ? body.responseId : null;

    if (!identifier || !message) {
      return NextResponse.json(
        { error: 'Username/subdomain and message are required' },
        { status: 400 }
      );
    }

    // Get influencer - try by username first, then by subdomain
    let influencer = await getInfluencerByUsername(identifier);
    if (!influencer) {
      influencer = await getInfluencerBySubdomain(identifier);
    }
    if (!influencer) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      );
    }

    if (!influencer.persona) {
      return NextResponse.json(
        { error: 'Influencer not configured properly' },
        { status: 500 }
      );
    }

    // Get or create session
    let currentSessionId: string | null = sessionId;
    if (!currentSessionId) {
      const session = await createChatSession(influencer.id);
      if (session) {
        currentSessionId = session.id;
        // Track chat started
        await trackEvent(influencer.id, 'chat_started', currentSessionId);
      }
    }

    // Build context from products and content
    let context = '';
    
    // Get products
    const products = await getProductsByInfluencer(influencer.id);
    if (products.length > 0) {
      context += '## מוצרים וקופונים:\n';
      products.forEach((p) => {
        context += `- ${p.name}`;
        if (p.brand) context += ` (${p.brand})`;
        if (p.coupon_code) context += ` - קופון: ${p.coupon_code}`;
        if (p.link) context += ` - לינק: ${p.link}`;
        context += '\n';
      });
    }

    // Get content for food influencers
    if (influencer.influencer_type === 'food') {
      const content = await getContentByInfluencer(influencer.id);
      const recipes = content.filter((c) => c.type === 'recipe').slice(0, 10);
      if (recipes.length > 0) {
        context += '\n## מתכונים:\n';
        recipes.forEach((r) => {
          context += `- ${r.title}`;
          if (r.description) context += `: ${r.description.slice(0, 100)}`;
          context += '\n';
        });
      }
    }

    // Build instructions
    const instructions = buildInfluencerInstructions(
      influencer.display_name,
      influencer.persona,
      influencer.influencer_type,
      context
    );

    // Use Responses API with previous_response_id for multi-turn
    const result = await chat(
      instructions,
      message,
      responseId || undefined
    );

    // Save messages to database
    if (currentSessionId) {
      await saveChatMessage(currentSessionId, 'user', message);
      await saveChatMessage(currentSessionId, 'assistant', result.response);
      
      // Update session with response ID for next turn
      await supabase
        .from('chat_sessions')
        .update({ thread_id: result.responseId })
        .eq('id', currentSessionId);
      
      // Track message
      await trackEvent(influencer.id, 'message_sent', currentSessionId);
    }

    return NextResponse.json({
      success: true,
      response: result.response,
      responseId: result.responseId,
      sessionId: currentSessionId,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    );
  }
}
