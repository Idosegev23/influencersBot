/**
 * Analyze Miran's Persona from Real Content
 * ניתוח מדויק של הפרסונה של מירן על סמך התוכן שלה
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  console.log('🔍 מנתח את התוכן של מירן...\n');

  // Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  );

  // 1. שליפת כל התוכן
  console.log('📥 שולף פוסטים...');
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('caption, type, hashtags, engagement_rate')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('posted_at', { ascending: false })
    .limit(40);

  console.log('📥 שולף תמלולים...');
  const { data: transcriptions } = await supabase
    .from('instagram_transcriptions')
    .select('transcription_text')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('created_at', { ascending: false })
    .limit(50);

  console.log('📥 שולף שותפויות...');
  const { data: partnerships } = await supabase
    .from('partnerships')
    .select('brand_name, category, brief')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .eq('is_active', true);

  console.log(`✅ נתונים: ${posts?.length || 0} פוסטים, ${transcriptions?.length || 0} תמלולים, ${partnerships?.length || 0} שותפויות\n`);

  // 2. ניתוח AI
  console.log('🤖 מריץ ניתוח Gemini...\n');

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const prompt = `נתח את התוכן של מירן בוזגלו והחזר Persona מדויקת **בעברית**.

## פוסטים (${posts?.length || 0}):
${posts?.slice(0, 30).map((p, i) => `${i + 1}. [${p.type}] ${p.caption?.substring(0, 250) || 'ללא כיתוב'}`).join('\n\n') || 'אין'}

## תמלולים (${transcriptions?.length || 0}):
${transcriptions?.filter(t => t.transcription_text).slice(0, 15).map((t, i) => `${i + 1}. ${t.transcription_text?.substring(0, 200)}`).join('\n\n') || 'אין'}

## שותפויות:
${partnerships?.map(p => `- ${p.brand_name}: ${p.brief || p.category || 'לא צוין'}`).join('\n') || 'אין'}

---

**על סמך התוכן האמיתי למעלה**, נתח ובנה Persona:

החזר JSON **בעברית** בפורמט הזה:

\`\`\`json
{
  "name": "מירן בוזגלו",
  "bio": "תיאור קצר (1-2 משפטים) - מה היא בעצם עושה ובמה היא מתמחה",
  "description": "תיאור מפורט (3-4 משפטים) - מי היא, מה הסגנון שלה, על מה התוכן",
  "expertise": ["תחום עיקרי 1", "תחום עיקרי 2", "תחום עיקרי 3"],
  "topics": ["נושא שכיח 1", "נושא שכיח 2", "נושא שכיח 3", ...],
  "tone": "תיאור קצר של הטון (חברי/רשמי/מוטיבציונלי/משפחתי)",
  "response_style": "איך היא עונה ומדברת (משפט אחד)",
  "personality_traits": ["תכונה 1", "תכונה 2", "תכונה 3"],
  "content_themes": ["נושא מרכזי 1", "נושא מרכזי 2", ...],
  "target_audience": "למי היא פונה בעיקר"
}
\`\`\`

⚠️ **קריטי:**
1. התבסס **רק** על התוכן שראית!
2. אל תנחש או תמציא!
3. אם היא לא עוסקת בכושר - אל תכתוב שהיא מאמנת!
4. הכל בעברית!`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Extract JSON
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : response;
  const persona = JSON.parse(jsonStr);

  console.log('📊 תוצאת הניתוח:\n');
  console.log(JSON.stringify(persona, null, 2));

  // 3. עדכון הדאטה-בייס
  console.log('\n💾 מעדכן את הדאטה-בייס...');

  const { data, error } = await supabase
    .from('chatbot_persona')
    .update({
      bio: persona.bio,
      description: persona.description,
      interests: persona.expertise,
      topics: persona.topics,
      tone: persona.tone,
      response_style: persona.response_style,
      metadata: {
        personality_traits: persona.personality_traits,
        content_themes: persona.content_themes,
        target_audience: persona.target_audience,
        analyzed_at: new Date().toISOString(),
        analyzed_from: `${posts?.length || 0} posts, ${transcriptions?.length || 0} transcriptions`,
      }
    })
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .select();

  if (error) {
    console.error('❌ שגיאה בעדכון:', error);
  } else {
    console.log('✅ הפרסונה עודכנה בהצלחה!');
    console.log('\n📝 Persona החדשה:');
    console.log(JSON.stringify(data[0], null, 2));
  }
}

main().catch(console.error);
