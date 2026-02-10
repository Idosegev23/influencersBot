import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername, getProductsByInfluencer } from '@/lib/supabase';
import { notifyInfluencerSupport, sendSupportConfirmation } from '@/lib/whatsapp';
import { sanitizeHtml } from '@/lib/sanitize';

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

    // Send WhatsApp notification to influencer if enabled
    let whatsappSent = false;
    if (influencer.whatsapp_enabled && influencer.phone_number) {
      const result = await notifyInfluencerSupport({
        influencerName: influencer.display_name,
        influencerPhone: influencer.phone_number,
        customerName: sanitizedName,
        customerPhone: sanitizedPhone || undefined,
        message: sanitizedMessage,
        couponCode: product?.coupon_code || undefined,
        productName: product?.name || undefined,
      });
      whatsappSent = result.success;
    }

    // Send confirmation to customer if they provided phone
    let confirmationSent = false;
    if (sanitizedPhone && influencer.whatsapp_enabled) {
      const result = await sendSupportConfirmation(
        sanitizedPhone,
        influencer.display_name
      );
      confirmationSent = result.success;
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
      .eq('influencer_id', influencer.id)
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

// PATCH - Update support request status
export async function PATCH(req: NextRequest) {
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
