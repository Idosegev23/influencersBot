import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { generateDailyDigest } from '@/lib/daily-digest/generator';
import { generateEmailHTML, generateEmailText, generateWhatsAppMessage } from '@/lib/daily-digest/templates';
import { sendEmail } from '@/lib/notifications/email';
import { sendWhatsAppMessage } from '@/lib/notifications/whatsapp';

/**
 * POST /api/cron/daily-digest
 * Cron job שרץ כל בוקר ב-9:00 ושולח סיכום יומי לכל המשתמשים
 * 
 * Vercel Cron: 0 9 * * * (every day at 9:00 AM Israel time)
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient();
  const results = {
    total: 0,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    console.log('🌅 Starting daily digest cron job...');

    // Get all active users with email/phone
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        phone,
        role,
        accounts!owner_user_id(id, name, settings)
      `)
      .in('role', ['influencer', 'agent'])
      .not('email', 'is', null);

    if (usersError) throw usersError;

    results.total = users?.length || 0;
    console.log(`📧 Found ${results.total} users to send digest to`);

    // Send digest to each user
    for (const user of users || []) {
      try {
        // Skip if user has disabled daily digest
        const userAccounts = user.accounts as any[];
        if (!userAccounts || userAccounts.length === 0) {
          console.log(`⏭️  Skipping user ${user.id} - no accounts`);
          continue;
        }

        const account = userAccounts[0];
        const settings = account.settings || {};
        if (settings.daily_digest_enabled === false) {
          console.log(`⏭️  Skipping user ${user.id} - digest disabled`);
          continue;
        }

        // Generate digest
        const digest = await generateDailyDigest(user.id, account.id);

        // Send Email
        if (user.email) {
          try {
            const emailHTML = generateEmailHTML(digest);
            const emailText = generateEmailText(digest);

            await sendEmail({
              to: user.email,
              subject: `🌅 סיכום יומי - ${digest.summary.date}`,
              html: emailHTML,
              text: emailText,
            });

            console.log(`✅ Email sent to ${user.email}`);
          } catch (emailError: any) {
            console.error(`❌ Email failed for ${user.email}:`, emailError.message);
            results.errors.push(`Email to ${user.email}: ${emailError.message}`);
          }
        }

        // Send WhatsApp (if enabled)
        if (user.phone && settings.daily_digest_whatsapp !== false) {
          try {
            const whatsappMessage = generateWhatsAppMessage(digest);

            await sendWhatsAppMessage({
              phoneNumber: user.phone,
              message: whatsappMessage,
            });

            console.log(`✅ WhatsApp sent to ${user.phone}`);
          } catch (whatsappError: any) {
            console.error(`❌ WhatsApp failed for ${user.phone}:`, whatsappError.message);
            results.errors.push(`WhatsApp to ${user.phone}: ${whatsappError.message}`);
          }
        }

        results.sent++;

        // Rate limiting - wait 100ms between users
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (userError: any) {
        console.error(`❌ Failed to send digest to user ${user.id}:`, userError.message);
        results.failed++;
        results.errors.push(`User ${user.id}: ${userError.message}`);
      }
    }

    console.log('✅ Daily digest cron job completed');
    console.log(`📊 Results: ${results.sent} sent, ${results.failed} failed out of ${results.total}`);

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error('❌ Daily digest cron job failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        results,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/daily-digest?user_id=xxx
 * Manual trigger for testing (requires admin)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  const accountId = searchParams.get('account_id');

  if (!userId || !accountId) {
    return NextResponse.json(
      { error: 'Missing user_id or account_id' },
      { status: 400 }
    );
  }

  try {
    // Generate digest
    const digest = await generateDailyDigest(userId, accountId);

    // Generate templates
    const emailHTML = generateEmailHTML(digest);
    const emailText = generateEmailText(digest);
    const whatsappMessage = generateWhatsAppMessage(digest);

    return NextResponse.json({
      digest,
      templates: {
        emailHTML,
        emailText,
        whatsappMessage,
      },
    });
  } catch (error: any) {
    console.error('Error generating digest:', error);
    return NextResponse.json(
      { error: 'Failed to generate digest', details: error.message },
      { status: 500 }
    );
  }
}
