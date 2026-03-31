import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername, getProductsByInfluencer } from '@/lib/supabase';
import { notifyBrandSupport, sendSupportConfirmation } from '@/lib/whatsapp';
import { sanitizeHtml } from '@/lib/sanitize';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
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

    // Send WhatsApp notification to BRAND (only if brand has WhatsApp configured)
    let whatsappSent = false;
    if (brandPhone && sanitizedBrand) {
      console.log('[Support] Sending brand notification to:', brandPhone, 'for brand:', sanitizedBrand);
      try {
        const result = await notifyBrandSupport({
          brandName: sanitizedBrand,
          brandPhone: brandPhone,
          influencerName: influencer.display_name,
          customerName: sanitizedName,
          customerPhone: sanitizedPhone || '',
          orderNumber: sanitizedOrderNumber || undefined,
          problemDetails: sanitizedMessage,
        });
        console.log('[Support] Brand notification result:', result);
        whatsappSent = result.success;
      } catch (err) {
        console.error('[Support] Brand notification error:', err);
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

    // Send confirmation to CUSTOMER if they provided phone
    let confirmationSent = false;
    if (sanitizedPhone) {
      console.log('[Support] Sending customer confirmation to:', sanitizedPhone);
      try {
        const result = await sendSupportConfirmation(
          sanitizedPhone,
          sanitizedBrand || influencer.display_name // Use brand name if available
        );
        console.log('[Support] Customer confirmation result:', result);
        confirmationSent = result.success;
      } catch (err) {
        console.error('[Support] Customer confirmation error:', err);
      }
    } else {
      console.log('[Support] No customer phone provided, skipping customer notification');
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
