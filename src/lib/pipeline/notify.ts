import { supabase } from '@/lib/supabase';
import { redisSetNx, isRedisAvailable } from '@/lib/redis';
import { sendDemoReady, sendAccountReady, sendInfluencerWelcome } from '@/lib/whatsapp-notify';
import type { WhatsAppSendResult } from '@/lib/whatsapp-cloud/client';
import { sendEmail, sendAdminAlert } from '@/lib/email';
import { parseRecipients, resolveBrandName } from '@/lib/pipeline/notify-helpers';

const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com').replace(/\/$/, '');

/** Pick the team template wrapper by demo/real. */
export function pickTeamSend(isDemo: boolean): (p: { to: string; brandName: string; accountUsername: string }) => Promise<WhatsAppSendResult> {
  return isDemo ? sendDemoReady : sendAccountReady;
}

/**
 * Fire the scan-complete notifications once, at pipeline completion.
 * - Team WhatsApp (demo_ready_v1 / account_ready_v1) to SCAN_NOTIFY_RECIPIENTS.
 * - Onboarding accounts also notify the CLIENT (WhatsApp influencer_welcome_v2 +
 *   email) and flip config.onboarding.status → 'ready' (retiring the setup token),
 *   plus an admin alert.
 * Best-effort: never throws; a notify failure must not fail the pipeline.
 */
export async function notifyScanComplete(args: {
  jobId: string;
  job: { account_id?: string | null; username: string };
  state: any;
}): Promise<void> {
  const { jobId, job, state } = args;
  try {
    // Dedup — QStash may re-deliver the completion POST. Only trust the NX result
    // when Redis is actually available (else proceed; re-delivery here is rare).
    if (isRedisAvailable()) {
      const claimed = await redisSetNx(`scan-notify:${jobId}`, '1', 86400);
      if (!claimed) return;
    }
    if (!job.account_id) return;

    const { data: account } = await supabase.from('accounts').select('config').eq('id', job.account_id).maybeSingle();
    const config = (account?.config as any) || {};
    const brand = resolveBrandName(config, job.username);
    const slug = config.username || job.username;
    const isDemo = state?.options?.isDemo === true;

    // 1) Team notification.
    const send = pickTeamSend(isDemo);
    await Promise.allSettled(
      parseRecipients(process.env.SCAN_NOTIFY_RECIPIENTS).map((to) =>
        send({ to, brandName: brand, accountUsername: slug }),
      ),
    );

    // 2) Onboarding — notify the client + flip status + admin alert.
    const ob = config.onboarding;
    if (ob?.status === 'scanning') {
      await supabase
        .from('accounts')
        .update({ config: { ...config, onboarding: { ...ob, status: 'ready', token: undefined } } })
        .eq('id', job.account_id);

      const dashUrl = `${APP}/influencer/${slug}/dashboard`;
      const chatUrl = `${APP}/chat/${slug}`;
      const firstName = ob.clientName || ob.accountName || brand;

      if (ob.ownerWhatsapp) {
        await sendInfluencerWelcome({ to: ob.ownerWhatsapp, influencerFirstName: firstName, influencerUsername: slug }).catch(() => {});
      }
      if (ob.ownerEmail) {
        await sendEmail({
          to: ob.ownerEmail,
          subject: `הבסטי של ${brand} מוכן! 🎉`,
          html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
            <h2 style="color:#883fe2">היי ${firstName}, החשבון שלך מוכן! 🎉</h2>
            <p>סיימנו לבנות את עוזר ה-AI שלך — הוא סרק את התוכן שלך ומוכן לענות לעוקבים.</p>
            <p style="margin:24px 0">
              <a href="${dashUrl}" style="background:#883fe2;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:bold">כניסה לדשבורד</a>
              &nbsp;&nbsp;
              <a href="${chatUrl}" style="color:#883fe2;font-weight:bold">לצפייה בצ'אט »</a>
            </p>
            <p style="color:#888;font-size:13px">BestieAI · LDRS</p>
          </div>`,
        }).catch(() => {});
      }

      await sendAdminAlert({
        level: 'info',
        subject: `חשבון חדש הוקם: ${brand}`,
        message: `החשבון ${brand} (@${slug}) השלים onboarding וסריקה. וואטסאפ לקוח: ${ob.ownerWhatsapp || '—'}, מייל: ${ob.ownerEmail || '—'}.`,
        details: JSON.stringify({ accountId: job.account_id, username: slug, dashUrl, chatUrl }),
      }).catch(() => {});
    }
  } catch (e: any) {
    console.error('[notifyScanComplete] error:', e?.message || e);
  }
}
