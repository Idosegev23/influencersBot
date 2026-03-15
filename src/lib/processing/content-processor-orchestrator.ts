/**
 * Content Processing Orchestrator
 * מנהל את כל תהליך העיבוד: תמלול → עיבוד → בניית פרסונה
 */

import { createClient } from '@/lib/supabase/server';
import { transcribeVideo, saveTranscription, getAllTranscriptions } from '@/lib/transcription/gemini-transcriber';
import { buildPersonaWithGemini, savePersonaToDatabase } from '@/lib/ai/gemini-persona-builder';
import { preprocessInstagramData } from '@/lib/scraping/preprocessing';
import { ingestAllForAccount } from '@/lib/rag/ingest';
import { generateAndSaveChatConfig } from './generate-chat-config';
import { syncCommerceData } from './sync-commerce-data';
import { extractCouponsFromContent } from './extract-coupons';

// ============================================
// Type Definitions
// ============================================

export interface ProcessingJobConfig {
  accountId: string;
  scanJobId?: string;

  // Processing options
  transcribeVideos: boolean;
  maxVideosToTranscribe?: number;
  buildRagIndex: boolean;
  buildPersona: boolean;

  // Priority
  priority?: 'low' | 'normal' | 'high';
}

export interface ProcessingJobResult {
  success: boolean;
  
  // Stats
  stats: {
    videosTranscribed: number;
    transcriptionsFailed: number;
    ragDocumentsIngested: number;
    personaBuilt: boolean;
    processingTimeMs: number;
  };
  
  // Outputs
  personaId?: string;
  transcriptionIds: string[];
  
  // Errors
  errors: string[];
}

export interface ContentForProcessing {
  posts: any[];
  highlights: any[];
  comments: any[];
  websites: any[];
  profile: any;
}

// ============================================
// Main Orchestrator
// ============================================

/**
 * Process all content for an account
 */
export async function processAccountContent(
  config: ProcessingJobConfig
): Promise<ProcessingJobResult> {
  console.log('\n' + '='.repeat(70));
  console.log('🎬 [Content Processor] Starting content processing');
  console.log(`📦 Account: ${config.accountId}`);
  console.log('='.repeat(70) + '\n');

  const startTime = Date.now();
  const result: ProcessingJobResult = {
    success: false,
    stats: {
      videosTranscribed: 0,
      transcriptionsFailed: 0,
      ragDocumentsIngested: 0,
      personaBuilt: false,
      processingTimeMs: 0,
    },
    transcriptionIds: [],
    errors: [],
  };

  const supabase = await createClient();

  // ⚡ Helper to log progress (console + DB if scan job exists)
  const logProgress = async (step: string, message: string) => {
    console.log(`[Content Processor] ${message}`);
    
    // If we have a scanJobId, update its logs
    if (config.scanJobId) {
      try {
        const { getScanJobsRepo } = await import('@/lib/db/repositories/scanJobsRepo');
        const repo = getScanJobsRepo();
        await repo.addStepLog(
          config.scanJobId,
          `processing_${step}`,
          'running',
          0, // Processing doesn't have percentage
          message
        );
      } catch (err) {
        // Silently fail - logging shouldn't break processing
      }
    }
  };

  try {
    // ⚠️ No timeout - transcription can take 20+ minutes for 20 videos
    // Each video takes ~30-100 seconds, so total could be 10-30 minutes
    
    const processingPromise = (async () => {
      // ============================================
      // Step 1: Load all scraped content
      // ============================================
      console.log('\n📥 [Step 1/5] Loading scraped content...');
      await logProgress('load_start', '📥 טוען תוכן שנסרק ממסד הנתונים...');
      
      const content = await loadScrapedContent(config.accountId);
    
    console.log(`✅ Loaded:`);
    console.log(`   - ${content.posts?.length || 0} posts`);
    console.log(`   - ${content.highlights?.length || 0} highlight items`);
    console.log(`   - ${content.comments?.length || 0} comments`);
    console.log(`   - ${content.websites?.length || 0} website pages`);
    
    const loadSummary = [
      `✅ נטען מהמסד:`,
      `${content.posts?.length || 0} פוסטים`,
      `${content.highlights?.length || 0} הילייטס`,
      `${content.comments?.length || 0} תגובות`,
    ].join(' • ');
    
    await logProgress('load_complete', loadSummary);

    // ============================================
    // Step 2: Transcribe Videos (if enabled)
    // ⚠️ CRITICAL: Must complete ALL transcriptions before building persona!
    // ============================================
    if (config.transcribeVideos) {
      console.log('\n🎥 [Step 2/5] Transcribing videos...');
      console.log(`⚠️ [CRITICAL] Waiting for ALL transcriptions to complete before proceeding!`);
      console.log(`[DEBUG] Starting video transcription at ${new Date().toISOString()}`);
      
      await logProgress('transcribe_start', '⚠️ ממתין לתמלול של כל הסרטונים (קריטי לבניית פרסונה!)');
      
      // ⚡ This WILL WAIT until all videos are transcribed (no timeout!)
      const transcriptionResult = await transcribeAllVideos(
        config.accountId,
        content,
        config.maxVideosToTranscribe,
        config.scanJobId // ⚡ Pass scan job ID for logging
      );
      
      console.log(`[DEBUG] Finished video transcription at ${new Date().toISOString()}`);
      console.log(`✅ All transcriptions complete - safe to proceed to persona building`);
      
      result.stats.videosTranscribed = transcriptionResult.succeeded;
      result.stats.transcriptionsFailed = transcriptionResult.failed;
      result.transcriptionIds = transcriptionResult.transcriptionIds;
      
      if (transcriptionResult.errors.length > 0) {
        result.errors.push(...transcriptionResult.errors);
      }
      
      console.log(`✅ Transcription complete:`);
      console.log(`   - Succeeded: ${transcriptionResult.succeeded}`);
      console.log(`   - Failed: ${transcriptionResult.failed}`);
      
      const transcribeSummary = [
        `✅ כל התמלולים הושלמו!`,
        `${transcriptionResult.succeeded} הצליחו`,
        transcriptionResult.failed > 0 ? `${transcriptionResult.failed} נכשלו` : '',
        `עובר לניתוח ובניית פרסונה...`,
      ].filter(Boolean).join(' • ');
      
      await logProgress('transcribe_complete', transcribeSummary);
    } else {
      console.log('\n⏭️  [Step 2/5] Skipping video transcription (disabled)');
      await logProgress('transcribe', '⏭️ דילוג על תמלול (מושבת)');
    }

    // ============================================
    // Step 3: Preprocess Data
    // ⚠️ Loads ALL transcriptions from database (completed in step 2)
    // ============================================
    console.log('\n🔄 [Step 3/5] Preprocessing data...');
    console.log(`[DEBUG] Starting preprocessing at ${new Date().toISOString()}`);
    await logProgress('preprocess_start', '🔄 טוען תמלולים ומנתח תוכן...');
    
    const preprocessedData = await preprocessInstagramData(config.accountId);
    
    console.log(`[DEBUG] Finished preprocessing at ${new Date().toISOString()}`);
    console.log(`✅ Preprocessing complete:`);
    console.log(`   - ${preprocessedData.stats.totalPosts} posts analyzed`);
    console.log(`   - ${preprocessedData.topics.length} topics identified`);
    console.log(`   - ${preprocessedData.faqCandidates.length} FAQ candidates`);
    console.log(`   - ${preprocessedData.transcriptions.length} transcriptions loaded from DB`);
    
    // ⚠️ Validate that we have transcriptions if they were requested
    if (config.transcribeVideos && preprocessedData.transcriptions.length === 0) {
      console.warn(`⚠️ WARNING: Transcription was enabled but no transcriptions were loaded!`);
      await logProgress('preprocess_warning', '⚠️ אזהרה: לא נמצאו תמלולים במסד הנתונים!');
    }
    
    const preprocessSummary = [
      `✅ ניתוח הושלם:`,
      `${preprocessedData.topics.length} נושאים`,
      `${preprocessedData.transcriptions.length} תמלולים נטענו`,
      `${preprocessedData.faqCandidates.length} שאלות נפוצות`,
    ].join(' • ');
    
    await logProgress('preprocess_complete', preprocessSummary);

    // ============================================
    // Step 3.5: Extract Coupons from Transcriptions
    // ============================================
    console.log('\n🎟️ [Step 3.5] Extracting coupons from transcriptions...');
    await logProgress('coupon_extract_start', '🎟️ מחלץ קופונים מתמלולים...');

    try {
      const couponResult = await extractCouponsFromContent(config.accountId);
      console.log(`✅ Coupon extraction: ${couponResult.couponsCreated} new, ${couponResult.partnershipsCreated} partnerships`);
      await logProgress('coupon_extract_complete', `✅ חולצו ${couponResult.couponsCreated} קופונים ו-${couponResult.partnershipsCreated} שת"פים`);
    } catch (error: any) {
      console.error('❌ Coupon extraction failed (non-blocking):', error.message);
      result.errors.push(`Coupon extraction failed: ${error.message}`);
      await logProgress('coupon_extract_error', `❌ שגיאה בחילוץ קופונים: ${error.message}`);
    }

    // ============================================
    // Step 4: Build RAG Index (Vector Embeddings)
    // ============================================
    if (config.buildRagIndex !== false) {
      console.log('\n🔍 [Step 4/5] Building RAG vector index...');
      await logProgress('rag_start', '🔍 בונה אינדקס חיפוש וקטורי (RAG)...');

      try {
        const ragResult = await ingestAllForAccount(config.accountId);

        result.stats.ragDocumentsIngested = ragResult.total;

        const ragSummary = [
          `✅ אינדקס RAG נבנה!`,
          `${ragResult.total} מסמכים`,
          ...Object.entries(ragResult.byType).map(([type, count]) => `${type}: ${count}`),
          ragResult.errors.length > 0 ? `${ragResult.errors.length} שגיאות` : '',
        ].filter(Boolean).join(' • ');

        console.log(`✅ RAG indexing complete: ${ragResult.total} documents`);
        console.log(`   By type:`, ragResult.byType);
        if (ragResult.errors.length > 0) {
          console.warn(`   ⚠️ RAG errors:`, ragResult.errors);
        }

        await logProgress('rag_complete', ragSummary);
      } catch (error: any) {
        console.error('❌ RAG indexing failed (non-blocking):', error.message);
        result.errors.push(`RAG indexing failed: ${error.message}`);
        await logProgress('rag_error', `❌ שגיאה בבניית אינדקס RAG: ${error.message}`);
      }
    } else {
      console.log('\n⏭️  [Step 4/5] Skipping RAG indexing (disabled)');
      await logProgress('rag', '⏭️ דילוג על בניית אינדקס RAG (מושבת)');
    }

    // ============================================
    // Step 5: Build Persona with Gemini
    // ⚠️ ONLY runs after ALL transcriptions are complete!
    // ============================================
    if (config.buildPersona) {
      console.log('\n🤖 [Step 5/5] Building persona with Gemini 3 Flash...');
      console.log(`✅ All data ready (${preprocessedData.transcriptions.length} transcriptions loaded)`);
      console.log(`[DEBUG] Starting Gemini persona build at ${new Date().toISOString()}`);
      
      await logProgress('persona_start', `🤖 בונה פרסונה עם ${preprocessedData.transcriptions.length} תמלולים!`);
      
      try {
        // Step 4.1: Preparing data
        await logProgress('persona_prepare', `📊 מכין ${preprocessedData.transcriptions.length} תמלולים + ${preprocessedData.topics.length} נושאים לGemini...`);
        
        // Step 4.2: Calling Gemini (this takes 1-2 minutes)
        await logProgress('persona_gemini', '🧠 שולח ל-Gemini 3 Flash לניתוח (מהיר!)...');
        
        const persona = await buildPersonaWithGemini(
          preprocessedData,
          content.profile
        );
        
        console.log(`[DEBUG] Finished Gemini persona build at ${new Date().toISOString()}`);
        
        // Step 4.3: Saving to database
        await logProgress('persona_save', '💾 שומר פרסונה למסד נתונים...');
        
        await savePersonaToDatabase(
          supabase,
          config.accountId,
          persona,
          preprocessedData,
          JSON.stringify(persona, null, 2)
        );
        
        result.stats.personaBuilt = true;
        
        console.log(`✅ Persona built successfully:`);
        console.log(`   - Identity: ${persona.identity.who}`);
        console.log(`   - Voice: ${persona.voice.tone}`);
        console.log(`   - Topics: ${persona.knowledgeMap.coreTopics.length}`);
        console.log(`   - Products: ${persona.products?.length || 0}`);
        console.log(`   - Coupons: ${persona.coupons?.length || 0}`);
        console.log(`   - Brands/Partnerships: ${persona.brands?.length || 0}`);
        
        // Final success message with all details
        const detailsMsg = [
          `✅ פרסונה נבנתה בהצלחה!`,
          `📚 ${persona.knowledgeMap.coreTopics.length} נושאים`,
          `🛍️ ${persona.products?.length || 0} מוצרים`,
          `🎟️ ${persona.coupons?.length || 0} קופונים`,
          `🤝 ${persona.brands?.length || 0} שת"פים`,
        ].join(' • ');
        
        await logProgress('persona_complete', detailsMsg);
        
      } catch (error: any) {
        console.error('❌ Failed to build persona:', error.message);
        result.errors.push(`Persona building failed: ${error.message}`);
        await logProgress('persona_error', `❌ שגיאה בבניית פרסונה: ${error.message}`);
      }
    } else {
      console.log('\n⏭️  [Step 5/5] Skipping persona building (disabled)');
      await logProgress('persona', '⏭️ דילוג על בניית פרסונה (מושבת)');
    }

      // ============================================
      // Step 6: Auto-generate Chat Config from Persona
      // ============================================
      if (config.buildPersona && result.stats.personaBuilt) {
        console.log('\n🎨 [Step 6] Generating chat page config from persona...');
        await logProgress('chat_config_start', '🎨 מייצר הגדרות צ׳אט מהפרסונה...');

        try {
          const chatConfig = await generateAndSaveChatConfig(config.accountId);
          console.log(`✅ Chat config generated: type=${chatConfig.influencerType}, ${chatConfig.questions.length} questions`);
          await logProgress('chat_config_complete', `✅ עמוד צ׳אט הותאם: ${chatConfig.influencerType} • ${chatConfig.questions.length} שאלות מוצעות`);
        } catch (error: any) {
          console.error('❌ Chat config generation failed (non-blocking):', error.message);
          result.errors.push(`Chat config failed: ${error.message}`);
          await logProgress('chat_config_error', `❌ שגיאה בהתאמת צ׳אט: ${error.message}`);
        }
      }

      // ============================================
      // Step 7: Sync Commerce Data (brands → partnerships, coupons → coupons)
      // ============================================
      if (config.buildPersona && result.stats.personaBuilt) {
        console.log('\n🛍️ [Step 7] Syncing extracted commerce data to DB tables...');
        await logProgress('commerce_sync_start', '🛍️ מסנכרן מותגים וקופונים...');

        try {
          const commerce = await syncCommerceData(config.accountId);
          console.log(`✅ Commerce sync: ${commerce.partnershipsCreated} partnerships, ${commerce.couponsCreated} coupons`);
          await logProgress('commerce_sync_complete', `✅ סונכרנו ${commerce.partnershipsCreated} מותגים ו-${commerce.couponsCreated} קופונים`);
        } catch (error: any) {
          console.error('❌ Commerce sync failed (non-blocking):', error.message);
          result.errors.push(`Commerce sync failed: ${error.message}`);
          await logProgress('commerce_sync_error', `❌ שגיאה בסנכרון מותגים: ${error.message}`);
        }
      }

      // ============================================
      // Mark as complete
      // ============================================
      result.success = result.errors.length === 0;
      result.stats.processingTimeMs = Date.now() - startTime;

      const elapsed = (result.stats.processingTimeMs / 1000).toFixed(2);
      
      console.log('\n' + '='.repeat(70));
      console.log(`${result.success ? '✅' : '⚠️'} [Content Processor] Processing ${result.success ? 'complete' : 'finished with errors'}`);
      console.log(`⏱️  Time: ${elapsed}s`);
      console.log('='.repeat(70) + '\n');

      return result;
    })();

    // Wait for processing to complete (no timeout)
    return await processingPromise;

  } catch (error: any) {
    console.error('\n❌ [Content Processor] Fatal error:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    result.stats.processingTimeMs = Date.now() - startTime;
    return result;
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Load all scraped content for an account
 */
async function loadScrapedContent(accountId: string): Promise<ContentForProcessing> {
  const supabase = await createClient();

  // Load posts
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('*')
    .eq('account_id', accountId)
    .order('posted_at', { ascending: false });

  // Load highlights (with items)
  const { data: highlights } = await supabase
    .from('instagram_highlight_items')
    .select('*')
    .eq('account_id', accountId)
    .order('posted_at', { ascending: false });

  // Load comments
  const { data: comments } = await supabase
    .from('instagram_comments')
    .select('*')
    .eq('account_id', accountId)
    .order('commented_at', { ascending: false });

  // Load websites
  const { data: websites } = await supabase
    .from('instagram_bio_websites')
    .select('*')
    .eq('account_id', accountId);

  // Load profile
  const { data: profile } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  return {
    posts: posts || [],
    highlights: highlights || [],
    comments: comments || [],
    websites: websites || [],
    profile,
  };
}

/**
 * Transcribe all videos for an account
 */
async function transcribeAllVideos(
  accountId: string,
  content: ContentForProcessing,
  maxVideos: number = 20,
  scanJobId?: string
): Promise<{
  succeeded: number;
  failed: number;
  transcriptionIds: string[];
  errors: string[];
}> {
  const result = {
    succeeded: 0,
    failed: 0,
    transcriptionIds: [] as string[],
    errors: [] as string[],
  };
  
  // ⚡ Helper to log transcription progress
  const logTranscriptionProgress = async (current: number, total: number, status: string) => {
    if (scanJobId) {
      try {
        const { getScanJobsRepo } = await import('@/lib/db/repositories/scanJobsRepo');
        const repo = getScanJobsRepo();
        await repo.addStepLog(
          scanJobId,
          'transcription',
          'running',
          Math.round((current / total) * 100),
          `${status} (${current}/${total})`
        );
      } catch (err) {
        // Silently fail
      }
    }
  };

  // Collect all video URLs
  const videosToTranscribe: Array<{
    sourceType: 'post' | 'highlight_item';
    sourceId: string;
    videoUrl: string;
    duration?: number;
  }> = [];

  // From posts (reels/videos)
  if (content.posts && Array.isArray(content.posts)) {
    for (const post of content.posts) {
      if (post.type === 'reel' || post.type === 'video') {
        const videoUrl = Array.isArray(post.media_urls)
          ? post.media_urls[0]?.url || post.media_urls[0]
          : post.media_urls;

        if (videoUrl && typeof videoUrl === 'string') {
          videosToTranscribe.push({
            sourceType: 'post',
            sourceId: post.id,
            videoUrl,
            duration: post.video_duration,
          });
        }
      }
    }
  }

  // From highlights (video stories)
  if (content.highlights && Array.isArray(content.highlights)) {
    for (const item of content.highlights) {
      if (item.media_type === 'video' && item.media_url) {
        videosToTranscribe.push({
          sourceType: 'highlight_item',
          sourceId: item.id,
          videoUrl: item.media_url,
          duration: item.video_duration,
        });
      }
    }
  }

  console.log(`   Found ${videosToTranscribe.length} videos`);

  // Limit to max (999 = all videos)
  const toProcess = videosToTranscribe.slice(0, maxVideos || 999);
  console.log(`   Will transcribe ${toProcess.length} videos`);
  
  // ⚡ Transcribe in PARALLEL batches (5 at a time)
  const BATCH_SIZE = 5;
  const batches: typeof toProcess[] = [];
  
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    batches.push(toProcess.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`   Processing in ${batches.length} batches of ${BATCH_SIZE}`);
  
  let processedCount = 0;
  
  // Process each batch
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const batchNum = batchIdx + 1;
    
    console.log(`\n   📦 Batch ${batchNum}/${batches.length}: Processing ${batch.length} videos in parallel...`);
    
    // ⚡ Process all videos in batch SIMULTANEOUSLY
    const batchPromises = batch.map(async (video, videoIdx) => {
      const globalIdx = batchIdx * BATCH_SIZE + videoIdx;
      const progressNum = globalIdx + 1;
      
      try {
        // Check if already transcribed
        const supabase = await createClient();
        const { data: existing } = await supabase
          .from('instagram_transcriptions')
          .select('id')
          .eq('source_type', video.sourceType)
          .eq('source_id', video.sourceId)
          .eq('processing_status', 'completed')
          .maybeSingle();

        if (existing) {
          console.log(`   [${progressNum}/${toProcess.length}] ⏭️  Already transcribed (${video.sourceType}:${video.sourceId})`);
          
          // ⚡ Update UI - skipped
          await logTranscriptionProgress(
            progressNum,
            toProcess.length,
            `⏭️ סרטון ${progressNum}: כבר תומלל (קיים במערכת)`
          );
          
          return { success: true, transcriptionId: existing.id, skipped: true };
        }

        console.log(`   [${progressNum}/${toProcess.length}] 🎬 Starting ${video.sourceType}:${video.sourceId}...`);
        
        // ⚡ Update UI - starting
        await logTranscriptionProgress(
          progressNum,
          toProcess.length,
          `🎬 סרטון ${progressNum}/${toProcess.length}: מתחיל תמלול...`
        );

        // ⚡ Transcribe directly (no HTTP call needed in background process)
        const transcriptionResult = await transcribeVideo({
          source_type: video.sourceType,
          source_id: video.sourceId,
          video_url: video.videoUrl,
          video_duration: video.duration,
        });

        // Save transcription to database
        if (transcriptionResult.success && transcriptionResult.transcription) {
          const savedId = await saveTranscription(
            accountId,
            {
              source_type: video.sourceType,
              source_id: video.sourceId,
              video_url: video.videoUrl,
              video_duration: video.duration,
            },
            transcriptionResult
          );

          console.log(`   [${progressNum}/${toProcess.length}] ✅ Success (${savedId})`);
          
          // ⚡ Update UI - success
          await logTranscriptionProgress(
            progressNum,
            toProcess.length,
            `✅ סרטון ${progressNum}/${toProcess.length}: תומלל בהצלחה!`
          );
          
          return { success: true, transcriptionId: savedId, skipped: false };
        } else {
          console.log(`   [${progressNum}/${toProcess.length}] ❌ Failed: ${transcriptionResult.error}`);
          
          // ⚡ Update UI - failed
          await logTranscriptionProgress(
            progressNum,
            toProcess.length,
            `❌ סרטון ${progressNum}/${toProcess.length}: נכשל - ${transcriptionResult.error}`
          );
          
          return { success: false, error: transcriptionResult.error, sourceId: video.sourceId };
        }

      } catch (error: any) {
        console.error(`   [${progressNum}/${toProcess.length}] ❌ Error: ${error.message}`);
        
        // ⚡ Update UI - error
        await logTranscriptionProgress(
          progressNum,
          toProcess.length,
          `❌ סרטון ${progressNum}/${toProcess.length}: שגיאה - ${error.message}`
        );
        
        return { success: false, error: error.message, sourceId: video.sourceId };
      }
    });
    
    // Wait for entire batch to complete
    const batchResults = await Promise.all(batchPromises);
    
    // Update results
    for (const batchResult of batchResults) {
      if (batchResult.success) {
        result.succeeded++;
        result.transcriptionIds.push(batchResult.transcriptionId);
      } else {
        result.failed++;
        result.errors.push(`Video ${batchResult.sourceId}: ${batchResult.error}`);
      }
    }
    
    processedCount += batch.length;
    
    // Update progress log
    await logTranscriptionProgress(
      processedCount,
      toProcess.length,
      `✅ תומללו ${result.succeeded}/${toProcess.length} סרטונים (${result.failed} נכשלו)`
    );
    
    console.log(`   ✓ Batch ${batchNum}/${batches.length} complete: ${result.succeeded} succeeded, ${result.failed} failed`);
  }
  
  console.log(`\n   🎉 All transcriptions complete!`);
  console.log(`      Total: ${toProcess.length}`);
  console.log(`      Succeeded: ${result.succeeded}`);
  console.log(`      Failed: ${result.failed}`);

  return result;
}

// ============================================
// Quick Start Functions
// ============================================

/**
 * Process content with default config
 */
export async function processAccountContentDefault(accountId: string): Promise<ProcessingJobResult> {
  return processAccountContent({
    accountId,
    transcribeVideos: true,
    maxVideosToTranscribe: 20,
    buildRagIndex: true,
    buildPersona: true,
    priority: 'normal',
  });
}

/**
 * Process only transcription (no persona)
 */
export async function transcribeAccountVideos(
  accountId: string,
  maxVideos: number = 20
): Promise<ProcessingJobResult> {
  return processAccountContent({
    accountId,
    transcribeVideos: true,
    maxVideosToTranscribe: maxVideos,
    buildRagIndex: false,
    buildPersona: false,
  });
}

/**
 * Build persona only (skip transcription)
 */
export async function buildAccountPersona(accountId: string): Promise<ProcessingJobResult> {
  return processAccountContent({
    accountId,
    transcribeVideos: false,
    buildRagIndex: true,
    buildPersona: true,
  });
}
