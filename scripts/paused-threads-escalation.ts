/**
 * ONE digest per brand for every WhatsApp thread the bot was muted on and the customer kept writing.
 *
 * Why a digest and not the normal escalation path: runCsHandoffCheck fires one email per ticket and
 * dedupes on a 15-minute window, so 107 escalations would either flood a CS inbox or be silently
 * dropped. A CS team needs one worklist, sorted by who is still writing.
 *
 * Cause of the backlog: escalate_to_human calls pauseBot() and NOTHING ever resumes it, so a thread
 * escalated weeks ago is still muted today. The 👀 reaction is fire-and-forget on the webhook, so
 * from the customer's side the bot looks alive and then says nothing.
 *
 * Run: DRY_RUN=false npx tsx --tsconfig tsconfig.json scripts/paused-threads-escalation.ts
 * Defaults to a dry run that prints recipients and the full body.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const DRY_RUN = process.env.DRY_RUN !== 'false';
const TEAM_CC = 'triroars@gmail.com';

interface Row {
  brand: string; account_id: string; wa_id: string; name: string;
  days: number; msgs: number; last_text: string | null; paused_at: string; paused_reason: string | null;
}

function esc(s: string | null): string {
  return (s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}
function localPhone(waId: string): string {
  return waId.startsWith('972') ? '0' + waId.slice(3) : waId;
}

async function main() {
  const { supabase } = await import('../src/lib/supabase');
  const { sendEmail } = await import('../src/lib/email');

  // Paused WhatsApp threads that received inbound AFTER the pause.
  const { data: sessions } = await supabase
    .from('whatsapp_cs_sessions')
    .select('wa_id, customer_name, active_account_id, active_chat_session_id, channel')
    .eq('channel', 'whatsapp')
    .not('active_chat_session_id', 'is', null);

  const rows: Row[] = [];
  for (const s of (sessions as any[]) || []) {
    const { data: cs } = await supabase
      .from('chat_sessions')
      .select('bot_paused, bot_paused_at, bot_paused_reason')
      .eq('id', s.active_chat_session_id).maybeSingle();
    if (!cs?.bot_paused || !cs.bot_paused_at) continue;

    const { data: contact } = await supabase
      .from('whatsapp_contacts').select('id').eq('wa_id', s.wa_id).maybeSingle();
    if (!contact) continue;
    const { data: convos } = await supabase
      .from('whatsapp_conversations').select('id').eq('contact_id', contact.id);
    const convoIds = ((convos as any[]) || []).map((c) => c.id);
    if (!convoIds.length) continue;

    const { data: msgs } = await supabase
      .from('whatsapp_messages')
      .select('text_body, created_at')
      .in('conversation_id', convoIds)
      .eq('direction', 'inbound')
      .gt('created_at', cs.bot_paused_at)
      .order('created_at', { ascending: false });
    const list = (msgs as any[]) || [];
    if (!list.length) continue;

    const { data: acct } = await supabase
      .from('accounts').select('config').eq('id', s.active_account_id).maybeSingle();
    const cfg = (acct as any)?.config || {};
    // A test account has no real CS team — never mail a brand about it.
    if (cfg.isTestAccount === true) continue;

    rows.push({
      brand: cfg.display_name || s.active_account_id,
      account_id: s.active_account_id,
      wa_id: s.wa_id,
      name: s.customer_name || '—',
      days: Math.floor((Date.now() - new Date(list[0].created_at).getTime()) / 86400000),
      msgs: list.length,
      last_text: list.find((m) => m.text_body)?.text_body ?? null,
      paused_at: cs.bot_paused_at,
      paused_reason: cs.bot_paused_reason ?? null,
    });
  }

  const byAccount = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byAccount.has(r.account_id)) byAccount.set(r.account_id, []);
    byAccount.get(r.account_id)!.push(r);
  }

  console.log(`\n${rows.length} waiting customers across ${byAccount.size} brands\n`);

  for (const [accountId, list] of byAccount) {
    list.sort((a, b) => a.days - b.days); // still-writing first — most recoverable
    const brand = list[0].brand;

    const { data: acct } = await supabase
      .from('accounts').select('config').eq('id', accountId).maybeSingle();
    const cfg = (acct as any)?.config || {};
    const to = ((cfg.escalation?.recipients || []) as any[])
      .map((r) => r.email).filter(Boolean);
    if (!to.length) {
      console.log(`⚠ ${brand}: NO recipient configured — ${list.length} customers, nothing sent`);
      continue;
    }

    const active = list.filter((r) => r.days <= 7).length;
    const rowsHtml = list.map((r) => `
      <tr${r.days <= 7 ? ' style="background:#fff4f4"' : ''}>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;direction:ltr">${localPhone(r.wa_id)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${r.days === 0 ? 'היום' : r.days + ' ימים'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${r.msgs}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.last_text ? r.last_text.slice(0, 120) : '(מדיה)')}</td>
      </tr>`).join('');

    const html = `<div dir="rtl" style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#222;max-width:900px">
      <h2 style="margin:0 0 4px">${esc(brand)} — ${list.length} לקוחות ממתינים למענה</h2>
      <p style="margin:0 0 16px;color:#555">
        זוהתה תקלה אצלנו: כשפנייה הועברה לנציג/ה, הבוט הושתק בשיחה הזו ולא חזר לענות.
        הלקוחות שלמטה המשיכו לכתוב ולא קיבלו מענה. <b>${active}</b> מהם כתבו בשבוע האחרון.
        אנחנו מטפלים בתקלה; הרשימה נשלחת כדי שתוכלו לחזור אליהם.
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr style="background:#f3f3f3;text-align:right">
          <th style="padding:8px 10px">שם</th><th style="padding:8px 10px">טלפון</th>
          <th style="padding:8px 10px">ממתין/ה</th><th style="padding:8px 10px">הודעות</th>
          <th style="padding:8px 10px">ההודעה האחרונה</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin:16px 0 0;color:#777;font-size:12px">
        מסומן באדום = כתבו בשבוע האחרון. מיון לפי מי שכתב לאחרונה.
      </p>
    </div>`;

    const subject = `דחוף — ${list.length} לקוחות של ${brand} ממתינים למענה בוואטסאפ`;
    console.log(`\n=== ${brand}`);
    console.log(`    to: ${to.join(', ')}  cc: ${TEAM_CC}`);
    console.log(`    subject: ${subject}`);
    console.log(`    ${list.length} customers, ${active} active this week, oldest ${list[list.length - 1].days}d`);

    if (DRY_RUN) { console.log('    DRY RUN — not sent'); continue; }
    const res = await sendEmail({ to, cc: TEAM_CC, subject, html });
    console.log(`    ${res.success ? '✅ sent ' + res.messageId : '❌ ' + res.error}`);
  }

  if (DRY_RUN) console.log('\nDRY RUN. Re-run with DRY_RUN=false to send.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
