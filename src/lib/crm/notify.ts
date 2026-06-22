/**
 * Agency-CRM notifications — reminders go to the AGENT via email + WhatsApp.
 * Email is guaranteed; WhatsApp is best-effort (only delivers inside the 24h
 * service window; outside it Meta requires an approved template).
 */
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { sendText } from '@/lib/whatsapp-cloud/client';

export async function notifyAgent(
  agentId: string,
  opts: { subject: string; text: string; html?: string }
): Promise<void> {
  const { data: agent } = await supabaseAdmin
    .from('users')
    .select('contact_email, whatsapp, full_name')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent) return;

  if (agent.contact_email) {
    await sendEmail({
      to: agent.contact_email,
      subject: opts.subject,
      html:
        opts.html ||
        `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">${opts.text.replace(
          /\n/g,
          '<br/>'
        )}</div>`,
    }).catch((e) => console.warn('[notifyAgent] email failed', e?.message));
  }

  if (agent.whatsapp) {
    await sendText({ to: agent.whatsapp, body: `${opts.subject}\n\n${opts.text}` }).catch((e) =>
      console.warn('[notifyAgent] whatsapp failed', e?.message)
    );
  }
}
