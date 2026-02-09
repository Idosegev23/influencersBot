/**
 * Deep Persona Analysis - Comprehensive Content Analysis
 * ניתוח מעמיק של כל התוכן עם OpenAI GPT-5.2 Pro
 */

const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  console.log('🔍 ניתוח מעמיק של כל התוכן של מירן...\n');
  console.log('═'.repeat(80));

  // Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  );

  // ===== 1. שליפת כל התוכן (ללא הגבלה!) =====
  console.log('\n📥 שולף את כל התוכן...\n');

  console.log('  → פוסטים...');
  const { data: allPosts, count: postsCount } = await supabase
    .from('instagram_posts')
    .select('*', { count: 'exact' })
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('posted_at', { ascending: false });

  console.log('  → תמלולים...');
  const { data: allTranscriptions, count: transCount } = await supabase
    .from('instagram_transcriptions')
    .select('*', { count: 'exact' })
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('created_at', { ascending: false });

  console.log('  → הילייטס...');
  const { data: allHighlights, count: highlightsCount } = await supabase
    .from('instagram_highlights')
    .select('*', { count: 'exact' })
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('created_at', { ascending: false });

  console.log('  → שותפויות...');
  const { data: allPartnerships } = await supabase
    .from('partnerships')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .eq('is_active', true);

  console.log('  → קופונים...');
  const { data: allCoupons } = await supabase
    .from('coupons')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .eq('is_active', true);

  console.log('\n✅ סיימנו שליפה:');
  console.log(`   📸 פוסטים: ${postsCount || allPosts?.length || 0}`);
  console.log(`   🎬 תמלולים: ${transCount || allTranscriptions?.length || 0}`);
  console.log(`   ⭐ הילייטס: ${highlightsCount || allHighlights?.length || 0}`);
  console.log(`   🤝 שותפויות: ${allPartnerships?.length || 0}`);
  console.log(`   🎟️ קופונים: ${allCoupons?.length || 0}`);
  console.log('');

  // ===== 2. עיבוד וניקוי הנתונים =====
  console.log('🧹 מעבד ומנקה נתונים...\n');

  // Posts - רק עם caption
  const postsWithContent = allPosts?.filter(p => p.caption && p.caption.trim().length > 10) || [];
  
  // Transcriptions - רק עם טקסט
  const transWithContent = allTranscriptions?.filter(t => t.transcription_text && t.transcription_text.trim().length > 20) || [];

  // Highlights - רק עם כותרת
  const highlightsWithContent = allHighlights?.filter(h => h.title) || [];

  console.log('✅ אחרי ניקוי:');
  console.log(`   📸 פוסטים עם תוכן: ${postsWithContent.length}`);
  console.log(`   🎬 תמלולים עם טקסט: ${transWithContent.length}`);
  console.log(`   ⭐ הילייטס עם כותרת: ${highlightsWithContent.length}`);
  console.log('');

  // ===== 3. בניית Dataset מלא =====
  console.log('📊 בונה Dataset מלא...\n');

  const fullDataset = {
    posts: postsWithContent.map(p => ({
      type: p.type,
      caption: p.caption,
      hashtags: p.hashtags,
      engagement_rate: p.engagement_rate,
      likes: p.likes_count,
      posted_at: p.posted_at
    })),
    transcriptions: transWithContent.map(t => ({
      text: t.transcription_text,
      created_at: t.created_at
    })),
    highlights: highlightsWithContent.map(h => ({
      title: h.title,
      cover_image: h.cover_image_url
    })),
    partnerships: allPartnerships?.map(p => ({
      brand: p.brand_name,
      category: p.category,
      brief: p.brief,
      link: p.link
    })) || [],
    coupons: allCoupons?.map(c => ({
      code: c.code,
      description: c.description,
      discount_type: c.discount_type,
      discount_value: c.discount_value
    })) || []
  };

  // Calculate total characters
  const totalChars = 
    JSON.stringify(fullDataset.posts).length +
    JSON.stringify(fullDataset.transcriptions).length +
    JSON.stringify(fullDataset.highlights).length;

  console.log(`📏 גודל Dataset: ${(totalChars / 1000).toFixed(1)}K תווים`);
  console.log('');

  // ===== 4. ניתוח AI מעמיק עם OpenAI GPT-5.2 Pro =====
  console.log('═'.repeat(80));
  console.log('🤖 מריץ ניתוח מעמיק עם OpenAI GPT-5.2 Pro...');
  console.log('   (המודל החכם והחזק ביותר!)');
  console.log('   (זה יכול לקחת 30-90 שניות)');
  console.log('═'.repeat(80));
  console.log('');

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  const modelName = 'gpt-5.2-pro';
  console.log(`🎯 משתמש במודל: ${modelName}\n`);

  const analysisPrompt = `אתה מנתח תוכן מומחה. תפקידך לבנות Persona מדויקת של משפיענית על סמך **כל** התוכן שלה.

# נתוני מירן בוזגלו - ניתוח מלא

## 📸 ${fullDataset.posts.length} פוסטים אינסטגרם:

${fullDataset.posts.map((p, i) => `
### פוסט #${i + 1} [${p.type}] - ${new Date(p.posted_at).toLocaleDateString('he-IL')}
**Engagement:** ${(parseFloat(p.engagement_rate || 0) * 100).toFixed(1)}% | **Likes:** ${p.likes || 0}

${p.caption}

${p.hashtags?.length ? `**Hashtags:** ${p.hashtags.join(', ')}` : ''}
`).join('\n---\n')}

---

## 🎬 ${fullDataset.transcriptions.length} תמלולים מסרטונים:

${fullDataset.transcriptions.map((t, i) => `
### תמלול #${i + 1}
${t.text}
`).join('\n---\n')}

---

## ⭐ ${fullDataset.highlights.length} הילייטס:

${fullDataset.highlights.map((h, i) => `${i + 1}. **${h.title}**`).join('\n')}

---

## 🤝 ${fullDataset.partnerships.length} שותפויות:

${fullDataset.partnerships.map((p, i) => `
${i + 1}. **${p.brand}** ${p.category ? `(${p.category})` : ''}
   ${p.brief || 'לא צוין'}
   ${p.link ? `קישור: ${p.link}` : ''}
`).join('\n')}

---

## 🎟️ ${fullDataset.coupons.length} קופונים:

${fullDataset.coupons.map((c, i) => `
${i + 1}. **${c.code}**
   ${c.description || 'לא צוין'}
   הנחה: ${c.discount_type === 'percentage' ? `${c.discount_value}%` : `${c.discount_value} ש"ח`}
`).join('\n')}

---

# משימה: ניתוח מעמיק

נתח את **כל** התוכן למעלה וענה על השאלות הבאות בפירוט:

## 1. זיהוי תחומי התמחות (Core Expertise)
- מה התחומים שמירן **באמת** עוסקת בהם? (לא נחשים!)
- מה היחס בין התחומים השונים? (ביוטי 40%, משפחה 30%, וכו')
- באיזה תחום יש לה הכי הרבה תוכן איכותי?

## 2. ניתוח סגנון דיבור (Voice & Tone)
- איך מירן מדברת? תן דוגמאות ספציפיות מהתוכן
- אילו ביטויים היא משתמשת שוב ושוב?
- מה הטון שלה? (חברי/רשמי/מצחיק/רגשי)
- איך היא פונה לקהל? ("אהובות שלי", "חיים שלי", וכו')

## 3. נושאים מרכזיים (Core Topics)
- מה 10 הנושאים הכי שכיחים בתוכן שלה?
- על מה היא הכי אוהבת לדבר?
- מה הנושאים שמקבלים הכי הרבה engagement?

## 4. אישיות ותכונות (Personality Traits)
- מה התכונות המרכזיות שלה?
- איך היא מציגה את עצמה?
- מה חשוב לה?

## 5. קהל יעד (Target Audience)
- למי מירן פונה?
- מה הדמוגרפיה העיקרית?
- מה הצרכים של הקהל שלה?

## 6. מוצרים ושותפויות
- מה המוצרים שהיא הכי ממליצה עליהם?
- איזה מותגים חוזרים על עצמם?
- איך היא מדברת על מוצרים? (אותנטי/פרסומי)

## 7. נושאים רגישים
- האם יש סיפורים אישיים חזקים?
- מה הנושאים הרגשיים שהיא משתפת?

---

# פורמט התשובה:

החזר JSON מפורט בפורמט הבא (הכל **בעברית**):

\`\`\`json
{
  "summary": {
    "totalContentAnalyzed": "מספר הפריטים שנותחו",
    "analysisDate": "תאריך",
    "confidence": "רמת הביטחון בניתוח (high/medium/low)"
  },
  "persona": {
    "name": "מירן בוזגלו",
    "bio": "תיאור קצר מדויק (2-3 משפטים)",
    "description": "תיאור מפורט (5-6 משפטים)",
    "expertiseAreas": [
      {
        "name": "שם התחום",
        "percentage": "אחוז מהתוכן",
        "description": "פירוט",
        "examples": ["דוגמה 1", "דוגמה 2"]
      }
    ],
    "topics": ["נושא 1", "נושא 2", ...],
    "tone": "תיאור מפורט של הטון",
    "voiceCharacteristics": {
      "style": "סגנון הדיבור",
      "commonPhrases": ["ביטוי 1", "ביטוי 2", ...],
      "addressingAudience": "איך היא פונה לקהל",
      "humorStyle": "סגנון ההומור אם קיים"
    },
    "personalityTraits": [
      {
        "trait": "תכונה",
        "evidence": "ראיות מהתוכן"
      }
    ],
    "targetAudience": {
      "primary": "קהל עיקרי",
      "demographics": "דמוגרפיה",
      "needs": ["צורך 1", "צורך 2"]
    },
    "products": [
      {
        "name": "שם המוצר/מותג",
        "category": "קטגוריה",
        "frequency": "כמה פעמים מופיע",
        "sentiment": "איך היא מדברת עליו"
      }
    ],
    "sensitiveTopics": [
      {
        "topic": "נושא רגיש",
        "context": "הקשר",
        "approach": "איך היא מתייחסת אליו"
      }
    ],
    "responseStyle": "איך היא עונה - פירוט מלא",
    "contentThemes": ["נושא מרכזי 1", "נושא מרכזי 2", ...]
  },
  "recommendations": {
    "chatbotTone": "המלצות לטון הצ'אטבוט",
    "mustInclude": ["מה חובה להכניס לצ'אטבוט"],
    "avoidance": ["מה להימנע ממנו"],
    "specialInstructions": ["הוראות מיוחדות"]
  }
}
\`\`\`

⚠️ **קריטי:**
1. נתח **כל** התוכן - אל תדלג על כלום
2. התבסס רק על עובדות מהתוכן
3. תן דוגמאות ספציפיות
4. הכל בעברית!
5. היה מפורט ומדויק!`;

  console.log('⏳ ממתין לתגובה מ-GPT-5.2 Pro...\n');

  const startTime = Date.now();
  
  // Using OpenAI's new Responses API with GPT-5.2 Pro
  const result = await openai.responses.create({
    model: modelName,
    input: analysisPrompt,
    reasoning: {
      effort: 'high' // GPT-5.2 Pro with high reasoning for deep analysis
    },
    text: {
      verbosity: 'high' // We want detailed analysis
    }
  });
  
  const response = result.output_text;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`✅ התקבלה תשובה תוך ${duration} שניות\n`);
  console.log('═'.repeat(80));

  // Extract JSON
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : response;
  
  let analysis;
  try {
    analysis = JSON.parse(jsonStr);
  } catch (e) {
    console.error('❌ שגיאה בפרסור JSON:', e.message);
    console.log('\n📄 תשובה מלאה:\n');
    console.log(response);
    process.exit(1);
  }

  console.log('\n📊 תוצאות הניתוח:\n');
  console.log(JSON.stringify(analysis, null, 2));

  // ===== 5. עדכון הדאטה-בייס =====
  console.log('\n═'.repeat(80));
  console.log('💾 מעדכן את הדאטה-בייס...');
  console.log('═'.repeat(80));
  console.log('');

  const { data: updated, error } = await supabase
    .from('chatbot_persona')
    .update({
      bio: analysis.persona.bio,
      description: analysis.persona.description,
      interests: analysis.persona.expertiseAreas?.map(e => e.name) || [],
      topics: analysis.persona.topics || [],
      tone: analysis.persona.tone,
      response_style: analysis.persona.responseStyle,
      metadata: {
        ...analysis,
        analyzed_at: new Date().toISOString(),
        analyzed_content: {
          posts: postsWithContent.length,
          transcriptions: transWithContent.length,
          highlights: highlightsWithContent.length,
          partnerships: allPartnerships?.length || 0,
          coupons: allCoupons?.length || 0,
        },
        model_used: 'gpt-5.2-pro',
        reasoning_effort: 'high',
        analysis_duration_seconds: parseFloat(duration),
      }
    })
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .select();

  if (error) {
    console.error('❌ שגיאה בעדכון:', error);
    process.exit(1);
  }

  console.log('✅ הפרסונה עודכנה בהצלחה!\n');
  console.log('═'.repeat(80));
  console.log('🎉 ניתוח הושלם!');
  console.log('═'.repeat(80));
  console.log('');
  console.log('📈 סטטיסטיקות:');
  console.log(`   • נותחו: ${postsWithContent.length} פוסטים + ${transWithContent.length} תמלולים`);
  console.log(`   • זמן ניתוח: ${duration} שניות`);
  console.log(`   • מודל: OpenAI GPT-5.2 Pro`);
  console.log(`   • Reasoning: High`);
  console.log('');
}

main().catch(console.error);
