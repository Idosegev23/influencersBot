/**
 * Create the 3 WhatsApp templates for the Bestie lead funnel (spec §7.2, §7.5).
 *
 * After a Meta form fill there is no open conversation — the lead has never
 * written to us — so the first message MUST be a pre-approved template. Free-form
 * conversation starts only once they reply, which opens a 24-hour window.
 *
 * That is why every template here carries quick-reply buttons: a tap IS an
 * inbound message. The template is the door, not the conversation.
 *
 * Each also carries a decline button. Ido decided against an opt-in gate, so
 * every lead in the form gets messaged; a one-tap way out is the cheapest thing
 * that keeps annoyed recipients from blocking the number instead — and that
 * number also carries brand customer service and every notification template.
 *
 * Submitted as PENDING; MARKETING approval usually lands within hours. Meta may
 * reclassify by content.
 *
 * Run: npx tsx scripts/create-bestie-lead-templates.ts
 * Idempotent: an existing name is reported and skipped.
 */
import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local', override: true });

const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const GRAPH = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

if (!WABA_ID || !TOKEN) {
  console.error('Missing WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_ACCESS_TOKEN');
  process.exit(1);
}

interface TemplateSpec {
  name: string;
  description: string;
  body: string;              // {{1}} = lead first name
  example_body_text: string[];
  buttons: string[];         // quick replies; last one is always the way out
}

const TEMPLATES: TemplateSpec[] = [
  {
    name: 'bestie_lead_intro_v1',
    description: 'First contact after a Meta lead-form fill',
    // Names the form explicitly. A stranger who cannot place why we are writing
    // reports the message; one who remembers filling a form replies.
    body:
      'היי {{1}}, כאן בסטי 👋\n\n' +
      'השארת פרטים כדי לשמוע איך עוזרת AI יכולה לענות ללקוחות שלך — בוואטסאפ, ' +
      'באינסטגרם ובאתר, מסביב לשעון.\n\n' +
      'שנספר לך בקצרה מה זה אומר לעסק כמו שלך?',
    example_body_text: ['ישראל'],
    buttons: ['כן, ספרו לי', 'לא עכשיו'],
  },
  {
    name: 'bestie_lead_nudge_24h_v1',
    description: 'First nudge — ~24h with no reply',
    body:
      'היי {{1}}, לא הספקנו לדבר 🙂\n\n' +
      'עדיין מעניין לשמוע איך בסטי עונה ללקוחות שלך גם כשאתם סגורים?',
    example_body_text: ['ישראל'],
    buttons: ['כן, בוא נדבר', 'לא רלוונטי'],
  },
  {
    name: 'bestie_lead_nudge_72h_v1',
    description: 'Final nudge — ~72h with no reply, then we stop',
    // Says plainly that this is the last one. It earns the reply from people
    // who meant to answer, and it is the honest thing to tell everyone else.
    body:
      'היי {{1}}, זו פנייה אחרונה מצדנו.\n\n' +
      'אם זה לא הזמן הנכון — לגמרי בסדר, לא נטריד יותר. ואם כן, אנחנו כאן.',
    example_body_text: ['ישראל'],
    buttons: ['אשמח לשמוע', 'הסירו אותי'],
  },
];

async function createOne(spec: TemplateSpec) {
  const payload = {
    name: spec.name,
    language: 'he',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text: spec.body,
        example: { body_text: [spec.example_body_text] },
      },
      {
        type: 'BUTTONS',
        buttons: spec.buttons.map(text => ({ type: 'QUICK_REPLY', text })),
      },
    ],
  };

  const url = `https://graph.facebook.com/${GRAPH}/${WABA_ID}/message_templates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
  });
  const json: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = json?.error?.code;
    const msg = json?.error?.message || res.statusText;
    const detail =
      json?.error?.error_user_msg ||
      json?.error?.error_user_title ||
      json?.error?.error_data?.details ||
      JSON.stringify(json?.error || json).slice(0, 300);
    if (code === 100 && (/already exists/i.test(msg) || /already has content/i.test(detail) || /יש תוכן/i.test(detail))) {
      console.log(`  · ${spec.name}: already exists, skipped`);
      return { name: spec.name, status: 'exists' as const };
    }
    console.error(`  ✗ ${spec.name}: ${msg}\n      ↳ ${detail}`);
    return { name: spec.name, status: 'error' as const };
  }

  console.log(`  ✓ ${spec.name}: submitted (id=${json.id || '?'} status=${json.status || 'PENDING'} category=${json.category || 'MARKETING'})`);
  return { name: spec.name, status: 'submitted' as const };
}

async function main() {
  console.log(`Submitting ${TEMPLATES.length} Bestie lead templates to WABA ${WABA_ID}...\n`);
  const results = [];
  for (const spec of TEMPLATES) {
    console.log(`${spec.name} — ${spec.description}`);
    results.push(await createOne(spec));
  }

  const submitted = results.filter(r => r.status === 'submitted').length;
  const existed = results.filter(r => r.status === 'exists').length;
  const failed = results.filter(r => r.status === 'error').length;
  console.log(`\nsubmitted ${submitted} · already existed ${existed} · failed ${failed}`);
  if (failed) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
