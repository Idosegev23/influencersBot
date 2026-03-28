import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadBriefToDrive, sendBriefEmail, buildBriefHtml } from '@/lib/google-workspace';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      accountId,
      serviceId,
      serviceName,
      fullName,
      businessName,
      email,
      phone,
      productDescription,
      goal,
      budgetRange,
      notes,
      sessionId,
    } = body;

    if (!accountId || !fullName || !serviceName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Save to DB
    const { data: brief, error: dbError } = await supabase
      .from('service_briefs')
      .insert({
        account_id: accountId,
        service_id: serviceId || null,
        full_name: fullName,
        business_name: businessName || null,
        email: email || null,
        phone: phone || null,
        service_name: serviceName,
        product_description: productDescription || null,
        goal: goal || null,
        budget_range: budgetRange || null,
        notes: notes || null,
        session_id: sessionId || null,
      })
      .select('id, created_at')
      .single();

    if (dbError) {
      console.error('[briefs] DB insert error:', dbError);
      return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 });
    }

    const briefHtml = buildBriefHtml({
      fullName,
      businessName,
      email,
      phone,
      serviceName,
      productDescription,
      goal,
      budgetRange,
      notes,
      createdAt: brief.created_at,
    });

    // 2. Upload to Google Drive (fire-and-forget with result capture)
    let driveResult: { fileId: string; webViewLink: string } | null = null;
    try {
      const title = `ליד — ${fullName} — ${serviceName} — ${new Date().toLocaleDateString('he-IL')}`;
      driveResult = await uploadBriefToDrive({ title, htmlBody: briefHtml });

      // Update DB with Drive link
      await supabase
        .from('service_briefs')
        .update({ drive_file_id: driveResult.fileId, drive_file_url: driveResult.webViewLink })
        .eq('id', brief.id);
    } catch (err) {
      console.error('[briefs] Drive upload failed:', err);
    }

    // 3. Send email notification
    let emailSent = false;
    try {
      const toEmail = process.env.LEADS_EMAIL_TO || 'info@ldrsgroup.com';
      emailSent = await sendBriefEmail({
        to: toEmail,
        subject: `ליד חדש: ${fullName} — ${serviceName}`,
        htmlBody: briefHtml,
      });

      if (emailSent) {
        await supabase
          .from('service_briefs')
          .update({ email_sent: true })
          .eq('id', brief.id);
      }
    } catch (err) {
      console.error('[briefs] Email send failed:', err);
    }

    return NextResponse.json({
      success: true,
      briefId: brief.id,
      driveUrl: driveResult?.webViewLink || null,
      emailSent,
    });
  } catch (err) {
    console.error('[briefs] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET — list briefs for an account (used by manage dashboard)
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('service_briefs')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ briefs: data || [] });
}

// PATCH — update brief status
export async function PATCH(req: NextRequest) {
  try {
    const { briefId, status } = await req.json();
    if (!briefId || !status) {
      return NextResponse.json({ error: 'briefId and status required' }, { status: 400 });
    }

    const validStatuses = ['new', 'contacted', 'in_progress', 'closed', 'archived'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { error } = await supabase
      .from('service_briefs')
      .update({ status })
      .eq('id', briefId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
