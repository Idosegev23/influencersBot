/**
 * Test persona building with GPT-5.4
 * Compares output quality vs GPT-5.2 Pro
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/test-persona-gpt54.ts <account_id>
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const accountId = process.argv[2] || '6facd754-2aed-410f-8b74-49ecc9304558'; // moroccanoil default

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing GPT-5.4 persona build for account ${accountId}`);
  console.log(`${'='.repeat(60)}\n`);

  // Step 1: Get existing persona's preprocessing data from DB
  console.log('📋 Step 1: Loading preprocessing data from existing persona...');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: persona, error } = await supabase
    .from('chatbot_persona')
    .select('preprocessing_data, gemini_raw_output')
    .eq('account_id', accountId)
    .single();

  if (error || !persona) {
    console.error('Failed to load persona:', error?.message);
    process.exit(1);
  }

  const preprocessingData = persona.preprocessing_data;
  const existingOutput = persona.gemini_raw_output?.parsed;

  console.log(`   Loaded preprocessing data: ${JSON.stringify(preprocessingData).length} chars`);
  console.log(`   Existing persona model: GPT-5.2 Pro / Gemini fallback`);

  // Step 2: Build the same prompt using the actual builder module
  console.log('\n📋 Step 2: Building prompt...');

  // Use dynamic import with tsconfig paths resolved
  const builderPath = '../src/lib/ai/gemini-persona-builder';
  const builder = await import(builderPath);

  // The builder exports buildPersonaWithGemini but not buildFullPrompt directly
  // So we call it indirectly - but we just need the prompt, so we'll reconstruct it
  // The preprocessing_data stored in DB is already the "inputData" format
  const inputData = preprocessingData;

  // Read the PERSONA_BUILDER_PROMPT from the source file
  const fs = await import('fs');
  const builderCode = fs.readFileSync('./src/lib/ai/gemini-persona-builder.ts', 'utf8');

  // Extract between "const PERSONA_BUILDER_PROMPT = `" and the closing backtick+semicolon
  const startMarker = 'const PERSONA_BUILDER_PROMPT = `';
  const startIdx = builderCode.indexOf(startMarker);
  if (startIdx === -1) {
    console.error('Could not find PERSONA_BUILDER_PROMPT');
    process.exit(1);
  }
  const afterStart = startIdx + startMarker.length;
  // Find the closing backtick that ends the template literal (followed by ;)
  const endIdx = builderCode.indexOf('`;\n', afterStart);
  const promptTemplate = builderCode.substring(afterStart, endIdx);

  // Build the same full prompt the builder uses
  const fullPrompt = `${promptTemplate}

נתונים מעובדים:
${JSON.stringify(inputData, null, 2)}

אנא החזר JSON מובנה בפורמט הנדרש בלבד (ללא טקסט נוסף).`;

  console.log(`   Prompt size: ${fullPrompt.length} chars`);

  // Step 3: Run with GPT-5.4 via Responses API (raw fetch)
  console.log('\n🧠 Step 3: Running with GPT-5.4 (gpt-5.4) via raw fetch...');
  const startTime = Date.now();

  try {
    const apiKey = process.env.OPENAI_API_KEY!;
    const fetchRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        input: fullPrompt,
      }),
    });

    if (!fetchRes.ok) {
      const errBody = await fetchRes.text();
      throw new Error(`${fetchRes.status} ${errBody.substring(0, 300)}`);
    }

    const response = await fetchRes.json();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ GPT-5.4 completed in ${elapsed}s`);

    // Extract text from Responses API format
    let text: string | null = null;
    const rawOutput = (response as any).output;

    if (typeof rawOutput === 'string') {
      text = rawOutput;
    } else if (Array.isArray(rawOutput)) {
      const messageObj = rawOutput.find((item: any) => item.type === 'message');
      if (messageObj?.content && Array.isArray(messageObj.content)) {
        const textContent = messageObj.content.find((c: any) => c.type === 'output_text' || c.text);
        text = textContent?.text;
      }
    } else if (rawOutput && typeof rawOutput === 'object') {
      text = rawOutput.text || rawOutput.content;
    }

    if (!text) {
      console.error('Failed to extract text from response');
      console.log('Raw output:', JSON.stringify(rawOutput).substring(0, 500));
      process.exit(1);
    }

    console.log(`📝 Response length: ${text.length} chars`);

    // Parse JSON
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
    }

    const newPersona = JSON.parse(jsonText);

    // Step 4: Compare
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 COMPARISON: GPT-5.2 Pro vs GPT-5.4');
    console.log(`${'='.repeat(60)}`);

    console.log('\n--- IDENTITY ---');
    console.log(`[5.2] who: ${existingOutput?.identity?.who?.substring(0, 150)}`);
    console.log(`[5.4] who: ${newPersona.identity?.who?.substring(0, 150)}`);

    console.log(`\n[5.2] target: ${existingOutput?.identity?.targetAudience?.substring(0, 150)}`);
    console.log(`[5.4] target: ${newPersona.identity?.targetAudience?.substring(0, 150)}`);

    console.log('\n--- VOICE ---');
    console.log(`[5.2] tone: ${existingOutput?.voice?.tone?.substring(0, 150)}`);
    console.log(`[5.4] tone: ${newPersona.voice?.tone?.substring(0, 150)}`);

    console.log('\n--- KNOWLEDGE MAP ---');
    const oldTopics = existingOutput?.knowledgeMap?.mainTopics?.length || 0;
    const newTopics = newPersona.knowledgeMap?.mainTopics?.length || 0;
    console.log(`[5.2] topics: ${oldTopics}`);
    console.log(`[5.4] topics: ${newTopics}`);

    if (newPersona.knowledgeMap?.mainTopics) {
      console.log(`[5.4] topic names: ${newPersona.knowledgeMap.mainTopics.map((t: any) => t.name || t.topic).join(', ')}`);
    }

    console.log('\n--- PRODUCTS ---');
    const oldProducts = existingOutput?.products?.length || 0;
    const newProducts = newPersona.products?.length || 0;
    console.log(`[5.2] products: ${oldProducts}`);
    console.log(`[5.4] products: ${newProducts}`);

    console.log('\n--- BRANDS ---');
    const oldBrands = existingOutput?.brands?.length || 0;
    const newBrands = newPersona.brands?.length || 0;
    console.log(`[5.2] brands: ${oldBrands}`);
    console.log(`[5.4] brands: ${newBrands}`);

    console.log('\n--- COUPONS ---');
    const oldCoupons = existingOutput?.coupons?.length || 0;
    const newCoupons = newPersona.coupons?.length || 0;
    console.log(`[5.2] coupons: ${oldCoupons}`);
    console.log(`[5.4] coupons: ${newCoupons}`);

    console.log('\n--- RESPONSE POLICY ---');
    console.log(`[5.2] ${JSON.stringify(existingOutput?.responsePolicy)?.substring(0, 200)}`);
    console.log(`[5.4] ${JSON.stringify(newPersona.responsePolicy)?.substring(0, 200)}`);

    // Save full output for comparison
    fs.writeFileSync('/tmp/persona-gpt54-output.json', JSON.stringify(newPersona, null, 2), 'utf8');
    fs.writeFileSync('/tmp/persona-gpt52-output.json', JSON.stringify(existingOutput, null, 2), 'utf8');

    console.log(`\n💾 Full outputs saved to:`);
    console.log(`   /tmp/persona-gpt52-output.json`);
    console.log(`   /tmp/persona-gpt54-output.json`);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Test complete — GPT-5.4 took ${elapsed}s`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ GPT-5.4 failed after ${elapsed}s:`, err.message);
    process.exit(1);
  }
}

async function loadHelpers() {
  // Stubs - we use the preprocessing_data directly from DB
  return {
    buildFullPrompt: (data: any) => '',
    prepareInputData: (data: any) => data,
  };
}

main().catch(console.error);
