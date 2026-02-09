/**
 * POST /api/chat/sandwich
 * Chat endpoint שמשתמש במודל הסנדוויץ' המשולש המלא
 */

import { NextRequest, NextResponse } from 'next/server';
import { processSandwichMessageWithMetadata } from '@/lib/chatbot/sandwichBot';
import { createClient } from '@/lib/supabase/server';
import { 
  getInfluencerByUsername,
  createChatSession,
  saveChatMessage,
  trackEvent,
} from '@/lib/supabase';
import { 
  loadBrandsCached,
  loadContentIndexCached,
} from '@/lib/cached-loaders';
import { getAccountByInfluencerUsername } from '@/engines';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, username, sessionId, responseId } = body;

    if (!message || !username) {
      return NextResponse.json(
        { error: 'message and username are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get influencer by username
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      );
    }

    // ⚡ FIX: Get the correct account (handles legacy_influencer_id mapping)
    const accountInfo = await getAccountByInfluencerUsername(username);
    const accountId = accountInfo?.accountId || influencer.id;

    console.log(`[SandwichBot API] 🔍 Account mapping:`);
    console.log(`   Influencer ID: ${influencer.id}`);
    console.log(`   Account ID: ${accountId}`);
    console.log(`   Using legacy account: ${accountInfo?.accountId ? 'YES ✅' : 'NO'}`);

    // Get or create session
    let currentSessionId: string | null = sessionId;
    if (!currentSessionId) {
      const session = await createChatSession(influencer.id); // ⚡ Use influencer.id for chat_sessions FK
      if (session) {
        currentSessionId = session.id;
        await trackEvent(accountId, 'chat_started', currentSessionId);
      }
    }

    // Get account info for username
    const { data: account } = await supabase
      .from('accounts')
      .select('instagram_username')
      .eq('id', accountId)
      .single();

    const instagramUsername = account?.instagram_username || username;

    // Get conversation history
    let conversationHistory: any[] = [];
    if (currentSessionId) {
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('role, message')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: false })
        .limit(10);

      conversationHistory = (messages || [])
        .reverse()
        .map(msg => ({
          role: msg.role,
          content: msg.message,
        }));
    }

    // Load brands for UI cards
    const brandsResult = await loadBrandsCached(accountId, accountId);
    const brands = brandsResult.data;

    // Process with Sandwich Bot
    console.log('[SandwichBot API] Processing message...');
    
    const result = await processSandwichMessageWithMetadata({
      userMessage: message,
      accountId,
      username: instagramUsername,
      influencerName: influencer.display_name || influencer.username || instagramUsername,
      conversationHistory,
    });

    // Save messages to database
    if (currentSessionId) {
      await Promise.all([
        saveChatMessage(currentSessionId, 'user', message),
        saveChatMessage(currentSessionId, 'assistant', result.response),
        supabase
          .from('chat_sessions')
          .update({ 
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentSessionId),
        trackEvent(accountId, 'message_sent', currentSessionId),
      ]);
    }

    console.log('[SandwichBot API] ✅ Success');

    // Build UI directives based on archetype
    const uiDirectives: any = {
      tone: 'friendly',
      responseLength: 'standard',
      showQuickActions: [],
      showCardList: null,
    };

    // For product recommendation archetype - show brands
    if (result.metadata.archetype === 'ProductRecommendation' && brands.length > 0) {
      uiDirectives.showCardList = 'brands';
      uiDirectives.showQuickActions = [
        'יש עוד המלצות?',
        'מה הקופון הכי שווה?',
      ];
    }

    // For coupon inquiry - show brands
    if (result.metadata.archetype === 'CouponInquiry' && brands.length > 0) {
      uiDirectives.showCardList = 'brands';
    }

    // For support - show support actions
    if (result.metadata.archetype === 'Support') {
      uiDirectives.showQuickActions = [
        'צריך עזרה נוספת',
      ];
    }

    // Build response with UI directives
    const response: Record<string, unknown> = {
      success: true,
      response: result.response,
      responseId: responseId || null,
      sessionId: currentSessionId,
      state: 'Chat.Active',
      uiDirectives,
    };

    // Include brands data if showing card list
    if (uiDirectives.showCardList === 'brands' && brands.length > 0) {
      response.cardsPayload = {
        type: 'brands',
        data: brands.map(b => ({
          id: b.id,
          brand_name: b.brand_name,
          description: b.description,
          coupon_code: b.coupon_code,
          category: b.category,
          link: b.link,
        })),
      };
    }

    // Debug info in development
    if (process.env.NODE_ENV === 'development') {
      response.debug = {
        sandwich: {
          archetype: result.metadata.archetype,
          confidence: result.metadata.confidence,
          guardrailsTriggered: result.metadata.guardrailsTriggered.length,
          personalityApplied: result.metadata.personalityApplied,
        },
      };
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[SandwichBot API] Error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
