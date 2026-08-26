/**
 * GET /api/chat/init
 * אתחול session + טעינת הודעת ברכה
 * Also fire-and-forget pre-warms RAG cache for suggested queries
 */

import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccountByUsername } from '@/lib/supabase';
import { prewarmSuggestionRAG } from '@/lib/suggestion-cache';
import { demoAccessFromConfig, demoExpiredBody } from '@/lib/demo/guard';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Get account using the helper function
    const account = await getAccountByUsername(username);

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Expired demo — no session bootstrap. The page renders the lock screen
    // instead; accounts without config.demo resolve to 'open'.
    const demoAccess = demoAccessFromConfig((account as any)?.config);
    if (demoAccess.state === 'locked') {
      return NextResponse.json(demoExpiredBody(demoAccess), { status: 403 });
    }

    const supabase = await createClient();

    // Load persona
    const { data: persona } = await supabase
      .from('chatbot_persona')
      .select('name, voice_rules, knowledge_map')
      .eq('account_id', account.id)
      .single();

    // Extract display name and config
    const config = (account.config || {}) as any;
    const displayName = config.display_name || username;

    // ── Check if media_news account ──
    const isMediaNews = config.archetype === 'media_news';

    // ── Greeting: prefer user-configured, fallback to auto-generated ──
    let greeting: string;
    let quickReplies: string[];
    const topicSuggestions: string[] = [];
    // Coupon/price fillers make no sense for service orgs, public bodies,
    // membership associations or B2B platforms — none of them sell at a discount.
    const hasCommercialSuggestions =
      !['service_provider', 'government_ministry', 'association', 'b2b_saas', 'saas_product'].includes(
        config.archetype,
      ) && config.coupons_disabled !== true;

    // Suggestion templates. This whole branch used to be hardcoded Hebrew with no
    // language check, so an English account's pills came out as
    // "מה חדש בMotorcoach Industry Advocacy?" — a Hebrew template glued to an
    // English topic name, without even a space.
    const isEnAccount = (account as any).language === 'en';
    const SUG = isEnAccount
      ? {
          tellMeAbout: (n: string) => `Tell me about ${n}`,
          whatsNewIn: (n: string) => `What's new with ${n}?`,
          tellMeMore: 'Tell me more',
          anyCoupons: 'Any offers?',
          couponQ: 'Any discount codes?',
          bestNow: "What's worth it right now?",
          fallbackGreeting: (n: string) => `Hi! I'm the ${n} assistant.`,
          greetingHelp: '\nHow can I help?',
        }
      : {
          tellMeAbout: (n: string) => `ספר/י לי על ${n}`,
          whatsNewIn: (n: string) => `מה חדש ב${n}?`,
          tellMeMore: 'ספרו לי עוד',
          anyCoupons: 'יש קופונים?',
          couponQ: 'יש קופון הנחה?',
          bestNow: 'מה הכי שווה עכשיו?',
          fallbackGreeting: (n: string) => `שלום! אני הבוט של ${n}`,
          greetingHelp: '\nאיך אפשר לעזור?',
        };

    if (isMediaNews) {
      // Media/News accounts: greeting with hot topics
      const { getTopHotTopics } = await import('@/lib/hot-topics/query');
      const hotTopics = await getTopHotTopics(3, ['breaking', 'hot']);

      if (hotTopics.length > 0) {
        const statusMarker = (s: string) => s === 'breaking' ? '[BREAKING]' : '[HOT]';
        greeting = `מה קורה! הנה מה שחם עכשיו:`;
        for (const topic of hotTopics) {
          const summary = topic.summary || topic.topic_name;
          greeting += `\n${statusMarker(topic.status)} ${summary}`;
        }
        greeting += `\n\nעל מה תרצו לשמוע?`;

        quickReplies = hotTopics.map((t) => `ספרו לי על ${t.topic_name}`);
        quickReplies.push('מה עוד חם?');

        // Topic suggestions from hot topics
        for (const topic of hotTopics) {
          topicSuggestions.push(`ספרו לי על ${topic.topic_name}`);
          topicSuggestions.push(`מה חדש ב${topic.topic_name}?`);
        }
        topicSuggestions.push('מה חדש?', 'מה הטרנד?', 'מה עוד חם?');
      } else {
        // No hot topics yet — fallback
        greeting = `שלום! אני הבוט של ${persona?.name || displayName}`;
        greeting += `\nשאלו אותי מה חדש בעולם הבידור!`;
        quickReplies = ['מה חדש?', 'מה חם עכשיו?', 'ספרו לי על הריאליטי'];
        topicSuggestions.push('מה חדש?', 'מה חם עכשיו?', 'חדשות סלבס');
      }
    } else {
      // Regular accounts: existing behavior
      if (config.greeting_message) {
        greeting = config.greeting_message;
      } else {
        greeting = SUG.fallbackGreeting(persona?.name || displayName);
        greeting += persona?.voice_rules?.tone && !isEnAccount
          ? `\nאני כאן כדי לעזור לך עם שאלות, המלצות וקופונים בלעדיים. במה אפשר לעזור?`
          : SUG.greetingHelp;
      }

      // ── Quick replies: prefer user-configured, fallback to persona topics ──
      if (config.suggested_questions?.length > 0) {
        quickReplies = config.suggested_questions;
      } else {
        quickReplies = [];
        if (persona?.knowledge_map?.coreTopics?.length > 0) {
          const topTopics = persona.knowledge_map.coreTopics.slice(0, 3);
          quickReplies.push(...topTopics.map((t: any) => SUG.tellMeAbout(t.name)));
        }
        quickReplies.push(hasCommercialSuggestions ? SUG.anyCoupons : SUG.tellMeMore);
      }

      // Build topic-based suggestion pool for fast follow-ups
      if (config.suggested_questions?.length > 0) {
        topicSuggestions.push(...config.suggested_questions);
      }
      if (persona?.knowledge_map?.coreTopics?.length > 0) {
        for (const topic of persona.knowledge_map.coreTopics.slice(0, 8)) {
          const name = topic.name || topic;
          if (typeof name === 'string' && name.length > 0 && name.length < 30) {
            topicSuggestions.push(SUG.whatsNewIn(name));
            topicSuggestions.push(SUG.tellMeAbout(name));
          }
        }
      }
      if (hasCommercialSuggestions) {
        topicSuggestions.push(SUG.couponQ, SUG.bestNow);
      }
      topicSuggestions.push(SUG.tellMeMore);
    }

    // Load partnerships count for marketing disclaimer
    const { count: partnershipsCount } = await supabase
      .from('partnerships')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id);

    // Pre-warm RAG cache (NOT LLM) AFTER response is sent (Lambda stays alive via after())
    // This is cheap — only DB vector search, no AI model calls
    const allSuggestions = [...quickReplies, ...topicSuggestions.slice(0, 6)];
    const suggestionsToPrewarm = allSuggestions.slice(0, 4);
    after(async () => {
      console.log(`[Chat Init] after() starting RAG prewarm for ${suggestionsToPrewarm.length} suggestions (no LLM)`);
      try {
        await prewarmSuggestionRAG(account.id, suggestionsToPrewarm);
        console.log(`[Chat Init] after() RAG prewarm completed`);
      } catch (err: any) {
        console.error('[Chat Init] after() RAG prewarm failed:', err.message);
      }
    });

    return NextResponse.json({
      greeting,
      quickReplies,
      topicSuggestions,
      hasCommercialContent: (partnershipsCount || 0) > 0,
      accountId: account.id,
      displayName,
    });

  } catch (error: any) {
    console.error('[Chat Init] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

