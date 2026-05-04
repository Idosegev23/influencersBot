/**
 * Seed LA BEAUTÉ knowledge chunks for service-policy questions the bot
 * was failing to answer (returns, shipping times, customer-service contact,
 * damaged-product procedure). Source: support-report email + WhatsApp config
 * already in accounts.config (csrlabeaute@gmail.com / 0559821221).
 *
 * Run once:
 *   npx tsx scripts/seed-labeaute-policy-chunks.ts
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local', override: true });
import { createClient } from '@supabase/supabase-js';
import { generateEmbeddings } from '../src/lib/rag/embeddings';
import crypto from 'crypto';

const ACCOUNT_ID = '432dea15-707f-4cfe-b7e2-331c7a02b228';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY!;
if (!SUPABASE_URL || !SECRET_KEY || !process.env.OPENAI_API_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY);

const CHUNKS = [
  {
    topic: 'returns_policy',
    text: `מדיניות החזרות LA BEAUTÉ:
ניתן להחזיר מוצר תוך 14 יום מקבלת המשלוח, כל עוד המוצר לא נפתח, נמצא במצב חדש, ובאריזה המקורית.
ההחזרה מתבצעת מול שירות הלקוחות של LA BEAUTÉ — שולחים מייל ל-csrlabeaute@gmail.com עם מספר הזמנה, סיבת ההחזרה, ופרטי לקוחה (שם מלא + טלפון). ניתן גם לפנות בוואטסאפ למספר 055-9821221.
ההחזר הכספי יבוצע באותו אמצעי תשלום שבו בוצעה הרכישה, לאחר שהמוצר חוזר ונבדק במחסן.`,
  },
  {
    topic: 'damaged_product',
    text: `מוצר פגום / שבור / דליפה באריזה ב-LA BEAUTÉ:
אם הגיע מוצר פגום, שבור, סדוק, דולף, או שמשהו באריזה לא תקין — צריך לפנות מיידית לשירות הלקוחות.
ערוצי פנייה: מייל csrlabeaute@gmail.com או וואטסאפ 055-9821221.
שולחים: שם מלא, מספר הזמנה, תיאור הבעיה, ותמונה של המוצר/האריזה. הצוות יחזור ויתאם החלפה או החזר.`,
  },
  {
    topic: 'missing_items',
    text: `חסרים פריטים במשלוח LA BEAUTÉ:
אם המשלוח הגיע אבל חסרים פריטים שהזמנת — פני לשירות הלקוחות מיידית עם מספר ההזמנה ופירוט החסרים.
ערוצים: מייל csrlabeaute@gmail.com או וואטסאפ 055-9821221.
מומלץ לצרף תמונה של מה שכן הגיע ולציין את שם המוצר החסר. הטיפול בדרך כלל תוך 1-2 ימי עסקים.`,
  },
  {
    topic: 'shipping_time',
    text: `זמני משלוח LA BEAUTÉ:
משלוחים מתבצעים דרך חברת Focus תוך 3-5 ימי עסקים מרגע אישור ההזמנה.
לאחר שההזמנה יוצאת למשלוח, הלקוחה מקבלת מייל מ-Focus עם מספר משלוח (7 ספרות) למעקב. אפשר לעקוב דרך טאב "סטטוס משלוח" בצ'אט הזה.
משלוח חינם מעל סכום מסוים (ראה אישור הזמנה לפרטים).`,
  },
  {
    topic: 'customer_service_contact',
    text: `יצירת קשר עם שירות הלקוחות של LA BEAUTÉ:
מייל: csrlabeaute@gmail.com
וואטסאפ: 055-9821221
שעות מענה: ימים א'-ה', בשעות העבודה.
הצוות עונה בדרך כלל תוך יום עסקים אחד. כשפונים — לציין שם מלא, מספר הזמנה (אם רלוונטי), ופירוט הבעיה.`,
  },
  {
    topic: 'order_not_found',
    text: `מספר הזמנה לא נמצא ב-LA BEAUTÉ:
אם בחיפוש סטטוס המערכת מחזירה "הזמנה לא נמצאה" — בדקי קודם שמספר ההזמנה הוקלד בדיוק כמו במייל אישור (ללא # ולא רווחים).
הזמנות חדשות מקבלות מספר משלוח של 7 ספרות מ-Focus. אם אין לך עדיין את מספר המשלוח, ייתכן שההזמנה עוד לא יצאה מהמחסן.
לבירור — שירות לקוחות LA BEAUTÉ במייל csrlabeaute@gmail.com או וואטסאפ 055-9821221.`,
  },
  {
    topic: 'where_is_my_order',
    text: `איפה ההזמנה שלי / מתי היא תגיע ב-LA BEAUTÉ:
אחרי ביצוע ההזמנה מקבלים מייל אישור עם הפרטים. כשההזמנה יוצאת למשלוח (בדרך כלל תוך 3-5 ימי עסקים), מקבלים מייל נפרד מ-Focus עם מספר משלוח של 7 ספרות.
כדי לבדוק סטטוס בזמן אמת — להזין את מספר המשלוח של Focus בטאב "סטטוס משלוח" כאן בצ'אט.
אם עברו יותר מ-5 ימי עסקים ועדיין לא הגיע מייל מ-Focus — לפנות לשירות לקוחות במייל csrlabeaute@gmail.com או וואטסאפ 055-9821221.`,
  },
  {
    topic: 'human_rep_request',
    text: `פנייה לנציג שירות אנושי ב-LA BEAUTÉ:
אם רוצה לדבר עם נציג ולא עם הצ'אט — אפשר לפתוח טופס פנייה רשמי בטאב "תמיכה" כאן בצ'אט. הצוות חוזר תוך יום עסקים.
לפנייה ישירה: מייל csrlabeaute@gmail.com או וואטסאפ 055-9821221.`,
  },
];

async function main() {
  console.log(`Seeding ${CHUNKS.length} policy chunks for LA BEAUTÉ...`);
  console.log('Generating embeddings...');
  const embeddings = await generateEmbeddings(CHUNKS.map((c) => c.text));
  if (embeddings.length !== CHUNKS.length) {
    throw new Error(`Embedding count mismatch: ${embeddings.length} vs ${CHUNKS.length}`);
  }

  const documentId = '00000000-0000-0000-0000-000000000001';

  // Wipe prior seeds (idempotent re-runs). The RAG retrieval pipeline
  // only knows the canonical EntityType union — see src/lib/rag/types.ts
  // — so we file these under 'knowledge_base' even though the chunks
  // are policy-flavoured (the topic field carries that nuance).
  const { error: delChunksErr } = await supabase
    .from('document_chunks')
    .delete()
    .eq('account_id', ACCOUNT_ID)
    .eq('document_id', documentId);
  if (delChunksErr) {
    console.warn('Delete prior seeds warning:', delChunksErr.message);
  } else {
    console.log('✓ Wiped prior policy seeds');
  }

  // Upsert parent document row so the FK on document_chunks resolves.
  // documents.entity_type is constrained — use 'knowledge_base'
  // (chunks themselves carry entity_type='policy' to mark the topic).
  const { error: docErr } = await supabase.from('documents').upsert(
    {
      id: documentId,
      account_id: ACCOUNT_ID,
      entity_type: 'knowledge_base',
      title: 'LA BEAUTÉ — Service Policy Knowledge',
      source: 'manual_seed_2026_05_04',
      status: 'active',
      chunk_count: CHUNKS.length,
      total_tokens: CHUNKS.reduce((s, c) => s + Math.ceil(c.text.length / 4), 0),
      metadata: { kind: 'policy_seed' },
    },
    { onConflict: 'id' },
  );
  if (docErr) {
    console.error('Document upsert failed:', docErr);
    process.exit(1);
  }
  console.log('✓ Parent document row ready');

  const rows = CHUNKS.map((c, i) => ({
    document_id: documentId,
    account_id: ACCOUNT_ID,
    entity_type: 'knowledge_base',
    chunk_index: i,
    chunk_text: c.text,
    embedding: embeddings[i],
    token_count: Math.ceil(c.text.length / 4),
    metadata: { topic: c.topic, source: 'manual_seed_2026_05_04' },
    topic: c.topic,
    chunk_hash: crypto.createHash('md5').update(c.text).digest('hex'),
  }));

  const { error } = await supabase.from('document_chunks').insert(rows);
  if (error) {
    console.error('Insert failed:', error);
    process.exit(1);
  }
  console.log(`✓ Inserted ${rows.length} chunks (entity_type=policy, document_id=${documentId})`);
  console.log(`  ${embeddings[0].length}-dim embeddings`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
