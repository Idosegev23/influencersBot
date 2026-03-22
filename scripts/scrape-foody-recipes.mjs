#!/usr/bin/env node
/**
 * Scrape full recipes from danielamit.foody.co.il using Playwright.
 * Extracts ingredients, instructions, images, nutritional data — things
 * the static cheerio scraper missed.
 *
 * Usage:
 *   node --env-file=.env scripts/scrape-foody-recipes.mjs [options]
 *
 * Options:
 *   --max <n>         Max recipes to scrape (default: all)
 *   --concurrency <n> Parallel browser pages (default: 3)
 *   --dry-run         Print extracted data without saving to DB
 *   --skip-rag        Save to DB but skip RAG re-ingestion
 *   --account-id <id> Override account ID
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ─── CLI ───
const args = process.argv.slice(2);
function getArg(name, def) { const i = args.indexOf(name); return i === -1 ? def : args[i + 1]; }
function hasFlag(name) { return args.includes(name); }

const MAX_RECIPES = parseInt(getArg('--max', '9999'));
const CONCURRENCY = parseInt(getArg('--concurrency', '3'));
const DRY_RUN = hasFlag('--dry-run');
const SKIP_RAG = hasFlag('--skip-rag');
const ACCOUNT_ID = getArg('--account-id', '038fd490-906d-431f-b428-ff9203ce4968'); // danielamit
const SITE_URL = 'https://danielamit.foody.co.il';
const SITEMAP_URL = `${SITE_URL}/wp-sitemap-posts-foody_recipe-1.xml`;

// ─── Supabase ───
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ─── Step 1: Get all recipe URLs from sitemap ───
async function getRecipeUrls() {
  console.log('📥 Fetching sitemap...');
  const res = await fetch(SITEMAP_URL);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>(.+?)<\/loc>/g)].map(m => m[1]);
  console.log(`   Found ${urls.length} recipe URLs`);
  return urls.slice(0, MAX_RECIPES);
}

// Parse ISO 8601 duration (PT1H25M) to Hebrew string
function parseDuration(iso) {
  if (!iso) return null;
  const h = iso.match(/(\d+)H/)?.[1];
  const m = iso.match(/(\d+)M/)?.[1];
  const parts = [];
  if (h) parts.push(`${h} שעות`);
  if (m) parts.push(`${m} דק׳`);
  return parts.join(' ו-') || null;
}

// ─── Step 2: Extract recipe data from a single page ───
async function scrapeRecipe(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('h1', { timeout: 10000 }).catch(() => {});

    const recipe = await page.evaluate(() => {
      // ── Primary source: JSON-LD structured data ──
      let jsonLd = null;
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const d = JSON.parse(s.textContent);
          if (d['@type'] === 'Recipe' || d.recipeIngredient) { jsonLd = d; break; }
        } catch (e) {}
      }

      // Title
      const title = jsonLd?.name || document.querySelector('h1')?.textContent?.trim() || '';

      // Description
      const description = jsonLd?.description || '';

      // Image — JSON-LD may have string or object with url
      let imageUrl = null;
      if (jsonLd?.image) {
        imageUrl = typeof jsonLd.image === 'string' ? jsonLd.image : jsonLd.image.url || jsonLd.image[0];
      }
      if (!imageUrl) {
        const imgEl = document.querySelector('.wp-post-image, .entry-content img');
        imageUrl = imgEl?.src || null;
      }

      // Ingredients — from JSON-LD array
      const ingredients = Array.isArray(jsonLd?.recipeIngredient)
        ? jsonLd.recipeIngredient.map(i => i.trim()).filter(Boolean)
        : [];

      // Instructions — from body text ("אופן הכנה" section)
      // JSON-LD recipeInstructions on Foody is often just a short string, so prefer body text
      const steps = [];
      const bodyText = document.body.textContent || '';
      const instrMatch = bodyText.match(/אופן הכנה\s*([\s\S]*?)(?:תגובות|מתכונים נוספים|קטגוריות|\[caption)/);
      if (instrMatch) {
        // Split by sentence-ending patterns (period followed by capital/Hebrew or newline)
        const raw = instrMatch[1].trim();
        // Split on period+space where next char is Hebrew or on explicit newlines
        const sentences = raw.split(/\.\s*(?=[א-ת\n])/);
        for (const s of sentences) {
          const clean = s.trim().replace(/\s+/g, ' ');
          if (clean.length > 10) steps.push(clean + (clean.endsWith('.') ? '' : '.'));
        }
      }

      // Meta
      const meta = {};
      meta.totalTimeISO = jsonLd?.totalTime || null;
      meta.prepTimeISO = jsonLd?.prepTime || null;
      meta.servings = jsonLd?.recipeYield ? `${jsonLd.recipeYield} מנות` : null;
      meta.calories = jsonLd?.nutrition?.calories ? `${Math.round(jsonLd.nutrition.calories)} קק"ל` : null;
      meta.category = jsonLd?.recipeCategory || null;

      // Prep/total time from page text as fallback
      const prepMatch = bodyText.match(/הכנה\s*(\d+)\s*דק/);
      const totalMatch = bodyText.match(/כולל\s*(.*?דק)/);
      if (prepMatch) meta.prepTimeText = prepMatch[1] + ' דק׳';
      if (totalMatch) meta.totalTimeText = totalMatch[1];

      // Difficulty
      const diffMatch = bodyText.match(/רמת קושי[:\s]*(בסיסי|קל|בינוני|מתקדם)/);
      if (diffMatch) meta.difficulty = diffMatch[1];

      // Categories from page
      const catEls = document.querySelectorAll('.cat-links a, [rel="tag"]');
      const categories = [...new Set(Array.from(catEls).map(a => a.textContent?.trim()).filter(Boolean))];
      if (jsonLd?.recipeCategory && !categories.includes(jsonLd.recipeCategory)) {
        categories.unshift(jsonLd.recipeCategory);
      }

      return { title, description, imageUrl, ingredients, steps, meta, categories };
    });

    // Parse ISO durations outside browser context
    if (recipe.meta.totalTimeISO) {
      recipe.meta.totalTime = parseDuration(recipe.meta.totalTimeISO);
    }
    if (recipe.meta.prepTimeISO) {
      recipe.meta.prepTime = parseDuration(recipe.meta.prepTimeISO);
    }
    // Fallback to text versions
    if (!recipe.meta.prepTime && recipe.meta.prepTimeText) recipe.meta.prepTime = recipe.meta.prepTimeText;
    if (!recipe.meta.totalTime && recipe.meta.totalTimeText) recipe.meta.totalTime = recipe.meta.totalTimeText;

    return { url, ...recipe, success: true };
  } catch (err) {
    console.error(`   ❌ Failed: ${url} — ${err.message}`);
    return { url, success: false, error: err.message };
  }
}

// ─── Step 3: Build chunk text from recipe ───
function buildChunkText(recipe) {
  const parts = [];
  parts.push(`Title: ${recipe.title}`);
  if (recipe.description) parts.push(`Description: ${recipe.description}`);
  parts.push('');

  if (recipe.meta.prepTime) parts.push(`זמן הכנה: ${recipe.meta.prepTime}`);
  if (recipe.meta.totalTime) parts.push(`זמן כולל: ${recipe.meta.totalTime}`);
  if (recipe.meta.servings) parts.push(`כמות מנות: ${recipe.meta.servings}`);
  if (recipe.meta.difficulty) parts.push(`רמת קושי: ${recipe.meta.difficulty}`);
  if (recipe.meta.calories) parts.push(`קלוריות: ${recipe.meta.calories}`);
  parts.push('');

  if (recipe.ingredients.length > 0) {
    parts.push('מרכיבים:');
    recipe.ingredients.forEach(ing => parts.push(`- ${ing}`));
    parts.push('');
  }

  if (recipe.steps.length > 0) {
    parts.push('אופן הכנה:');
    recipe.steps.forEach((step, i) => parts.push(`${i + 1}. ${step}`));
    parts.push('');
  }

  if (recipe.categories.length > 0) {
    parts.push(`קטגוריות: ${recipe.categories.join(', ')}`);
  }

  return parts.join('\n');
}

// ─── Step 4: Save to DB ───
async function saveRecipe(recipe, chunkText) {
  const chunkId = crypto.randomUUID();
  const tokenCount = Math.ceil(chunkText.length / 4); // rough estimate

  // Check if we already have this recipe (by title match)
  const { data: existing } = await supabase
    .from('document_chunks')
    .select('id')
    .eq('account_id', ACCOUNT_ID)
    .eq('entity_type', 'website')
    .ilike('chunk_text', `%Title: ${recipe.title}%`)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update existing chunk with full recipe
    const { error } = await supabase
      .from('document_chunks')
      .update({
        chunk_text: chunkText,
        token_count: tokenCount,
        metadata: {
          source_url: recipe.url,
          image_url: recipe.imageUrl,
          categories: recipe.categories,
          has_ingredients: recipe.ingredients.length > 0,
          has_instructions: recipe.steps.length > 0,
          scraped_at: new Date().toISOString(),
        },
      })
      .eq('id', existing[0].id);

    if (error) console.error(`   DB update error for "${recipe.title}":`, error.message);
    return { action: 'updated', id: existing[0].id };
  } else {
    // Insert parent document first (foreign key constraint)
    const documentId = crypto.randomUUID();
    const { error: docError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        account_id: ACCOUNT_ID,
        entity_type: 'website',
        title: recipe.title,
        source: recipe.url,
        chunk_count: 1,
        total_tokens: tokenCount,
        metadata: { scraped_at: new Date().toISOString() },
      });
    if (docError) {
      console.error(`   Document insert error for "${recipe.title}":`, docError.message);
      return { action: 'error', id: null };
    }

    const { error } = await supabase
      .from('document_chunks')
      .insert({
        id: chunkId,
        document_id: documentId,
        account_id: ACCOUNT_ID,
        chunk_text: chunkText,
        entity_type: 'website',
        topic: 'food',
        token_count: tokenCount,
        metadata: {
          source_url: recipe.url,
          image_url: recipe.imageUrl,
          categories: recipe.categories,
          has_ingredients: recipe.ingredients.length > 0,
          has_instructions: recipe.steps.length > 0,
          scraped_at: new Date().toISOString(),
        },
      });

    if (error) console.error(`   DB insert error for "${recipe.title}":`, error.message);
    return { action: 'inserted', id: chunkId };
  }
}

// ─── Main ───
async function main() {
  console.log('🍳 Foody Recipe Scraper (Playwright)');
  console.log(`   Account: ${ACCOUNT_ID}`);
  console.log(`   Concurrency: ${CONCURRENCY}`);
  console.log(`   Dry run: ${DRY_RUN}`);
  console.log('');

  const urls = await getRecipeUrls();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    locale: 'he-IL',
  });

  let scraped = 0, updated = 0, inserted = 0, failed = 0;
  let noIngredients = 0, noSteps = 0;

  // Process in batches
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const pages = await Promise.all(batch.map(() => context.newPage()));

    const results = await Promise.all(
      batch.map((url, idx) => scrapeRecipe(pages[idx], url))
    );

    for (const recipe of results) {
      scraped++;
      if (!recipe.success) { failed++; continue; }

      if (recipe.ingredients.length === 0) noIngredients++;
      if (recipe.steps.length === 0) noSteps++;

      const chunkText = buildChunkText(recipe);

      if (DRY_RUN) {
        console.log(`\n── ${recipe.title} ──`);
        console.log(`   Ingredients: ${recipe.ingredients.length}`);
        console.log(`   Steps: ${recipe.steps.length}`);
        console.log(`   Image: ${recipe.imageUrl ? '✅' : '❌'}`);
        console.log(`   Categories: ${recipe.categories.join(', ')}`);
        if (recipe.ingredients.length > 0) {
          console.log(`   First 3: ${recipe.ingredients.slice(0, 3).join(' | ')}`);
        }
      } else {
        const result = await saveRecipe(recipe, chunkText);
        if (result.action === 'updated') updated++;
        else inserted++;
      }

      // Progress
      if (scraped % 10 === 0) {
        console.log(`   📊 Progress: ${scraped}/${urls.length} (${updated} updated, ${inserted} new, ${failed} failed)`);
      }
    }

    // Close pages
    await Promise.all(pages.map(p => p.close()));

    // Brief delay to avoid hammering the server
    if (i + CONCURRENCY < urls.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  await browser.close();

  console.log('\n✅ Done!');
  console.log(`   Total: ${scraped}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   New: ${inserted}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Missing ingredients: ${noIngredients}`);
  console.log(`   Missing steps: ${noSteps}`);

  if (!SKIP_RAG && !DRY_RUN && (updated + inserted) > 0) {
    console.log('\n🔄 To re-run RAG enrichment:');
    console.log(`   npx tsx scripts/enrich-rag-chunks.ts ${ACCOUNT_ID} --all`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
