import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername, getProductsByInfluencer } from '@/lib/supabase';
import {
  sendBrandSupportTicket,
  sendFollowerSupportConfirmation,
} from '@/lib/whatsapp-notify';
import { sanitizeHtml } from '@/lib/sanitize';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { emitServerConversion } from '@/lib/analytics/server-track';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { autoAssignNewTicket } from '@/lib/support/auto-assign';
import { sendEmail, sendEmailWithAttachments } from '@/lib/email';

// ============================================
// CORS — opens this route for cross-origin POSTs from embedded widgets.
// Existing server-side / same-origin callers never send Origin so they are
// unaffected. The route already validates accountId/username + sanitizes
// every field, so allowing any origin doesn't expand the attack surface.
// ============================================
function corsHeadersFor(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  const cors = corsHeadersFor(origin);
  try {
    const body = await req.json();
    const {
      username,        // optional now — `accountId` is the new canonical path
      accountId,       // B2B SaaS flows pass id directly (no username slug)
      customerName,
      customerPhone,
      customerEmail,   // B2B SaaS: visitor's work email
      message,
      problem,
      brand,
      orderNumber,
      productId,
      sessionId,
      refSource: clientRefSource,
      metadata: clientMetadata,  // form-flow extras (issue_type, team_size, subject, ...)
      source: clientSource,      // overrides metadata.source if set
    } = body;

    // Support both old format (message) and new format (problem)
    const messageText = message || problem;

    // Validate: must have either username or accountId, plus name + message
    if ((!username && !accountId) || !customerName || !messageText) {
      return NextResponse.json(
        { error: 'Missing required fields (need username or accountId + customerName + message)' },
        { status: 400, headers: cors }
      );
    }

    // Sanitize inputs
    const sanitizedName = sanitizeHtml(customerName);
    const sanitizedMessage = sanitizeHtml(messageText);
    const sanitizedPhone = customerPhone ? customerPhone.replace(/[^\d+]/g, '') : null;
    const sanitizedEmail = (typeof customerEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()))
      ? customerEmail.trim().toLowerCase()
      : null;
    const sanitizedBrand = brand ? sanitizeHtml(brand) : null;
    const sanitizedOrderNumber = orderNumber ? sanitizeHtml(orderNumber) : null;
    const source = (typeof clientSource === 'string' && clientSource)
      || (clientMetadata && typeof clientMetadata.source === 'string' ? clientMetadata.source : null);
    const metadata = (clientMetadata && typeof clientMetadata === 'object') ? clientMetadata : {};

    console.log('[Support] Customer phone received:', customerPhone, '| email:', sanitizedEmail, '| source:', source);

    // Resolve influencer: prefer username (existing retail flow), fall back
    // to accountId for B2B SaaS forms that don't pass a slug.
    let influencer: any = null;
    if (username) {
      influencer = await getInfluencerByUsername(username);
    }
    if (!influencer && accountId) {
      const { data } = await supabase.from('accounts').select('*').eq('id', accountId).single();
      if (data) {
        const cfg = (data.config as Record<string, any>) || {};
        influencer = {
          id: data.id,
          display_name: cfg.display_name || cfg.username || data.id,
          _rawConfig: cfg,
          language: (data as any).language || 'he',
        };
      }
    }
    if (!influencer) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404, headers: cors }
      );
    }

    // Get product details if provided
    let product = null;
    if (productId) {
      const products = await getProductsByInfluencer(influencer.id);
      product = products.find(p => p.id === productId);
    }

    // Get brand contact details — check partnership first, then brand_logos as fallback
    let brandPhone: string | undefined;
    let brandEmail: string | undefined;
    if (sanitizedBrand) {
      console.log('[Support] Looking up partnership for brand:', sanitizedBrand, 'account:', influencer.id);
      const { data: partnership } = await supabase
        .from('partnerships')
        .select('whatsapp_phone, brand_name, brand_logo_id')
        .eq('account_id', influencer.id)
        .ilike('brand_name', sanitizedBrand)
        .single();

      brandPhone = partnership?.whatsapp_phone || undefined;

      // Fallback: check brand_logos table for contact info
      if ((!brandPhone || !brandEmail) && partnership?.brand_logo_id) {
        const { data: brandLogo } = await supabase
          .from('brand_logos')
          .select('whatsapp_phone, email')
          .eq('id', partnership.brand_logo_id)
          .single();

        if (!brandPhone && brandLogo?.whatsapp_phone) {
          brandPhone = brandLogo.whatsapp_phone;
        }
        brandEmail = brandLogo?.email || undefined;
      }

      // If no brand_logo_id, try matching by name
      if (!brandPhone) {
        const { data: brandLogo } = await supabase
          .from('brand_logos')
          .select('whatsapp_phone, email')
          .ilike('display_name', sanitizedBrand)
          .single();

        if (brandLogo?.whatsapp_phone) brandPhone = brandLogo.whatsapp_phone;
        if (!brandEmail && brandLogo?.email) brandEmail = brandLogo.email;
      }

      console.log('[Support] Brand phone:', brandPhone, 'Brand email:', brandEmail);
    }

    // Account-level fallback — for brand accounts where the influencer IS the brand,
    // route any unmatched ticket to accounts.config.support_whatsapp_phone.
    if (!brandPhone) {
      const cfg = (influencer as any)?._rawConfig || {};
      if (cfg.support_whatsapp_phone) {
        brandPhone = cfg.support_whatsapp_phone;
        console.log('[Support] Using account-level support phone fallback:', brandPhone);
      }
    }

    // Build enhanced message with brand and order info
    let enhancedMessage = sanitizedMessage;
    if (sanitizedBrand) {
      enhancedMessage = `מותג: ${sanitizedBrand}\n${enhancedMessage}`;
    }
    if (sanitizedOrderNumber) {
      enhancedMessage = `מספר הזמנה: ${sanitizedOrderNumber}\n${enhancedMessage}`;
    }

    // Attribution priority:
    //   1) ref_source from the originating chat_session (if a session exists)
    //   2) refSource sent directly from the client (read from `?ref=` /
    //      localStorage on the chat page) — used when the visitor opens the
    //      support tab WITHOUT chatting first, so no chat_session was created.
    let refSource: string | null = null;
    if (sessionId) {
      const { data: sess } = await supabase
        .from('chat_sessions')
        .select('ref_source')
        .eq('id', sessionId)
        .maybeSingle();
      if (sess?.ref_source) refSource = sess.ref_source;
    }
    if (!refSource && typeof clientRefSource === 'string' && clientRefSource.trim()) {
      refSource = clientRefSource.trim().toLowerCase().slice(0, 100);
    }

    // Create support request in database
    const { data: supportRequest, error: dbError } = await supabase
      .from('support_requests')
      .insert({
        account_id: influencer.id,
        customer_name: sanitizedName,
        customer_phone: sanitizedPhone,
        customer_email: sanitizedEmail,
        message: enhancedMessage,
        brand: sanitizedBrand,
        order_number: sanitizedOrderNumber,
        product_id: productId || null,
        session_id: sessionId || null,
        status: 'new',
        ref_source: refSource,
        source,
        metadata,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to create support request' },
        { status: 500, headers: cors }
      );
    }

    // Auto-assign to a random active agent for accounts that have agents
    // configured. Best-effort: if there are no agents (legacy influencers),
    // the ticket stays unassigned. The act is recorded with actor='system'.
    void autoAssignNewTicket(supportRequest.id, influencer.id);

    // Email notification — fire-and-forget. Sends via the existing Bestie
    // Gmail service (lib/email.ts) when:
    //   1. The account has `config.support_email` set (B2B SaaS path), AND
    //   2. We can render a useful subject from the form context.
    // Hebrew accounts that never set support_email keep the WhatsApp-only flow
    // they have today — this branch is purely additive.
    const accountCfg = (influencer as any)?._rawConfig || {};
    const supportEmail: string | undefined = typeof accountCfg.support_email === 'string'
      ? accountCfg.support_email.trim()
      : undefined;
    if (supportEmail) {
      const sourceLabel = source === 'demo_request'
        ? 'Demo request'
        : source === 'support_ticket'
          ? 'Support ticket'
          : 'New request';
      const subjectBits: string[] = [`[${influencer.display_name}] ${sourceLabel}`];
      if (metadata && typeof metadata.subject === 'string' && metadata.subject) {
        subjectBits.push('—', metadata.subject.slice(0, 120));
      } else if (sanitizedBrand) {
        subjectBits.push('—', sanitizedBrand);
      }
      const subject = subjectBits.join(' ');

      const htmlEscape = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const formatLine = (label: string, value: string | null | undefined) =>
        value ? `<tr><td style="padding:6px 12px 6px 0;color:#676767;font-size:13px;white-space:nowrap">${htmlEscape(label)}</td><td style="padding:6px 0;color:#0c1013;font-size:14px">${htmlEscape(value)}</td></tr>` : '';

      // Dashboard deep-link — only for tickets (not demo requests; demo
      // requests typically need email handling, not the support inbox).
      // Base URL chain: NEXT_PUBLIC_APP_URL → VERCEL_URL → bestieai.co.il
      // so it works in prod, preview, and local without env juggling.
      const appBase = (process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
        || 'https://bestieai.co.il').replace(/\/$/, '');
      const accountUsername = (influencer as any)._rawConfig?.username
        || (typeof username === 'string' ? username : null);
      const ticketsLink = (source === 'support_ticket' && accountUsername)
        ? `${appBase}/influencer/${accountUsername}/support`
        : null;
      const ctaBlock = ticketsLink
        ? `<div style="margin:18px 0 4px"><a href="${htmlEscape(ticketsLink)}" style="display:inline-block;background:#0c1013;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px">Open ticket in dashboard →</a></div>`
        : '';

      const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#0c1013">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="font-size:12px;color:#676767;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;margin-bottom:6px">${htmlEscape(sourceLabel)}</div>
    <h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#0c1013">${htmlEscape(influencer.display_name)}</h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      ${formatLine('From', sanitizedName)}
      ${formatLine('Email', sanitizedEmail)}
      ${formatLine('Phone', sanitizedPhone)}
      ${formatLine('Company', sanitizedBrand)}
      ${formatLine('Issue type', metadata?.issue_type)}
      ${formatLine('Team size', metadata?.team_size)}
      ${formatLine('Order #', sanitizedOrderNumber)}
      ${formatLine('Source', source || 'unspecified')}
      ${formatLine('Ref', refSource)}
      ${formatLine('Ticket ID', supportRequest.id)}
    </table>
    <div style="border-top:1px solid #f1e9fd;padding-top:16px;white-space:pre-wrap;font-size:14px;line-height:1.55;color:#0c1013">${htmlEscape(enhancedMessage)}</div>
    ${ctaBlock}
  </div>
  <div style="max-width:620px;margin:12px auto 0;font-size:11px;color:#9ca3af;text-align:center">Sent by BestieAI on behalf of ${htmlEscape(influencer.display_name)}</div>
</body></html>`;

      // Attachment handling — if the widget uploaded a file with the ticket,
      // download it server-side and attach to the email as a real MIME part.
      // Falls back to the URL-only email when the attachment can't be fetched
      // (storage hiccup, file removed) so the ticket still goes out.
      const attachmentUrl: string | undefined = typeof metadata?.attachment_url === 'string'
        ? metadata.attachment_url
        : undefined;
      const attachmentFilename: string | undefined = typeof metadata?.attachment_filename === 'string'
        ? metadata.attachment_filename
        : undefined;

      const dispatchEmail = async () => {
        if (attachmentUrl) {
          try {
            const fileRes = await Promise.race([
              fetch(attachmentUrl),
              new Promise<Response>((_, reject) =>
                setTimeout(() => reject(new Error('attachment fetch timeout')), 8000),
              ),
            ]);
            if (fileRes.ok) {
              const buf = Buffer.from(await fileRes.arrayBuffer());
              const mimeType = fileRes.headers.get('content-type') || 'application/octet-stream';
              const filename = attachmentFilename
                || decodeURIComponent(attachmentUrl.split('/').pop() || 'attachment');
              return sendEmailWithAttachments({
                to: supportEmail,
                subject,
                html,
                attachments: [{ filename, content: buf, mimeType }],
              });
            }
            console.warn('[Support] Attachment fetch non-OK:', fileRes.status, '— falling back to link-only email');
          } catch (e: any) {
            console.warn('[Support] Attachment fetch failed:', e?.message || e, '— falling back to link-only email');
          }
        }
        return sendEmail({ to: supportEmail, subject, html });
      };
      dispatchEmail()
        .then((r) => {
          if (!r.success) console.warn('[Support] Email notify failed:', r.error);
        })
        .catch((e) => console.warn('[Support] Email notify threw:', e?.message || e));
    }

    // Customer confirmation email — sent only when the submitter gave us an
    // email address (B2B SaaS demo + support forms always do; legacy retail
    // brand-support flows usually don't). Acts as the "received, we're on it"
    // acknowledgement the user explicitly asked for.
    if (sanitizedEmail) {
      const isEn = (influencer as any).language === 'en';
      const isDemo = source === 'demo_request';
      const subjectCust = isEn
        ? (isDemo
            ? `Thanks — we received your demo request`
            : `We've received your request`)
        : (isDemo
            ? `קיבלנו את בקשת הדמו שלך`
            : `קיבלנו את הפנייה שלך`);

      const ticketCode = supportRequest.id.split('-')[0].toUpperCase();
      const brandTitle = influencer.display_name;
      const htmlEscapeC = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const greeting = isEn
        ? `Hi ${sanitizedName.split(' ')[0] || 'there'},`
        : `שלום ${sanitizedName.split(' ')[0] || ''},`;
      const body = isEn
        ? (isDemo
            ? `Thanks for requesting a demo of ${brandTitle}. We've logged your request and our team will reach out within one business day to schedule a time that works for you.`
            : `Thanks for reaching out to ${brandTitle}. Your ticket is logged and our team is on it — we'll follow up by email shortly.`)
        : (isDemo
            ? `תודה על בקשת הדמו של ${brandTitle}. הבקשה נקלטה והצוות שלנו יחזור אליך תוך יום עסקים לתיאום זמן שמתאים לך.`
            : `תודה שפנית אל ${brandTitle}. הפנייה נקלטה והצוות שלנו בטיפול — נחזור אליך במייל בקרוב.`);
      const refLine = isEn
        ? `Reference: ${ticketCode}`
        : `מספר פנייה: ${ticketCode}`;
      const summaryLabel = isEn ? 'Your message' : 'ההודעה שלך';
      const footer = isEn
        ? `If you didn't submit this request, you can safely ignore this email.`
        : `אם לא הגשת את הפנייה הזו, אפשר להתעלם מהמייל הזה.`;

      const htmlCust = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#0c1013;direction:${isEn ? 'ltr' : 'rtl'}">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="font-size:13px;color:#676767;margin-bottom:12px">${htmlEscapeC(brandTitle)}</div>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;color:#0c1013;line-height:1.3">${htmlEscapeC(subjectCust)}</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 12px">${htmlEscapeC(greeting)}</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 16px">${htmlEscapeC(body)}</p>
    <div style="font-size:13px;color:#676767;margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${htmlEscapeC(refLine)}</div>
    <div style="border-top:1px solid #f1e9fd;padding-top:16px;margin-top:8px">
      <div style="font-size:12px;color:#676767;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;margin-bottom:8px">${htmlEscapeC(summaryLabel)}</div>
      <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;color:#0c1013">${htmlEscapeC(enhancedMessage)}</div>
    </div>
  </div>
  <div style="max-width:560px;margin:12px auto 0;font-size:11px;color:#9ca3af;text-align:center">${htmlEscapeC(footer)}</div>
</body></html>`;

      sendEmail({ to: sanitizedEmail, subject: subjectCust, html: htmlCust })
        .then((r) => {
          if (!r.success) console.warn('[Support] Customer confirmation email failed:', r.error);
        })
        .catch((e) => console.warn('[Support] Customer confirmation email threw:', e?.message || e));
    }

    // Derive a short "issue type" from the first line of the message;
    // the full text becomes the description. This matches the Meta
    // `brand_support_ticket` template's {{5}}=issueType, {{6}}=description.
    // IMPORTANT: Meta rejects template body params containing \n / \t / >4
    // consecutive spaces with error 132018. Sanitise both before passing.
    function flattenForMeta(s: string, maxLen = 1024): string {
      return s
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, maxLen);
    }
    const firstLine = sanitizedMessage.split('\n')[0].trim();
    const rawIssueType = firstLine.length > 0 ? firstLine : 'פנייה כללית';
    const issueType = flattenForMeta(rawIssueType, 60);
    const description = flattenForMeta(
      sanitizedMessage.length > firstLine.length ? sanitizedMessage : firstLine,
      900,
    );

    // Send WhatsApp notification to BRAND via Meta Cloud API
    // (brand_support_ticket template, gated by WHATSAPP_NOTIFY_ENABLED +
    // WHATSAPP_TEMPLATE_BRAND_SUPPORT_TICKET).
    let whatsappSent = false;
    if (brandPhone && sanitizedBrand) {
      console.log('[Support] Sending brand_support_ticket to:', brandPhone, 'for brand:', sanitizedBrand);
      try {
        const result = await sendBrandSupportTicket({
          to: brandPhone,
          brand: sanitizedBrand,
          followerName: sanitizedName,
          followerPhone: sanitizedPhone || '—',
          orderNumber: sanitizedOrderNumber || '—',
          issueType,
          description,
          influencerName: influencer.display_name,
        });
        console.log('[Support] brand_support_ticket result:', result);
        whatsappSent = result.success;
        // Link the brand notification to the ticket so the cost
        // dashboard attributes its WhatsApp spend to the right account.
        // (Without this row the message gets bucketed under "system".)
        if (supportRequest) {
          await supabase.from('support_ticket_history').insert({
            ticket_id: supportRequest.id,
            account_id: influencer.id,
            action: 'brand_notified',
            actor: 'system',
            whatsapp_template_name: 'brand_support_ticket',
            whatsapp_message_id: result.wa_message_id || null,
            note: result.success ? null : `Send failed: ${result.error?.message || 'unknown'}`,
          });
        }
      } catch (err) {
        console.error('[Support] brand_support_ticket error:', err);
      }
    } else {
      console.log('[Support] Skipping brand notification - no WhatsApp phone configured for brand:', sanitizedBrand);
    }

    // Send email notification to brand if email available (fire-and-forget)
    let emailSent = false;
    if (brandEmail && sanitizedBrand) {
      console.log('[Support] Brand email available:', brandEmail, '— email sending not yet implemented');
      // TODO: Integrate email sending (e.g., Resend, SendGrid)
      // For now, store the email so it's visible in the support request
    }

    // Update support request with notification statuses
    if (supportRequest) {
      const { error: updateErr } = await supabase
        .from('support_requests')
        .update({
          whatsapp_sent: whatsappSent,
          brand_email: brandEmail || null,
        })
        .eq('id', supportRequest.id);
      if (updateErr) console.error('[Support] Update notification status error:', updateErr);
    }

    // Send confirmation to CUSTOMER via Meta Cloud API
    // (follower_support_confirmation template, gated by per-template flag).
    let confirmationSent = false;
    if (sanitizedPhone) {
      console.log('[Support] Sending follower_support_confirmation to:', sanitizedPhone);
      try {
        const result = await sendFollowerSupportConfirmation({
          to: sanitizedPhone,
          followerFirstName: sanitizedName.split(' ')[0] || sanitizedName,
          brand: sanitizedBrand || influencer.display_name,
          orderNumber: sanitizedOrderNumber || '—',
          issueType,
        });
        console.log('[Support] follower_support_confirmation result:', result);
        confirmationSent = result.success;
        // Same as brand_support_ticket above — link to the ticket so
        // the cost dashboard attributes spend to the right account.
        if (supportRequest) {
          await supabase.from('support_ticket_history').insert({
            ticket_id: supportRequest.id,
            account_id: influencer.id,
            action: 'customer_notified',
            actor: 'system',
            whatsapp_template_name: 'follower_support_confirmation',
            whatsapp_message_id: result.wa_message_id || null,
            note: result.success ? null : `Send failed: ${result.error?.message || 'unknown'}`,
          });
        }
      } catch (err) {
        console.error('[Support] follower_support_confirmation error:', err);
      }
    } else {
      console.log('[Support] No customer phone provided, skipping customer notification');
    }

    // Server-side conversion APIs (Meta CAPI + TikTok Events API).
    try {
      const ua = req.headers.get('user-agent') || undefined;
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || undefined;
      await emitServerConversion({
        eventName: 'support_form_submitted',
        email: null,
        phone: sanitizedPhone || null,
        firstName: sanitizedName.split(/\s+/)[0] || null,
        lastName: sanitizedName.split(/\s+/).slice(1).join(' ') || null,
        externalId: supportRequest.id,
        clientIpAddress: ip,
        clientUserAgent: ua,
        eventSourceUrl: `https://bestie.ldrsgroup.com/chat/${username}`,
        customData: {
          request_id: supportRequest.id,
          username,
        },
      });
    } catch (err) {
      console.error('[Support] CAPI dispatch failed:', err);
    }

    return NextResponse.json({
      success: true,
      requestId: supportRequest.id,
      whatsappSent,
      confirmationSent,
    }, { headers: cors });
  } catch (error) {
    console.error('Support request error:', error);
    return NextResponse.json(
      { error: 'Failed to process support request' },
      { status: 500, headers: cors }
    );
  }
}

// GET - List support requests for an influencer
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username required' },
        { status: 400 }
      );
    }

    // Require influencer or admin auth
    const isInfluencer = await checkInfluencerAuth(username);
    const isAdmin = (await requireAdminAuth()) === null;
    if (!isInfluencer && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get influencer
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      );
    }

    // Get support requests
    const { data: requests, error } = await supabase
      .from('support_requests')
      .select(`
        *,
        products:product_id (
          name,
          coupon_code,
          brand
        )
      `)
      .eq('account_id', influencer.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch requests' },
        { status: 500 }
      );
    }

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Get support requests error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch requests' },
      { status: 500 }
    );
  }
}

// PATCH - Update support request status (admin only)
export async function PATCH(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const body = await req.json();
    const { requestId, status, notes } = body;

    if (!requestId || !status) {
      return NextResponse.json(
        { error: 'Request ID and status required' },
        { status: 400 }
      );
    }

    const validStatuses = ['new', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { status };
    if (notes) {
      updateData.notes = sanitizeHtml(notes);
    }
    if (status === 'resolved' || status === 'closed') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('support_requests')
      .update(updateData)
      .eq('id', requestId);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to update request' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update support request error:', error);
    return NextResponse.json(
      { error: 'Failed to update request' },
      { status: 500 }
    );
  }
}
