import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadBriefToDrive, sendBriefEmail } from '@/lib/google-workspace';
import { buildConferenceLeadEmail } from '@/lib/email-templates/conference-lead';

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

    // Build the branded HTML email body
    const _test_to = body._test_to as string | undefined;
    const isValidTestOverride =
      typeof _test_to === 'string' && /^[\w.+-]+@ldrsgroup\.com$/i.test(_test_to);
    const ownerEmail = isValidTestOverride
      ? _test_to
      : process.env.CONFERENCE_LEAD_OWNER_EMAIL || 'roi@ldrsgroup.com';

    const emailContent = buildConferenceLeadEmail({
      fullName,
      phone,
      email: email || null,
      companyName: companyName || null,
      role: role || null,
      preferredProduct: preferredProduct || null,
      primaryArea: primaryArea || null,
      currentAiUsage: currentAiUsage || null,
      painPoint: painPoint || null,
      readiness: readiness || null,
      lastUserMessage: lastUserMessage || null,
      botSummary: botSummary || null,
      chatUrl,
      createdAt: brief?.created_at,
    });

    // Use Next.js `after` hook so the email + drive work is guaranteed to
    // complete even after the response has been sent (Vercel lambdas may
    // otherwise terminate fire-and-forget async work before it finishes).
    const hasServiceAccountKey = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    after(async () => {
      console.log(
        `[conference-lead] sendBriefEmail starting | to=${ownerEmail} | service_account_key_present=${hasServiceAccountKey}`
      );
      try {
        const ok = await sendBriefEmail({
          to: ownerEmail,
          subject: emailContent.subject,
          htmlBody: emailContent.html,
        });
        console.log(`[conference-lead] sendBriefEmail result | ok=${ok}`);
        if (ok && brief?.id) {
          await supabase
            .from('service_briefs')
            .update({ email_sent: true })
            .eq('id', brief.id);
        }
      } catch (err) {
        console.error('[conference-lead] sendBriefEmail threw:', err);
      }

      try {
        const driveRes = await uploadBriefToDrive({
          title: `ליד מהכנס — ${fullName}${preferredProduct ? ` — ${preferredProduct}` : ''} — ${new Date().toLocaleDateString('he-IL')}`,
          htmlBody: emailContent.html,
        });
        console.log(`[conference-lead] uploadBriefToDrive ok | fileId=${driveRes.fileId}`);
        if (brief?.id) {
          await supabase
            .from('service_briefs')
            .update({
              drive_file_id: driveRes.fileId,
              drive_file_url: driveRes.webViewLink,
            })
            .eq('id', brief.id);
        }
      } catch (err) {
        console.error('[conference-lead] uploadBriefToDrive threw:', err);
      }
    });

    // Make webhook (kept for Sheets / future workflows — direct email is the
    // primary delivery path now, Make is redundancy)
    fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => console.error('[conference-lead] Make webhook failed:', err));

    // When _test_to override is used, do an inline 4-step diagnostic that
    // surfaces exactly which part of the Google APIs flow fails. This avoids
    // sendBriefEmail's swallowed catch.
    let syncEmailResult:
      | { ok: boolean; step?: string; error?: string; messageId?: string }
      | undefined;
    if (isValidTestOverride) {
      const { google } = await import('googleapis');
      try {
        // Step 1: parse credentials
        let creds: any;
        try {
          creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '');
        } catch (err: any) {
          throw new Error(`step=parse_credentials: ${err?.message || err}`);
        }

        const fromEmail = process.env.GMAIL_SEND_FROM || process.env.LEADS_EMAIL_TO || 'info@ldrsgroup.com';

        // Step 2: build + authorize JWT
        const jwt = new google.auth.JWT({
          email: creds.client_email,
          key: creds.private_key,
          scopes: ['https://www.googleapis.com/auth/gmail.send'],
          subject: fromEmail,
        });
        try {
          await jwt.authorize();
        } catch (err: any) {
          throw new Error(
            `step=jwt_authorize: ${err?.message || err} | response=${JSON.stringify(err?.response?.data || null)}`
          );
        }

        // Step 3: build raw message
        const messageParts = [
          `From: ${fromEmail}`,
          `To: ${ownerEmail}`,
          `Subject: =?UTF-8?B?${Buffer.from(emailContent.subject).toString('base64')}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=UTF-8',
          '',
          emailContent.html,
        ];
        const rawMessage = Buffer.from(messageParts.join('\r\n'))
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        // Step 4: send
        try {
          const gmail = google.gmail({ version: 'v1', auth: jwt });
          const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: rawMessage },
          });
          syncEmailResult = {
            ok: true,
            messageId: res.data.id || undefined,
          };
        } catch (err: any) {
          throw new Error(
            `step=send: ${err?.message || err} | response=${JSON.stringify(err?.response?.data || null)}`
          );
        }
      } catch (err: any) {
        syncEmailResult = {
          ok: false,
          step: err?.message?.split(':')[0]?.replace('step=', '') || 'unknown',
          error: err?.message || String(err),
        };
      }

      if (syncEmailResult?.ok && brief?.id) {
        await supabase
          .from('service_briefs')
          .update({ email_sent: true })
          .eq('id', brief.id);
      }
    }

    return NextResponse.json({
      success: true,
      leadId,
      // Diagnostics — visible only when _test_to override is used (internal calls)
      _diag: isValidTestOverride
        ? {
            ownerEmail,
            envFlags: {
              GOOGLE_SERVICE_ACCOUNT_KEY: hasServiceAccountKey,
              LEADS_EMAIL_TO: !!process.env.LEADS_EMAIL_TO,
              CONFERENCE_LEAD_OWNER_EMAIL: !!process.env.CONFERENCE_LEAD_OWNER_EMAIL,
              MAKE_CONFERENCE_WEBHOOK_URL: !!process.env.MAKE_CONFERENCE_WEBHOOK_URL,
              GOOGLE_SERVICE_ACCOUNT_KEY_length: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.length || 0,
              GOOGLE_SERVICE_ACCOUNT_KEY_starts: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.slice(0, 30) || null,
            },
            syncEmailAttempt: syncEmailResult,
          }
        : undefined,
    });
  } catch (err) {
    console.error('[conference-lead] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
