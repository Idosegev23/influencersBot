/**
 * One-off: Hamania activation update — WhatsApp to Yoav+Ido, email to the LDRS team + Kfir.
 * Run from repo root: npx tsx --tsconfig tsconfig.json <this file>
 */
import { config as loadEnv } from 'dotenv';
import path from 'path';
loadEnv({ path: path.join(process.cwd(), '.env.local') });

const WIDGET_SNIPPET = `<script src="https://bestie.ldrsgroup.com/widget.js" data-account-id="bcc5f57f-48d9-4aed-a342-8f96bf4e991f" defer></script>`;

const WA_RECIPIENTS = [
  { to: '+972545980677', name: 'יואב' },
  { to: '+972547667775', name: 'עידו' },
];

const WA_BODY =
  'חשבון החמניה עלה לאוויר כחשבון פעיל ✅ תקופת התנסות חינם עד 12/09/2026. ' +
  'תזכורת אוטומטית תישלח לכפיר בוואטסאפ ב-05/09 (שבוע לפני הסיום). ' +
  'הקטלוג (5 מארזים) חי בצ׳אט, וסקריפט ההטמעה של הווידג׳ט נשלח אליכם במייל. ' +
  'צ׳אט: https://bestie.ldrsgroup.com/chat/hamania.israel';

async function main() {
  const { sendTemplate } = await import('../src/lib/whatsapp-cloud/client');
  const { getBestieChannel } = await import('../src/lib/whatsapp-cloud/channels');
  const { sendEmail } = await import('../src/lib/email');

  for (const r of WA_RECIPIENTS) {
    const res = await sendTemplate({ channel: await getBestieChannel(),
      to: r.to,
      templateName: 'support_freeform_message',
      languageCode: 'he',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: r.name },
            { type: 'text', text: 'Bestie' },
            { type: 'text', text: WA_BODY },
          ],
        },
      ],
    });
    console.log(`WA → ${r.name} (${r.to}):`, res.success ? 'SENT' : JSON.stringify(res.error));
  }

  const html = `
<div dir="rtl" style="font-family: Heebo, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937; line-height: 1.7;">
  <h2 style="color:#059669;">חשבון החמניה עלה לאוויר ב-Bestie 🌻</h2>
  <p>שלום לכולם,</p>
  <p>חשבון <strong>החמניה</strong> הופעל היום כחשבון פעיל במערכת Bestie, עם <strong>חודש התנסות חינם — עד 12/09/2026</strong>.</p>

  <h3>מה כבר עובד</h3>
  <ul>
    <li>עוזר AI חכם שמכיר את המותג, הסניפים והמארזים — <a href="https://bestie.ldrsgroup.com/chat/hamania.israel">לצפייה בצ׳אט</a></li>
    <li>קטלוג המארזים (5 מארזי המתנה מסדרת "החמניה של המדינה") עם תמונות</li>
    <li>ווידג׳ט צ׳אט מוכן להטמעה באתר hamaniaonline.co.il</li>
  </ul>

  <h3>הטמעת הווידג׳ט באתר</h3>
  <p>מוסיפים את השורה הבאה לפני סגירת ה-<code>&lt;/body&gt;</code> (בוורדפרס: דרך תוסף כמו WPCode או בקובץ footer.php של התבנית):</p>
  <pre style="background:#f3f4f6; padding:12px 16px; border-radius:8px; direction:ltr; text-align:left; overflow-x:auto; font-size:13px;">${WIDGET_SNIPPET.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  <p>זהו — שורה אחת, ובועת הצ׳אט תופיע בכל עמודי האתר.</p>

  <h3>תקופת ההתנסות</h3>
  <ul>
    <li>התחלה: 12/08/2026</li>
    <li>סיום: <strong>12/09/2026</strong></li>
    <li>שבוע לפני הסיום (05/09) תישלח לכפיר תזכורת אוטומטית בוואטסאפ לתיאום המשך הפעילות</li>
  </ul>

  <p>לכל שאלה אנחנו כאן,<br/>צוות Bestie</p>
</div>`;

  const emailRes = await sendEmail({
    to: ['yoav@ldrsgroup.com', 'cto@ldrsgroup.com', 'kfir@ldrsgroup.com', 'itamar@ldrsgroup.com'],
    subject: 'החמניה עלתה לאוויר ב-Bestie — חודש התנסות עד 12/09 + סקריפט הטמעת הווידג׳ט',
    html,
  });
  console.log('EMAIL:', JSON.stringify(emailRes));
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
