/**
 * 🔥 ULTIMATE PERSONA BUILDER
 * 
 * 1. סורק 100 פוסטים מאינסטגרם
 * 2. מתמלל סרטונים חדשים עם gpt-4o-transcribe
 * 3. מנתח הכל עם GPT-5.2 Pro
 * 
 * ⚠️ עשוי לקחת 1-4 שעות!
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';
const MIRAN_USERNAME = 'miranbuzaglo';
const TARGET_POSTS = 100;

async function main() {
  console.log('🔥'.repeat(50));
  console.log('🔥 ULTIMATE PERSONA BUILDER');
  console.log('🔥 סריקה מלאה + תמלול + ניתוח GPT-5.2 Pro');
  console.log('🔥'.repeat(50));
  console.log('');
  console.log('⚠️  עשוי לקחת 1-4 שעות - אל תפסיק!');
  console.log('');

  const overallStart = Date.now();

  // Clients
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  );

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // ===== שלב 1: בדיקת מצב נוכחי =====
  console.log('═'.repeat(80));
  console.log('📊 שלב 1/4: בדיקת מצב נוכחי');
  console.log('═'.repeat(80));
  console.log('');

  const { data: currentPosts, count: currentPostsCount } = await supabase
    .from('instagram_posts')
    .select('*', { count: 'exact' })
    .eq('account_id', MIRAN_ACCOUNT_ID);

  const { data: currentTrans, count: currentTransCount } = await supabase
    .from('instagram_transcriptions')
    .select('*', { count: 'exact' })
    .eq('account_id', MIRAN_ACCOUNT_ID);

  console.log(`📸 פוסטים נוכחיים: ${currentPostsCount}`);
  console.log(`🎬 תמלולים נוכחיים: ${currentTransCount}`);
  console.log('');

  const postsNeeded = Math.max(0, TARGET_POSTS - currentPostsCount);

  if (postsNeeded > 0) {
    console.log(`⚠️  צריך לסרוק עוד ${postsNeeded} פוסטים!\n`);
  }

  // ===== שלב 2: סריקת פוסטים נוספים =====
  if (postsNeeded > 0) {
    console.log('═'.repeat(80));
    console.log(`📥 שלב 2/4: סריקת ${postsNeeded} פוסטים נוספים מאינסטגרם`);
    console.log('═'.repeat(80));
    console.log('');

    console.log('🔍 קורא ל-ScrapeCreators API...\n');

    try {
      // Call ScrapeCreators to get more posts
      const response = await axios.post(
        'https://api.scrapecreators.com/v1/instagram/profile',
        {
          username: MIRAN_USERNAME,
          include_posts: true,
          max_posts: TARGET_POSTS,
          include_reels: true,
          include_highlights: true,
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.SCRAPECREATORS_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000, // 5 minutes
        }
      );

      console.log('✅ התקבלו נתונים מ-ScrapeCreators\n');

      // Save new posts to database
      const newPosts = response.data.posts || [];
      console.log(`💾 שומר ${newPosts.length} פוסטים חדשים...\n`);

      // TODO: Insert to database (implement based on your schema)
      
    } catch (error) {
      console.error('❌ שגיאה בסריקה:', error.message);
      console.log('   ⚠️  ממשיך עם הנתונים הקיימים...\n');
    }
  } else {
    console.log('✅ שלב 2/4: יש מספיק פוסטים!\n');
  }

  // ===== שלב 3: תמלול סרטונים חסרים =====
  console.log('═'.repeat(80));
  console.log('🎙️ שלב 3/4: תמלול סרטונים חסרים עם gpt-4o-transcribe');
  console.log('═'.repeat(80));
  console.log('');

  // Find reels without transcriptions
  const { data: reelsWithoutTrans } = await supabase
    .from('instagram_posts')
    .select('id, caption, media_urls')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .eq('type', 'reel')
    .not('media_urls', 'is', null);

  const transcribedIds = new Set(
    currentTrans?.filter(t => t.source_type === 'post').map(t => t.source_id) || []
  );

  const needsTranscription = reelsWithoutTrans?.filter(r => !transcribedIds.has(r.id)) || [];

  console.log(`📹 סה״כ reels: ${reelsWithoutTrans?.length || 0}`);
  console.log(`✅ מתומללים: ${transcribedIds.size}`);
  console.log(`⚠️  צריכים תמלול: ${needsTranscription.length}\n`);

  if (needsTranscription.length > 0) {
    console.log('🎙️ מתחיל תמלול...\n');

    for (let i = 0; i < needsTranscription.length; i++) {
      const reel = needsTranscription[i];
      console.log(`📹 [${i + 1}/${needsTranscription.length}] מתמלל: ${reel.id.substring(0, 8)}...`);

      try {
        // Get video URL from media_urls array
        const videoUrl = Array.isArray(reel.media_urls) 
          ? reel.media_urls[0] 
          : reel.media_urls?.url || reel.media_urls;

        if (!videoUrl || typeof videoUrl !== 'string') {
          console.log('   ⚠️  אין URL - מדלג\n');
          continue;
        }

        // Download video temporarily
        const videoResponse = await axios.get(videoUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
        });

        // Save to temp file
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `reel_${Date.now()}.mp4`);
        fs.writeFileSync(tempFile, Buffer.from(videoResponse.data));

        try {
          // Transcribe with gpt-4o-transcribe
          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFile),
            model: 'gpt-4o-transcribe',
            language: 'he',
            response_format: 'text',
            prompt: 'זהו תמלול של סרטון אינסטגרם של מירן בוזגלו, משפיענית ישראלית. התוכן כולל: טיפוח, איפור, מתכונים, חיי משפחה, טיפים, המלצות על מוצרים (Sacara, Argania, Spring, Leaves, Renuar), ושיחות עם הילדים ובעלה מאור.',
          });

          console.log(`   ✅ תמלול: "${transcription.text.substring(0, 80)}..."\n`);

          // Save to database
          await supabase
            .from('instagram_transcriptions')
            .insert({
              account_id: MIRAN_ACCOUNT_ID,
              source_id: reel.id,
              source_type: 'post',
              transcription_text: transcription.text,
              language: 'he',
              processing_status: 'completed',
              gemini_model_used: 'gpt-4o-transcribe',
              video_url: videoUrl,
            });
        } finally {
          // Cleanup temp file
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`   ❌ שגיאה: ${error.message}\n`);
      }
    }

    console.log('✅ תמלול הושלם!\n');
  } else {
    console.log('✅ כל הסרטונים כבר מתומללים!\n');
  }

  // ===== שלב 4: שליפת כל הנתונים לניתוח =====
  console.log('═'.repeat(80));
  console.log('📊 שלב 4/4: שליפה מלאה של כל הנתונים');
  console.log('═'.repeat(80));
  console.log('');

  const { data: finalPosts } = await supabase
    .from('instagram_posts')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('posted_at', { ascending: false });

  const { data: finalTrans } = await supabase
    .from('instagram_transcriptions')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('created_at', { ascending: false });

  const { data: finalHighlights } = await supabase
    .from('instagram_highlights')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  const { data: finalPartnerships } = await supabase
    .from('partnerships')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  const { data: finalCoupons } = await supabase
    .from('coupons')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  // Build comprehensive dataset
  const postsWithCaption = finalPosts?.filter(p => p.caption && p.caption.trim().length > 10) || [];
  const transWithSpeech = finalTrans?.filter(t => t.transcription_text && t.transcription_text.length > 20) || [];
  const transWithScreenText = finalTrans?.filter(t => t.on_screen_text && t.on_screen_text.length > 0) || [];

  console.log('📊 סיכום נתונים לניתוח:');
  console.log(`   📸 פוסטים: ${finalPosts?.length || 0}`);
  console.log(`   📝 פוסטים עם תוכן: ${postsWithCaption.length}`);
  console.log(`   🎬 תמלולים עם דיבור: ${transWithSpeech.length}`);
  console.log(`   📺 תמלולים עם טקסט על המסך: ${transWithScreenText.length}`);
  console.log(`   ⭐ הילייטס: ${finalHighlights?.length || 0}`);
  console.log(`   🤝 שותפויות: ${finalPartnerships?.length || 0}`);
  console.log(`   🎟️ קופונים: ${finalCoupons?.length || 0}`);
  console.log('');

  // Calculate total content size
  const totalContent = 
    postsWithCaption.map(p => p.caption).join('\n') +
    transWithSpeech.map(t => t.transcription_text).join('\n') +
    transWithScreenText.map(t => t.on_screen_text.join(' ')).join('\n');

  const totalChars = totalContent.length;
  const totalMB = (totalChars / (1024 * 1024)).toFixed(2);

  console.log(`📏 גודל תוכן כולל: ${(totalChars / 1000).toFixed(1)}K תווים (${totalMB} MB)`);
  console.log('');

  // ===== ניתוח עמוק עם GPT-5.2 Pro =====
  console.log('═'.repeat(80));
  console.log('🤖 מריץ ניתוח מעמיק עם GPT-5.2 Pro');
  console.log('   ⚠️  זה עשוי לקחת 5-15 דקות');
  console.log('═'.repeat(80));
  console.log('');

  const analysisPrompt = buildComprehensivePrompt({
    posts: postsWithCaption,
    transcriptions: finalTrans,
    highlights: finalHighlights,
    partnerships: finalPartnerships,
    coupons: finalCoupons,
  });

  console.log('⏳ שולח ל-GPT-5.2 Pro...\n');

  const analysisStart = Date.now();

  const response = await openai.responses.create({
    model: 'gpt-5.2-pro',
    input: analysisPrompt,
    reasoning: {
      effort: 'high'
    },
    text: {
      verbosity: 'high'
    }
  });

  const analysisDuration = ((Date.now() - analysisStart) / 1000).toFixed(1);
  console.log(`✅ ניתוח הושלם תוך ${analysisDuration} שניות (${(analysisDuration / 60).toFixed(1)} דקות)\n`);

  // Parse response
  const analysisText = response.output_text;
  const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/);
  const analysis = JSON.parse(jsonMatch ? jsonMatch[1] : analysisText);

  // ===== שמירה בדאטה-בייס =====
  console.log('💾 שומר Persona בדאטה-בייס...\n');

  const { error: updateError } = await supabase
    .from('chatbot_persona')
    .update({
      bio: analysis.persona.bio,
      description: analysis.persona.fullDescription || analysis.persona.description,
      interests: analysis.persona.expertise?.map(e => e.domain || e.name) || [],
      topics: analysis.persona.contentThemes?.map(t => t.theme || t.name) || analysis.persona.topics || [],
      tone: analysis.persona.voiceAndTone?.primaryTone || analysis.persona.tone,
      response_style: analysis.persona.response_patterns?.typical_structure || analysis.persona.responseStyle,
      metadata: {
        ...analysis,
        ultimate_scan: {
          completed_at: new Date().toISOString(),
          content_analyzed: {
            posts: postsWithCaption.length,
            transcriptions_speech: transWithSpeech.length,
            transcriptions_screen_text: transWithScreenText.length,
            highlights: finalHighlights?.length || 0,
            partnerships: finalPartnerships?.length || 0,
            coupons: finalCoupons?.length || 0,
          },
          dataset_size_mb: parseFloat(totalMB),
          model: 'gpt-5.2-pro',
          reasoning: 'high',
          verbosity: 'high',
          duration_seconds: parseFloat(analysisDuration),
        }
      }
    })
    .eq('account_id', MIRAN_ACCOUNT_ID);

  if (updateError) {
    console.error('❌ שגיאה בשמירה:', updateError);
    process.exit(1);
  }

  // ===== סיכום =====
  const totalDuration = ((Date.now() - overallStart) / 1000 / 60).toFixed(1);

  console.log('');
  console.log('🎉'.repeat(50));
  console.log('🎉 ULTIMATE PERSONA BUILDER הושלם!');
  console.log('🎉'.repeat(50));
  console.log('');
  console.log('📊 סטטיסטיקות סופיות:');
  console.log(`   • פוסטים נותחו: ${postsWithCaption.length}`);
  console.log(`   • תמלולים עם דיבור: ${transWithSpeech.length}`);
  console.log(`   • תמלולים עם טקסט על מסך: ${transWithScreenText.length}`);
  console.log(`   • גודל Dataset: ${totalMB} MB`);
  console.log(`   • זמן ניתוח AI: ${(analysisDuration / 60).toFixed(1)} דקות`);
  console.log(`   • זמן כולל: ${totalDuration} דקות`);
  console.log(`   • מודל: GPT-5.2 Pro (High Reasoning + High Verbosity)`);
  console.log('');
}

/**
 * Build comprehensive analysis prompt
 */
function buildComprehensivePrompt(data) {
  const { posts, transcriptions, highlights, partnerships, coupons } = data;

  // Separate transcriptions by type
  const transWithSpeech = transcriptions?.filter(t => 
    t.transcription_text && t.transcription_text.length > 20
  ) || [];
  
  const transWithScreenText = transcriptions?.filter(t => 
    t.on_screen_text && t.on_screen_text.length > 0
  ) || [];

  let prompt = `אתה מנתח תוכן מומחה. תפקידך לבנות את הפרסונה הכי מדויקת של מירן בוזגלו.

# 📊 Dataset מלא של מירן בוזגלו

## 📸 ${posts.length} פוסטים:

`;

  // Add all posts
  posts.forEach((p, i) => {
    prompt += `### פוסט #${i + 1} [${p.type}] - ${new Date(p.posted_at).toLocaleDateString('he-IL')}\n`;
    prompt += `**Engagement:** ${(parseFloat(p.engagement_rate || 0) * 100).toFixed(1)}% | `;
    prompt += `**Likes:** ${p.likes_count || 0} | **Comments:** ${p.comments_count || 0}\n\n`;
    prompt += `${p.caption}\n\n`;
    if (p.hashtags && p.hashtags.length > 0) {
      prompt += `**Hashtags:** ${p.hashtags.join(', ')}\n`;
    }
    prompt += `---\n\n`;
  });

  // Add all transcriptions with speech
  prompt += `\n## 🎬 ${transWithSpeech.length} תמלולים (דיבור):\n\n`;
  transWithSpeech.forEach((t, i) => {
    prompt += `### תמלול #${i + 1}\n`;
    prompt += `${t.transcription_text}\n\n`;
    prompt += `---\n\n`;
  });

  // Add screen text
  if (transWithScreenText.length > 0) {
    prompt += `\n## 📺 ${transWithScreenText.length} טקסטים על המסך:\n\n`;
    transWithScreenText.forEach((t, i) => {
      if (t.on_screen_text && t.on_screen_text.length > 0) {
        prompt += `${i + 1}. ${t.on_screen_text.join(' | ')}\n`;
      }
    });
    prompt += `\n`;
  }

  // Add highlights
  if (highlights && highlights.length > 0) {
    prompt += `\n## ⭐ ${highlights.length} הילייטס:\n\n`;
    highlights.forEach((h, i) => {
      prompt += `${i + 1}. **${h.title}** (${h.items_count || 0} פריטים)\n`;
    });
    prompt += `\n`;
  }

  // Add partnerships
  if (partnerships && partnerships.length > 0) {
    prompt += `\n## 🤝 ${partnerships.length} שותפויות:\n\n`;
    partnerships.forEach((p, i) => {
      prompt += `${i + 1}. **${p.brand_name}**`;
      if (p.category) prompt += ` (${p.category})`;
      prompt += `\n`;
      if (p.brief) prompt += `   ${p.brief}\n`;
      if (p.link) prompt += `   🔗 ${p.link}\n`;
      prompt += `\n`;
    });
  }

  // Add coupons
  if (coupons && coupons.length > 0) {
    prompt += `\n## 🎟️ ${coupons.length} קופונים:\n\n`;
    coupons.forEach((c, i) => {
      prompt += `${i + 1}. **${c.code}**\n`;
      if (c.description) prompt += `   ${c.description}\n`;
      prompt += `   הנחה: ${c.discount_type === 'percentage' ? `${c.discount_value}%` : `${c.discount_value} ש"ח`}\n\n`;
    });
  }

  prompt += `\n---\n\n# 🎯 משימה: בניית Persona מושלמת

נתח **כל** התוכן למעלה בצורה מעמיקה וקפדנית. בנה Persona **מפורטת ומדויקת ביותר**.

החזר JSON מובנה בפורמט הזה (הכל **בעברית**):

\`\`\`json
{
  "metadata": {
    "analyzed_at": "${new Date().toISOString()}",
    "total_items_analyzed": ${posts.length + transWithSpeech.length + transWithScreenText.length},
    "confidence": "very_high"
  },
  "persona": {
    "name": "מירן בוזגלו",
    "bio": "תיאור קצר (2-3 משפטים) - מה היא עושה",
    "fullDescription": "תיאור מלא (8-12 משפטים) - מי היא, מה הסגנון, על מה התוכן",
    "expertise": [
      {
        "domain": "שם התחום",
        "percentage": "אחוז מהתוכן",
        "description": "פירוט מלא",
        "keyTopics": ["נושא מרכזי 1", "נושא מרכזי 2"],
        "examples": ["דוגמה ספציפית 1", "דוגמה ספציפית 2"]
      }
    ],
    "voiceAndTone": {
      "primaryTone": "הטון העיקרי",
      "signature_phrases": ["ביטוי חוזר 1", "ביטוי חוזר 2", "..."],
      "addressing_style": "איך היא פונה (חיים שלי, בנות, וכו')",
      "emotional_range": "טווח רגשי"
    },
    "contentThemes": [
      {
        "theme": "נושא מרכזי",
        "frequency": "high|medium|low",
        "description": "תיאור מפורט",
        "examples": ["דוגמה 1", "דוגמה 2"]
      }
    ],
    "products_and_brands": [
      {
        "name": "שם מוצר/מותג",
        "category": "קטגוריה",
        "frequency": "high|medium|low",
        "specific_mentions": ["מוצר ספציפי 1", "..."]
      }
    ],
    "audience": {
      "primary": "קהל עיקרי",
      "demographics": "דמוגרפיה",
      "needs": ["צורך 1", "צורך 2"]
    },
    "response_patterns": {
      "typical_structure": "מבנה תשובה",
      "opening_styles": ["פתיחה 1", "..."],
      "closing_styles": ["סיום 1", "..."]
    }
  },
  "chatbot_guidelines": {
    "must_include": ["חובה 1", "..."],
    "must_avoid": ["להימנע 1", "..."],
    "tone_instructions": "הנחיות לטון"
  }
}
\`\`\`

**חשוב מאוד:**
1. נתח **כל** התוכן - פוסטים, תמלולים, טקסט על מסך
2. תן דוגמאות **ספציפיות** מהתוכן
3. היה **מדויק** - אל תנחש!
4. הכל **בעברית**!
`;

  return prompt;
}

main().catch(console.error);
