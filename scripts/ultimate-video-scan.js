/**
 * 🔥 ULTIMATE VIDEO SCAN - סריקה מלאה עם תמלול וניתוח חזותי
 * 
 * הסקריפט הכי מתקדם:
 * 1. שולף **כל** הפוסטים (100+) 
 * 2. מזהה סרטונים (reels, videos)
 * 3. מתמלל אודיו עם gpt-4o-transcribe
 * 4. מפרק לפריימים ומנתח עם GPT-4o Vision
 * 5. ניתוח מעמיק עם GPT-5.2 Pro
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();

const execAsync = promisify(exec);
const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';
const TEMP_DIR = '/tmp/video-scan';

async function main() {
  console.log('🔥'.repeat(50));
  console.log('🎬 ULTIMATE VIDEO SCAN - הסריקה המושלמת!');
  console.log('   תמלול + ניתוח חזותי + GPT-5.2 Pro');
  console.log('🔥'.repeat(50));
  console.log('');

  const startTime = Date.now();

  // Create temp directory
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (e) {
    // Directory exists
  }

  // Clients
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  );

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // ===== 1. שליפת כל הפוסטים =====
  console.log('📊 שלב 1/6: שליפת **כל** הפוסטים...\n');

  const { data: allPosts, error: postsError } = await supabase
    .from('instagram_posts')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('posted_at', { ascending: false });

  if (postsError) {
    console.error('❌ שגיאה:', postsError);
    process.exit(1);
  }

  console.log(`✅ נשלפו ${allPosts.length} פוסטים\n`);

  // Filter posts with captions
  const postsWithContent = allPosts.filter(p => p.caption && p.caption.trim().length > 10);
  
  // Identify video posts (reels, videos)
  const videoPosts = allPosts.filter(p => 
    (p.type === 'reel' || p.type === 'video') && p.media_url
  );

  console.log(`📹 מזהה ${videoPosts.length} סרטונים לעיבוד`);
  console.log('');

  // ===== 2. בדיקת תמלולים קיימים =====
  console.log('🔍 שלב 2/6: בדיקת תמלולים קיימים...\n');

  const { data: existingTranscriptions } = await supabase
    .from('instagram_transcriptions')
    .select('source_post_id, transcription_text')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  const transcribedPostIds = new Set(
    existingTranscriptions?.map(t => t.source_post_id) || []
  );

  // Videos that need transcription
  const videosNeedingTranscription = videoPosts.filter(
    p => !transcribedPostIds.has(p.id)
  );

  console.log(`✅ תמלולים קיימים: ${existingTranscriptions?.length || 0}`);
  console.log(`📝 סרטונים שצריכים תמלול: ${videosNeedingTranscription.length}`);
  console.log('');

  // ===== 3. תמלול סרטונים =====
  if (videosNeedingTranscription.length > 0) {
    console.log('🎙️ שלב 3/6: תמלול סרטונים עם gpt-4o-transcribe...\n');
    console.log(`⚠️  זה עשוי לקחת זמן - מעבד ${videosNeedingTranscription.length} סרטונים\n`);

    let transcribedCount = 0;

    for (const post of videosNeedingTranscription.slice(0, 50)) { // Max 50 for safety
      try {
        console.log(`📹 מעבד: ${post.id.substring(0, 8)}... (${transcribedCount + 1}/${Math.min(50, videosNeedingTranscription.length)})`);

        // Download video
        const videoPath = path.join(TEMP_DIR, `${post.id}.mp4`);
        await downloadVideo(post.media_url, videoPath);

        // Transcribe with gpt-4o-transcribe
        const audioFile = await fs.readFile(videoPath);
        
        const transcription = await openai.audio.transcriptions.create({
          file: await fs.open(videoPath, 'r'),
          model: 'gpt-4o-transcribe',
          language: 'he', // Hebrew
          prompt: 'זהו תמלול של סרטון אינסטגרם של מירן בוזגלו, משפיענית ישראלית בתחומי הביוטי, אופנה ואורח חיים. התמלול כולל דיבור על מוצרי קוסמטיקה, טיפוח, מתכונים, חיי משפחה ועוד.',
        });

        // Save to database
        await supabase
          .from('instagram_transcriptions')
          .insert({
            account_id: MIRAN_ACCOUNT_ID,
            source_post_id: post.id,
            source_type: 'video',
            transcription_text: transcription.text,
            transcription_language: 'he',
            metadata: {
              model: 'gpt-4o-transcribe',
              post_type: post.type,
            }
          });

        transcribedCount++;
        console.log(`   ✅ תמלול הושלם (${transcription.text.substring(0, 50)}...)\n`);

        // Clean up
        await fs.unlink(videoPath).catch(() => {});

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`   ❌ שגיאה בתמלול: ${error.message}\n`);
      }
    }

    console.log(`✅ תמללו ${transcribedCount} סרטונים\n`);
  } else {
    console.log('✅ שלב 3/6: כל הסרטונים כבר מתומללים!\n');
  }

  // ===== 4. ניתוח חזותי של סרטונים =====
  console.log('👁️ שלב 4/6: ניתוח חזותי של סרטונים (Vision)...\n');
  console.log('   מפרק פריימים ומנתח עם GPT-4o Vision\n');

  const videoVisualAnalysis = [];
  
  // Analyze top 10 most engaging videos
  const topVideos = videoPosts
    .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
    .slice(0, 10);

  for (const video of topVideos) {
    try {
      console.log(`🎬 מנתח חזותית: ${video.id.substring(0, 8)}...`);

      const videoPath = path.join(TEMP_DIR, `${video.id}.mp4`);
      
      // Download if not exists
      try {
        await fs.access(videoPath);
      } catch {
        await downloadVideo(video.media_url, videoPath);
      }

      // Extract 5 frames
      const frames = await extractFrames(videoPath, 5);

      // Analyze with GPT-4o Vision
      const visionAnalysis = await analyzeVideoFrames(openai, frames, video.caption);

      videoVisualAnalysis.push({
        post_id: video.id,
        analysis: visionAnalysis,
        frames_count: frames.length,
      });

      console.log(`   ✅ ניתוח הושלם\n`);

      // Clean up frames
      for (const frame of frames) {
        await fs.unlink(frame).catch(() => {});
      }
      await fs.unlink(videoPath).catch(() => {});

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`   ❌ שגיאה בניתוח חזותי: ${error.message}\n`);
    }
  }

  console.log(`✅ נותחו ${videoVisualAnalysis.length} סרטונים חזותית\n`);

  // ===== 5. שליפת כל הנתונים המעודכנים =====
  console.log('📊 שלב 5/6: שליפת כל הנתונים המעודכנים...\n');

  const { data: allTranscriptions } = await supabase
    .from('instagram_transcriptions')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  const { data: allHighlights } = await supabase
    .from('instagram_highlights')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  const { data: allPartnerships } = await supabase
    .from('partnerships')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  const { data: allCoupons } = await supabase
    .from('coupons')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  console.log('═'.repeat(80));
  console.log('📊 סיכום נתונים לניתוח:');
  console.log(`   📸 פוסטים: ${postsWithContent.length}`);
  console.log(`   🎬 תמלולים: ${allTranscriptions?.length || 0}`);
  console.log(`   👁️ ניתוחים חזותיים: ${videoVisualAnalysis.length}`);
  console.log(`   ⭐ הילייטס: ${allHighlights?.length || 0}`);
  console.log(`   🤝 שותפויות: ${allPartnerships?.length || 0}`);
  console.log(`   🎟️ קופונים: ${allCoupons?.length || 0}`);
  console.log('═'.repeat(80));
  console.log('');

  // ===== 6. ניתוח מעמיק עם GPT-5.2 Pro =====
  console.log('🤖 שלב 6/6: ניתוח מעמיק עם GPT-5.2 Pro...\n');
  console.log('   ⚠️  זה עשוי לקחת מספר דקות\n');

  const fullDataset = buildFullDataset(
    postsWithContent,
    allTranscriptions || [],
    videoVisualAnalysis,
    allHighlights || [],
    allPartnerships || [],
    allCoupons || []
  );

  const analysisPrompt = buildUltimateAnalysisPrompt(fullDataset);

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
  console.log(`✅ ניתוח הושלם תוך ${analysisDuration} שניות\n`);

  // Parse and save
  const analysisText = response.output_text;
  const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/);
  const analysis = JSON.parse(jsonMatch ? jsonMatch[1] : analysisText);

  // Save to database
  await supabase
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
        scan_type: 'ultimate_video_scan',
        scan_date: new Date().toISOString(),
        content_analyzed: {
          posts: postsWithContent.length,
          transcriptions: allTranscriptions?.length || 0,
          video_visual_analysis: videoVisualAnalysis.length,
          highlights: allHighlights?.length || 0,
          partnerships: allPartnerships?.length || 0,
          coupons: allCoupons?.length || 0,
        },
        models_used: {
          transcription: 'gpt-4o-transcribe',
          vision: 'gpt-4o',
          analysis: 'gpt-5.2-pro',
        }
      }
    })
    .eq('account_id', MIRAN_ACCOUNT_ID);

  // Final summary
  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('');
  console.log('🎉'.repeat(50));
  console.log('🎉 ULTIMATE VIDEO SCAN הושלם בהצלחה!');
  console.log('🎉'.repeat(50));
  console.log('');
  console.log('📊 סטטיסטיקות סופיות:');
  console.log(`   • פוסטים נותחו: ${postsWithContent.length}`);
  console.log(`   • תמלולים: ${allTranscriptions?.length || 0}`);
  console.log(`   • ניתוחים חזותיים: ${videoVisualAnalysis.length}`);
  console.log(`   • זמן כולל: ${totalDuration} דקות`);
  console.log(`   • מודלים: gpt-4o-transcribe + GPT-4o Vision + GPT-5.2 Pro`);
  console.log('');
}

/**
 * Download video from URL
 */
async function downloadVideo(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(filepath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      require('fs').unlink(filepath, () => {});
      reject(err);
    });
  });
}

/**
 * Extract frames from video using ffmpeg
 */
async function extractFrames(videoPath, count = 5) {
  const outputPattern = path.join(TEMP_DIR, `frame_${Date.now()}_%d.jpg`);
  
  // Extract frames evenly distributed
  await execAsync(
    `ffmpeg -i "${videoPath}" -vf "select='not(mod(n\\,$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "${videoPath}" | awk "{print int(\\$1/${count})}"))',scale=720:-1" -vsync vfr -frames:v ${count} "${outputPattern}"`
  );

  // Find generated frames
  const frames = [];
  for (let i = 1; i <= count; i++) {
    const framePath = outputPattern.replace('%d', i.toString());
    try {
      await fs.access(framePath);
      frames.push(framePath);
    } catch {}
  }

  return frames;
}

/**
 * Analyze video frames with GPT-4o Vision
 */
async function analyzeVideoFrames(openai, frames, caption) {
  const imageMessages = await Promise.all(
    frames.map(async (framePath) => {
      const imageData = await fs.readFile(framePath, { encoding: 'base64' });
      return {
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imageData}`,
        }
      };
    })
  );

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `נתח את הסרטון הזה של מירן בוזגלו על סמך ${frames.length} פריימים.

כיתוב הפוסט: "${caption}"

נתח:
1. מה מופיע בסרטון חזותית?
2. מה הסטיילינג (בגדים, איפור, שיער)?
3. מה האווירה והרגש?
4. מה המוצרים שמופיעים?
5. מה האלמנטים החזותיים המרכזיים?

החזר JSON:
{
  "visual_content": "תיאור מפורט של מה שנראה",
  "styling": { "clothing": "", "makeup": "", "hair": "" },
  "mood": "אווירה ורגש",
  "products_visible": ["מוצר 1", "..."],
  "key_visual_elements": ["אלמנט 1", "..."]
}`
          },
          ...imageMessages
        ]
      }
    ],
    max_tokens: 1000,
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch {
    return { analysis: response.choices[0].message.content };
  }
}

/**
 * Build full dataset
 */
function buildFullDataset(posts, transcriptions, visualAnalysis, highlights, partnerships, coupons) {
  return {
    posts: posts.map(p => ({
      id: p.id,
      type: p.type,
      caption: p.caption,
      engagement: p.engagement_rate,
      posted_at: p.posted_at,
    })),
    transcriptions: transcriptions.map(t => ({
      text: t.transcription_text,
      source: t.source_type,
    })),
    visual_analysis: visualAnalysis,
    highlights: highlights.map(h => ({ title: h.title })),
    partnerships: partnerships.map(p => ({ brand: p.brand_name, category: p.category })),
    coupons: coupons.map(c => ({ code: c.code, discount: c.discount_value })),
  };
}

/**
 * Build ultimate analysis prompt
 */
function buildUltimateAnalysisPrompt(dataset) {
  return `אתה מנתח תוכן מומחה. בנה Persona מושלמת של מירן בוזגלו.

# Dataset מלא:
- 📸 ${dataset.posts.length} פוסטים
- 🎬 ${dataset.transcriptions.length} תמלולים
- 👁️ ${dataset.visual_analysis.length} ניתוחים חזותיים
- ⭐ ${dataset.highlights.length} הילייטס
- 🤝 ${dataset.partnerships.length} שותפויות
- 🎟️ ${dataset.coupons.length} קופונים

${JSON.stringify(dataset, null, 2)}

בנה Persona **מפורטת ומדויקת ביותר** בעברית. החזר JSON מובנה.`;
}

main().catch(console.error);
