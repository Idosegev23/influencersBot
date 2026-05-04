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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      username, 
      customerName, 
      customerPhone, 
      message, 
      problem,
      brand,
      orderNumber,
      productId,
      sessionId 
    } = body;

    // Support both old format (message) and new format (problem)
    const messageText = message || problem;

    // Validate required fields
    if (!username || !customerName || !messageText) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const sanitizedName = sanitizeHtml(customerName);
    const sanitizedMessage = sanitizeHtml(messageText);
    const sanitizedPhone = customerPhone ? customerPhone.replace(/[^\d+]/g, '') : null;
    const sanitizedBrand = brand ? sanitizeHtml(brand) : null;
    const sanitizedOrderNumber = orderNumber ? sanitizeHtml(orderNumber) : null;

    console.log('[Support] Customer phone received:', customerPhone);
    console.log('[Support] Sanitized phone:', sanitizedPhone);

    // Get influencer
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
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

    // Create support request in database
    const { data: supportRequest, error: dbError } = await supabase
      .from('support_requests')
      .insert({
        account_id: influencer.id,
        customer_name: sanitizedName,
        customer_phone: sanitizedPhone,
        message: enhancedMessage,
        brand: sanitizedBrand,
        order_number: sanitizedOrderNumber,
        product_id: productId || null,
        session_id: sessionId || null,
        status: 'new',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to create support request' },
        { status: 500 }
      );
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
    });
  } catch (error) {
    console.error('Support request error:', error);
    return NextResponse.json(
      { error: 'Failed to process support request' },
      { status: 500 }
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
