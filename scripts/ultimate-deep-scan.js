/**
 * 🔥 ULTIMATE DEEP SCAN - הסריקה הכי עמוקה!
 * 
 * סורק את **כל** התוכן של המשפיענית:
 * - כל הפוסטים (ללא הגבלה)
 * - כל הרילס + תמלולים
 * - כל ההילייטס
 * - כל האתרים
 * - כל השותפויות
 * 
 * משתמש ב-GPT-5.2 Pro לניתוח מעמיק!
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config();

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  console.log('🔥'.repeat(40));
  console.log('🔥 ULTIMATE DEEP SCAN - הסריקה המושלמת!');
  console.log('🔥'.repeat(40));
  console.log('');
  console.log('⚠️  זה יכול לקחת זמן רב - אל תפסיק!');
  console.log('');

  const startTime = Date.now();

  // Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  );

  // OpenAI
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // ===== 1. סריקה מלאה של כל הנתונים =====
  console.log('📊 שלב 1/5: סריקה מלאה של כל הנתונים...\n');

  console.log('  📸 שולף **כל** הפוסטים (ללא הגבלה)...');
  const { data: allPosts, error: postsError } = await supabase
    .from('instagram_posts')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('posted_at', { ascending: false });

  if (postsError) {
    console.error('❌ שגיאה בשליפת פוסטים:', postsError);
  } else {
    console.log(`     ✅ נשלפו ${allPosts.length} פוסטים`);
  }

  console.log('  🎬 שולף **כל** התמלולים...');
  const { data: allTranscriptions, error: transError } = await supabase
    .from('instagram_transcriptions')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('created_at', { ascending: false });

  if (transError) {
    console.error('❌ שגיאה בשליפת תמלולים:', transError);
  } else {
    console.log(`     ✅ נשלפו ${allTranscriptions.length} תמלולים`);
  }

  console.log('  ⭐ שולף **כל** ההילייטס...');
  const { data: allHighlights, error: highlightsError } = await supabase
    .from('instagram_highlights')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('created_at', { ascending: false });

  if (highlightsError) {
    console.error('❌ שגיאה בשליפת הילייטס:', highlightsError);
  } else {
    console.log(`     ✅ נשלפו ${allHighlights.length} הילייטס`);
  }

  console.log('  🌐 שולף **כל** האתרים...');
  const { data: allWebsites, error: websitesError } = await supabase
    .from('instagram_bio_websites')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  if (websitesError) {
    console.error('❌ שגיאה בשליפת אתרים:', websitesError);
  } else {
    console.log(`     ✅ נשלפו ${allWebsites?.length || 0} אתרים`);
  }

  console.log('  🤝 שולף **כל** השותפויות...');
  const { data: allPartnerships, error: partnershipsError } = await supabase
    .from('partnerships')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  if (partnershipsError) {
    console.error('❌ שגיאה בשליפת שותפויות:', partnershipsError);
  } else {
    console.log(`     ✅ נשלפו ${allPartnerships?.length || 0} שותפויות`);
  }

  console.log('  🎟️ שולף **כל** הקופונים...');
  const { data: allCoupons, error: couponsError } = await supabase
    .from('coupons')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  if (couponsError) {
    console.error('❌ שגיאה בשליפת קופונים:', couponsError);
  } else {
    console.log(`     ✅ נשלפו ${allCoupons?.length || 0} קופונים`);
  }

  console.log('');
  console.log('═'.repeat(80));
  console.log('📊 סיכום הנתונים שנשלפו:');
  console.log(`   📸 פוסטים: ${allPosts?.length || 0}`);
  console.log(`   🎬 תמלולים: ${allTranscriptions?.length || 0}`);
  console.log(`   ⭐ הילייטס: ${allHighlights?.length || 0}`);
  console.log(`   🌐 אתרים: ${allWebsites?.length || 0}`);
  console.log(`   🤝 שותפויות: ${allPartnerships?.length || 0}`);
  console.log(`   🎟️ קופונים: ${allCoupons?.length || 0}`);
  console.log('═'.repeat(80));
  console.log('');

  // ===== 2. ניקוי והכנת נתונים =====
  console.log('🧹 שלב 2/5: ניקוי והכנת נתונים...\n');

  const postsWithContent = allPosts?.filter(p => p.caption && p.caption.trim().length > 10) || [];
  const transWithContent = allTranscriptions?.filter(t => t.transcription_text && t.transcription_text.trim().length > 20) || [];
  const highlightsWithContent = allHighlights?.filter(h => h.title) || [];

  console.log(`   ✅ פוסטים עם תוכן: ${postsWithContent.length}`);
  console.log(`   ✅ תמלולים עם טקסט: ${transWithContent.length}`);
  console.log(`   ✅ הילייטס עם כותרת: ${highlightsWithContent.length}`);
  console.log('');

  // ===== 3. בניית Dataset מלא =====
  console.log('📊 שלב 3/5: בניית Dataset מלא (ללא הגבלות!)...\n');

  const fullDataset = {
    posts: postsWithContent.map(p => ({
      id: p.id,
      type: p.type,
      caption: p.caption,
      hashtags: p.hashtags,
      engagement_rate: p.engagement_rate,
      likes: p.likes_count,
      comments: p.comments_count,
      posted_at: p.posted_at,
      media_url: p.media_url,
    })),
    transcriptions: transWithContent.map(t => ({
      id: t.id,
      text: t.transcription_text,
      created_at: t.created_at,
      source: t.source_type,
    })),
    highlights: highlightsWithContent.map(h => ({
      id: h.id,
      title: h.title,
      cover_image: h.cover_image_url,
      items_count: h.items_count,
    })),
    websites: allWebsites?.map(w => ({
      url: w.url,
      title: w.title,
      description: w.description,
    })) || [],
    partnerships: allPartnerships?.map(p => ({
      brand: p.brand_name,
      category: p.category,
      brief: p.brief,
      link: p.link,
      status: p.status,
    })) || [],
    coupons: allCoupons?.map(c => ({
      code: c.code,
      description: c.description,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      brand: c.partnership_id, // We'll need to join this later
    })) || [],
  };

  // Calculate total size
  const totalChars = JSON.stringify(fullDataset).length;
  const totalMB = (totalChars / (1024 * 1024)).toFixed(2);

  console.log(`   📏 גודל Dataset: ${(totalChars / 1000).toFixed(1)}K תווים (${totalMB} MB)`);
  console.log('');

  // ===== 4. ניתוח עמוק עם GPT-5.2 Pro =====
  console.log('═'.repeat(80));
  console.log('🤖 שלב 4/5: ניתוח מעמיק עם GPT-5.2 Pro (High Reasoning)');
  console.log('   ⚠️  זה עשוי לקחת מספר דקות - אל תפסיק!');
  console.log('═'.repeat(80));
  console.log('');

  const analysisPrompt = `אתה מנתח תוכן מומחה. תפקידך לבנות את הפרסונה הכי מדויקת של מירן בוזגלו.

# 📊 Dataset מלא - ${postsWithContent.length} פוסטים + ${transWithContent.length} תמלולים

${generateDetailedAnalysisPrompt(fullDataset)}

---

# 🎯 משימה: ניתוח עמוק ומקיף

בנה Persona **מפורטת ביותר** בעברית. התבסס **רק** על התוכן שראית.

החזר JSON בפורמט הזה:

\`\`\`json
{
  "metadata": {
    "analyzed_at": "תאריך",
    "total_content": "סה״כ פריטים",
    "analysis_duration_minutes": "זמן ניתוח",
    "confidence_level": "high|very_high"
  },
  "persona": {
    "name": "מירן בוזגלו",
    "bio": "תיאור קצר ומדויק (2-3 משפטים)",
    "fullDescription": "תיאור מלא ומקיף (10-15 משפטים)",
    "expertise": [
      {
        "domain": "תחום",
        "percentage": 0-100,
        "description": "פירוט מלא",
        "keyTopics": ["נושא 1", "נושא 2"],
        "examples": ["דוגמה 1", "דוגמה 2"]
      }
    ],
    "voiceAndTone": {
      "primaryTone": "תיאור הטון העיקרי",
      "secondaryTones": ["טון משני 1", "טון משני 2"],
      "signature_phrases": ["ביטוי 1", "ביטוי 2", "..."],
      "addressing_style": "איך היא פונה לקהל",
      "humor_style": "סגנון ההומור",
      "emotional_range": "טווח רגשי",
      "formality_level": "רמת פורמליות"
    },
    "contentThemes": [
      {
        "theme": "נושא מרכזי",
        "frequency": "high|medium|low",
        "description": "תיאור מפורט",
        "subtopics": ["תת-נושא 1", "..."],
        "examples": ["דוגמה 1", "..."]
      }
    ],
    "products_and_brands": [
      {
        "name": "שם המוצר/מותג",
        "category": "קטגוריה",
        "mention_frequency": "high|medium|low",
        "sentiment": "חיובי|ניטרלי|שלילי",
        "usage_context": "איך היא מדברת עליו",
        "specific_products": ["מוצר 1", "..."]
      }
    ],
    "audience": {
      "primary_demographic": "קהל עיקרי",
      "age_range": "טווח גילאים",
      "gender": "מגדר עיקרי",
      "interests": ["עניין 1", "..."],
      "pain_points": ["כאב 1", "..."],
      "aspirations": ["שאיפה 1", "..."]
    },
    "sensitive_topics": [
      {
        "topic": "נושא רגיש",
        "frequency": "high|medium|low",
        "context": "הקשר",
        "approach": "איך היא מתייחסת",
        "key_messages": ["מסר 1", "..."]
      }
    ],
    "response_patterns": {
      "typical_structure": "מבנה תשובה טיפוסי",
      "opening_styles": ["סגנון פתיחה 1", "..."],
      "closing_styles": ["סגנון סיום 1", "..."],
      "call_to_action_patterns": ["CTA 1", "..."],
      "question_handling": "איך היא עונה על שאלות",
      "objection_handling": "איך היא מטפלת בהתנגדויות"
    },
    "values_and_beliefs": {
      "core_values": ["ערך 1", "..."],
      "recurring_themes": ["נושא חוזר 1", "..."],
      "life_philosophy": "פילוסופיית חיים",
      "role_models": ["דמות השראה 1", "..."]
    }
  },
  "chatbot_guidelines": {
    "must_include": ["חובה 1", "..."],
    "must_avoid": ["להימנע 1", "..."],
    "tone_calibration": "הנחיות כיול טון",
    "response_templates": [
      {
        "scenario": "סיטואציה",
        "template": "תבנית תשובה",
        "example": "דוגמה"
      }
    ],
    "edge_cases": [
      {
        "case": "מקרה קצה",
        "handling": "איך לטפל"
      }
    ]
  }
}
\`\`\`

⚠️ **חשוב מאוד:**
1. נתח **כל** התוכן בפירוט
2. תן דוגמאות ספציפיות מהתוכן
3. היה מדויק ומקיף
4. הכל בעברית!`;

  console.log('⏳ שולח ל-GPT-5.2 Pro...\n');

  const analysisStart = Date.now();

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.2-pro',
      input: analysisPrompt,
      reasoning: {
        effort: 'high' // Maximum reasoning!
      },
      text: {
        verbosity: 'high' // Maximum detail!
      },
      // No token limit - let it be as long as needed!
    });

    const analysisDuration = ((Date.now() - analysisStart) / 1000).toFixed(1);
    console.log(`✅ התקבלה תשובה תוך ${analysisDuration} שניות\n`);

    const analysisText = response.output_text;

    // Extract JSON
    const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : analysisText;

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      console.error('❌ שגיאה בפרסור JSON:', e.message);
      console.log('\n📄 תשובה מלאה:\n');
      console.log(analysisText);
      process.exit(1);
    }

    console.log('═'.repeat(80));
    console.log('📊 ניתוח הושלם בהצלחה!');
    console.log('═'.repeat(80));
    console.log('');

    // ===== 5. שמירה בדאטה-בייס =====
    console.log('💾 שלב 5/5: שמירה בדאטה-בייס...\n');

    const { data: updated, error: updateError } = await supabase
      .from('chatbot_persona')
      .update({
        bio: analysis.persona.bio,
        description: analysis.persona.fullDescription,
        interests: analysis.persona.expertise?.map(e => e.domain) || [],
        topics: analysis.persona.contentThemes?.map(t => t.theme) || [],
        tone: analysis.persona.voiceAndTone?.primaryTone,
        response_style: analysis.persona.response_patterns?.typical_structure,
        metadata: {
          ...analysis,
          scan_type: 'ultimate_deep_scan',
          scanned_content: {
            posts: postsWithContent.length,
            transcriptions: transWithContent.length,
            highlights: highlightsWithContent.length,
            websites: allWebsites?.length || 0,
            partnerships: allPartnerships?.length || 0,
            coupons: allCoupons?.length || 0,
          },
          dataset_size_mb: parseFloat(totalMB),
          model_used: 'gpt-5.2-pro',
          reasoning_effort: 'high',
          verbosity: 'high',
          analysis_duration_seconds: parseFloat(analysisDuration),
        }
      })
      .eq('account_id', MIRAN_ACCOUNT_ID)
      .select();

    if (updateError) {
      console.error('❌ שגיאה בעדכון:', updateError);
      process.exit(1);
    }

    console.log('✅ הפרסונה עודכנה בהצלחה!\n');

    // ===== סיכום סופי =====
    const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('');
    console.log('🎉'.repeat(40));
    console.log('🎉 ULTIMATE DEEP SCAN הושלם בהצלחה!');
    console.log('🎉'.repeat(40));
    console.log('');
    console.log('📊 סטטיסטיקות:');
    console.log(`   • סה״כ פריטים נותחו: ${postsWithContent.length + transWithContent.length + highlightsWithContent.length}`);
    console.log(`   • גודל Dataset: ${totalMB} MB`);
    console.log(`   • זמן ניתוח GPT: ${analysisDuration} שניות`);
    console.log(`   • זמן כולל: ${totalDuration} דקות`);
    console.log(`   • מודל: GPT-5.2 Pro (High Reasoning)`);
    console.log('');

  } catch (error) {
    console.error('❌ שגיאה בניתוח:', error);
    process.exit(1);
  }
}

/**
 * יוצר prompt מפורט עם כל התוכן
 */
function generateDetailedAnalysisPrompt(dataset) {
  let prompt = '';

  // Posts
  prompt += `\n## 📸 ${dataset.posts.length} פוסטים מלאים:\n\n`;
  dataset.posts.forEach((p, i) => {
    prompt += `### פוסט #${i + 1} [${p.type}] - ${new Date(p.posted_at).toLocaleDateString('he-IL')}\n`;
    prompt += `**Engagement:** ${(parseFloat(p.engagement_rate || 0) * 100).toFixed(1)}% | **Likes:** ${p.likes || 0} | **Comments:** ${p.comments || 0}\n\n`;
    prompt += `${p.caption}\n\n`;
    if (p.hashtags && p.hashtags.length > 0) {
      prompt += `**Hashtags:** ${p.hashtags.join(', ')}\n\n`;
    }
    prompt += `---\n\n`;
  });

  // Transcriptions
  prompt += `\n## 🎬 ${dataset.transcriptions.length} תמלולים מסרטונים:\n\n`;
  dataset.transcriptions.forEach((t, i) => {
    prompt += `### תמלול #${i + 1}\n`;
    prompt += `${t.text}\n\n`;
    prompt += `---\n\n`;
  });

  // Highlights
  if (dataset.highlights.length > 0) {
    prompt += `\n## ⭐ ${dataset.highlights.length} הילייטס:\n\n`;
    dataset.highlights.forEach((h, i) => {
      prompt += `${i + 1}. **${h.title}** (${h.items_count || 0} פריטים)\n`;
    });
    prompt += `\n`;
  }

  // Partnerships
  if (dataset.partnerships.length > 0) {
    prompt += `\n## 🤝 ${dataset.partnerships.length} שותפויות:\n\n`;
    dataset.partnerships.forEach((p, i) => {
      prompt += `${i + 1}. **${p.brand}**`;
      if (p.category) prompt += ` (${p.category})`;
      prompt += `\n`;
      if (p.brief) prompt += `   ${p.brief}\n`;
      if (p.link) prompt += `   🔗 ${p.link}\n`;
      prompt += `\n`;
    });
  }

  // Coupons
  if (dataset.coupons.length > 0) {
    prompt += `\n## 🎟️ ${dataset.coupons.length} קופונים:\n\n`;
    dataset.coupons.forEach((c, i) => {
      prompt += `${i + 1}. **${c.code}**\n`;
      if (c.description) prompt += `   ${c.description}\n`;
      prompt += `   הנחה: ${c.discount_type === 'percentage' ? `${c.discount_value}%` : `${c.discount_value} ש"ח`}\n\n`;
    });
  }

  // Websites
  if (dataset.websites.length > 0) {
    prompt += `\n## 🌐 ${dataset.websites.length} אתרים:\n\n`;
    dataset.websites.forEach((w, i) => {
      prompt += `${i + 1}. **${w.title || w.url}**\n`;
      if (w.description) prompt += `   ${w.description}\n`;
      prompt += `   🔗 ${w.url}\n\n`;
    });
  }

  return prompt;
}

main().catch(console.error);
