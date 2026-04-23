import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAKE_WEBHOOK_URL =
  process.env.MAKE_CONFERENCE_WEBHOOK_URL ||
  'https://hook.eu2.make.com/qlwzzdxydlt9dqjurisuseis1jkgswx3';

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

const CONFERENCE = {
  name: 'כנס החדשנות - איגוד השיווק הישראלי',
  date: '2026-04-30',
  talk: 'AI - להיות או לא להיות',
  speaker: 'איתמר גונשרוביץ',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fullName,
      email,
      phone,
      companyName,
      role,
      companySize,
      industry,
      primaryArea,
      topics,
      currentAiUsage,
      painPoint,
      readiness,
      preferredProduct,
      aiInOrg,
      hasDefinedPain,
      decisionAuthority,
      timelineMonths,
      sessionId,
      messageCount,
      durationSeconds,
      lastUserMessage,
      botSummary,
      transcriptAvailable,
      sourceParam,
      utmSource,
      utmMedium,
      utmCampaign,
      landingUrl,
      referrer,
      userAgent,
      platform,
      locale,
      accountId,
    } = body;

    if (!fullName || !phone) {
      return NextResponse.json({ error: 'Missing required fields (fullName, phone)' }, { status: 400 });
    }

    const effectiveAccountId = accountId || LDRS_ACCOUNT_ID;

    const { data: brief, error: dbError } = await supabase
      .from('service_briefs')
      .insert({
        account_id: effectiveAccountId,
        full_name: fullName,
        business_name: companyName || null,
        email: email || null,
        phone: phone || null,
        service_name: 'Conference Lead — AI Conference',
        product_description: currentAiUsage || null,
        goal: primaryArea || null,
        notes: JSON.stringify({
          painPoint: painPoint || null,
          readiness: readiness || null,
          preferredProduct: preferredProduct || null,
          role: role || null,
          companySize: companySize || null,
          industry: industry || null,
          botSummary: botSummary || null,
          topics: topics || [],
        }),
        session_id: sessionId || null,
        status: 'new',
      })
      .select('id, created_at')
      .single();

    if (dbError) {
      console.error('[conference-lead] DB insert error:', dbError);
    }

    const leadId = brief?.id || `conf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const chatUrl = sessionId
      ? `https://bestie.ldrsgroup.com/chat/ldrs_group?session=${sessionId}`
      : 'https://bestie.ldrsgroup.com/chat/ldrs_group';

    const payload = {
      source: 'conference',
      conference: CONFERENCE,
      lead_id: leadId,
      session_id: sessionId || null,
      timestamp: new Date().toISOString(),
      contact: {
        full_name: fullName,
        email: email || null,
        phone,
        company_name: companyName || null,
        role: role || null,
        company_size: companySize || null,
        industry: industry || null,
      },
      interest: {
        primary_area: primaryArea || null,
        topics: topics || [],
        current_ai_usage: currentAiUsage || null,
        pain_point: painPoint || null,
        readiness: readiness || null,
        budget_range: null,
        preferred_product: preferredProduct || null,
      },
      conversation: {
        message_count: messageCount || 0,
        duration_seconds: durationSeconds || 0,
        last_user_message: lastUserMessage || null,
        bot_summary: botSummary || null,
        qualifying_answers: {
          ai_in_org: typeof aiInOrg === 'boolean' ? aiInOrg : null,
          has_defined_pain: typeof hasDefinedPain === 'boolean' ? hasDefinedPain : null,
          decision_authority: decisionAuthority || null,
          timeline_months: typeof timelineMonths === 'number' ? timelineMonths : null,
        },
        chat_url: chatUrl,
        transcript_available: typeof transcriptAvailable === 'boolean' ? transcriptAvailable : false,
      },
      attribution: {
        source_param: sourceParam || 'conf',
        utm_source: utmSource || 'qr_code',
        utm_medium: utmMedium || 'conference',
        utm_campaign: utmCampaign || 'innovation_conf_2026',
        landing_url: landingUrl || null,
        referrer: referrer || null,
      },
      device: {
        user_agent: userAgent || req.headers.get('user-agent') || null,
        platform: platform || null,
        locale: locale || 'he-IL',
      },
      assigned_to: {
        email: process.env.CONFERENCE_LEAD_OWNER_EMAIL || 'roi@ldrsgroup.com',
        name: process.env.CONFERENCE_LEAD_OWNER_NAME || 'רועי',
      },
      _meta: {
        is_test: false,
        schema_version: 'v1',
      },
    };

    fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => console.error('[conference-lead] Make webhook failed:', err));

    return NextResponse.json({
      success: true,
      leadId,
    });
  } catch (err) {
    console.error('[conference-lead] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
