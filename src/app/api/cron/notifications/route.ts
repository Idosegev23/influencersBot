import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import EmailChannel from '@/lib/notifications/email';
import WhatsAppChannel from '@/lib/notifications/whatsapp';
import InAppChannel from '@/lib/notifications/in-app';

// This endpoint should be called by a cron job every 5 minutes
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const now = new Date();

    // Get pending follow-ups that should be sent now
    const { data: followUps, error } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(100); // Process 100 at a time

    if (error) {
      console.error('Error fetching follow-ups:', error);
      return NextResponse.json(
        { error: 'Failed to fetch follow-ups' },
        { status: 500 }
      );
    }

    if (!followUps || followUps.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending follow-ups',
        processed: 0,
      });
    }

    console.log(`Processing ${followUps.length} follow-ups...`);

    const emailChannel = new EmailChannel();
    const whatsappChannel = new WhatsAppChannel();
    const inAppChannel = new InAppChannel(supabase);

    let successCount = 0;
    let failureCount = 0;

    // Process each follow-up
    for (const followUp of followUps) {
      try {
        let success = false;

        // Send based on channel
        switch (followUp.channel) {
          case 'email':
            success = await sendEmailNotification(followUp, emailChannel, supabase);
            break;

          case 'whatsapp':
            success = await sendWhatsAppNotification(followUp, whatsappChannel, supabase);
            break;

          case 'in_app':
            success = await sendInAppNotification(followUp, inAppChannel);
            break;

          default:
            console.warn(`Unknown channel: ${followUp.channel}`);
        }

        // Update follow-up status
        await supabase
          .from('follow_ups')
          .update({
            status: success ? 'sent' : 'failed',
            sent_at: success ? new Date().toISOString() : null,
            error_message: success ? null : 'Failed to send notification',
            updated_at: new Date().toISOString(),
          })
          .eq('id', followUp.id);

        if (success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        console.error(`Error processing follow-up ${followUp.id}:`, error);
        failureCount++;

        // Mark as failed
        await supabase
          .from('follow_ups')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', followUp.id);
      }
    }

    return NextResponse.json({
      success: true,
      processed: followUps.length,
      successful: successCount,
      failed: failureCount,
    });
  } catch (error) {
    console.error('Error in cron job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper: Send email notification
async function sendEmailNotification(
  followUp: any,
  emailChannel: EmailChannel,
  supabase: any
): Promise<boolean> {
  // Get user's email
  const { data: user } = await supabase.auth.admin.getUserById(followUp.user_id);

  if (!user || !user.user.email) {
    console.error('User email not found');
    return false;
  }

  // Build action URL
  let actionUrl = '';
  if (followUp.task_id) {
    actionUrl = `${process.env.NEXT_PUBLIC_ROOT_DOMAIN}/influencer/tasks/${followUp.task_id}`;
  } else if (followUp.partnership_id) {
    actionUrl = `${process.env.NEXT_PUBLIC_ROOT_DOMAIN}/influencer/partnerships/${followUp.partnership_id}`;
  } else if (followUp.invoice_id) {
    actionUrl = `${process.env.NEXT_PUBLIC_ROOT_DOMAIN}/influencer/invoices/${followUp.invoice_id}`;
  }

  const html = emailChannel.buildNotificationEmail(
    followUp.title,
    followUp.message,
    actionUrl,
    'צפה במערכת'
  );

  return await emailChannel.send({
    to: user.user.email,
    subject: followUp.title,
    html,
  });
}

// Helper: Send WhatsApp notification
async function sendWhatsAppNotification(
  followUp: any,
  whatsappChannel: WhatsAppChannel,
  supabase: any
): Promise<boolean> {
  // Get account phone number
  const { data: account } = await supabase
    .from('accounts')
    .select('phone, whatsapp')
    .eq('id', followUp.account_id)
    .single();

  const phone = account?.whatsapp || account?.phone;

  if (!phone) {
    console.error('Phone number not found for account');
    return false;
  }

  // Build action URL
  let actionUrl = '';
  if (followUp.task_id) {
    actionUrl = `${process.env.NEXT_PUBLIC_ROOT_DOMAIN}/influencer/tasks/${followUp.task_id}`;
  } else if (followUp.partnership_id) {
    actionUrl = `${process.env.NEXT_PUBLIC_ROOT_DOMAIN}/influencer/partnerships/${followUp.partnership_id}`;
  }

  const message = whatsappChannel.formatNotification(
    followUp.title,
    followUp.message,
    actionUrl
  );

  return await whatsappChannel.send({
    phoneNumber: phone,
    message,
  });
}

// Helper: Send in-app notification
async function sendInAppNotification(
  followUp: any,
  inAppChannel: InAppChannel
): Promise<boolean> {
  // Build action URL
  let actionUrl = '';
  let actionLabel = 'צפה';

  if (followUp.task_id) {
    actionUrl = `/influencer/tasks/${followUp.task_id}`;
    actionLabel = 'צפה במשימה';
  } else if (followUp.partnership_id) {
    actionUrl = `/influencer/partnerships/${followUp.partnership_id}`;
    actionLabel = 'צפה בשת"פ';
  } else if (followUp.invoice_id) {
    actionUrl = `/influencer/invoices/${followUp.invoice_id}`;
    actionLabel = 'צפה בחשבונית';
  }

  return await inAppChannel.create({
    accountId: followUp.account_id,
    userId: followUp.user_id,
    followUpId: followUp.id,
    title: followUp.title,
    message: followUp.message,
    type: 'info',
    actionUrl,
    actionLabel,
  });
}
