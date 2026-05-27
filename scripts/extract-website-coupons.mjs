#!/usr/bin/env node --env-file=.env.local
/**
 * Extract coupon codes + affiliate URLs from website document_chunks
 * using GPT-5.4. Designed for coupon-curator influencers (e.g. reutbuyitforme.com)
 * where each website chunk is a product recommendation with prose-embedded codes.
 *
 * Usage:
 *   node --env-file=.env.local scripts/extract-website-coupons.mjs --account-id <id> [--dry-run] [--limit <n>]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const argv = process.argv.slice(2);
const getArg = (name, def = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
};

const ACCOUNT_ID = getArg('--account-id');
const DRY_RUN = argv.includes('--dry-run');
const LIMIT = parseInt(getArg('--limit', '500'));

if (!ACCOUNT_ID || !SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing required: --account-id, SUPABASE_*, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SYSTEM_PROMPT = `You extract structured coupon data from Hebrew-language recommendation posts on an influencer's blog.
The influencer (רעות לב / Reut Lev) curates products and shares affiliate links + discount codes.

For each input chunk, return a JSON object:
{
  "coupons": [
    {
      "brand_name": "<the SHOP or BRAND, e.g. 'Wear BU', 'אמזון', 'אליאקספרס', 'WallaShops'. Never use 'רעות' or 'תקני לי'.>",
      "brand_category": "<short Hebrew category, e.g. 'אופנה', 'אלקטרוניקה', 'בית', 'יופי'>",
      "product_name": "<short product description in Hebrew if available>",
      "coupon_code": "<the literal code, e.g. 'REUTBUY25OFF'. null if no explicit code shown>",
      "discount_value": <numeric, e.g. 25. null if unknown>,
      "discount_type": "<'percentage' or 'fixed'>",
      "discount_currency": "<'ILS','USD','EUR','GBP' for fixed types, else null>",
      "discount_description": "<original Hebrew phrasing, e.g. '25 אחוז הנחה'>",
      "affiliate_url": "<the EXACT purchase URL (amzn.to/, aliexpress, bit.ly/, reutbuy.me/, wallashops). Preserve as-is. Do NOT use generic /index/ URLs.>",
      "notes": "<optional context>"
    }
  ]
}

Rules:
- Return ONLY valid JSON. No markdown fences.
- If the chunk has multiple coupons for the same product, return all of them.
- If NO actual coupon code is mentioned but there IS a clear affiliate URL + brand, still include one entry with coupon_code=null (it's a recommendation).
- If you can't identify a brand/store, skip the entry.
- Preserve coupon codes EXACTLY (case + numbers). They go directly to checkouts.
- affiliate_url MUST be a real external purchase link (amzn.to/, *.aliexpress, bit.ly/, reutbuy.me/, wallashops.co.il/, addict, balimashu, *.co.il, *.com). Skip if only internal reutbuyitforme.com links exist.
`;

async function gpt54(prompt) {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4',
      input: prompt,
      reasoning: { effort: 'low' },
      text: { format: { type: 'text' } },
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const result = await resp.json();
  const rawOutput = result.output;
  let text;
  if (typeof rawOutput === 'string') text = rawOutput;
  else if (Array.isArray(rawOutput)) {
    const msg = rawOutput.find((x) => x.type === 'message');
    text = msg?.content?.find((c) => c.type === 'output_text' || c.text)?.text;
  } else if (rawOutput && typeof rawOutput === 'object') text = rawOutput.text || rawOutput.content;
  if (!text) throw new Error('No text in GPT response');
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

function isAffiliate(url) {
  if (!url || typeof url !== 'string') return false;
  return /(amzn\.to|aliexpress|bit\.ly|reutbuy\.me|wallashops\.co\.il|balimashu|addict|s\.click|tidd\.ly|prf\.hn)/i.test(url);
}

async function main() {
  console.log(`Fetching ALL website chunks for ${ACCOUNT_ID} (paginated)...`);
  const chunks = [];
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('id, chunk_text, metadata, document_id')
      .eq('account_id', ACCOUNT_ID)
      .eq('entity_type', 'website')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    chunks.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Pulled ${chunks.length} website chunks total`);

  // Candidate = any chunk with an affiliate URL (where the actual purchase happens).
  // Coupon keywords are a nice-to-have but most recommendations are just affiliate links.
  const candidates = chunks.filter((c) => {
    const t = c.chunk_text || '';
    return /(amzn\.to|aliexpress|bit\.ly|reutbuy\.me|wallashops|balimashu|addict|s\.click|tidd\.ly|prf\.hn)/i.test(t);
  }).slice(0, LIMIT);

  console.log(`${candidates.length} candidates (have BOTH discount-word AND affiliate URL)`);

  // Group by source URL to avoid extracting the same product twice if its content was split across chunks
  const bySrc = new Map();
  for (const c of candidates) {
    const src = c.metadata?.url || c.id;
    const cur = bySrc.get(src) || { src, chunks: [] };
    cur.chunks.push(c);
    bySrc.set(src, cur);
  }
  const sources = [...bySrc.values()];
  console.log(`${sources.length} unique source pages`);

  // Extract coupons for each source page
  const allExtracted = [];
  let processed = 0;
  for (const source of sources) {
    processed++;
    const merged = source.chunks.map((c) => c.chunk_text).join('\n---\n');
    const prompt = `${SYSTEM_PROMPT}\n\n## Source page: ${source.src}\n\n## Chunk content:\n${merged.slice(0, 8000)}`;
    try {
      const jsonText = await gpt54(prompt);
      const parsed = JSON.parse(jsonText);
      const list = Array.isArray(parsed?.coupons) ? parsed.coupons : [];
      for (const c of list) {
        if (!c.brand_name) continue;
        if (!isAffiliate(c.affiliate_url) && !c.coupon_code) continue;
        allExtracted.push({ ...c, source_url: source.src });
      }
      const tagged = list.filter((c) => c.coupon_code).length;
      console.log(`[${processed}/${sources.length}] ${source.src.slice(-60)} → ${list.length} found (${tagged} with codes)`);
    } catch (e) {
      console.warn(`[${processed}/${sources.length}] FAILED: ${e.message?.slice(0, 100)}`);
    }
  }

  console.log(`\nTotal extracted: ${allExtracted.length} (${allExtracted.filter((c) => c.coupon_code).length} with explicit codes)`);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN: First 5 ===');
    console.log(JSON.stringify(allExtracted.slice(0, 5), null, 2));
    return;
  }

  // Load existing partnerships + coupons for dedup
  const { data: existingPartnerships } = await supabase
    .from('partnerships')
    .select('id, brand_name, coupon_code, link')
    .eq('account_id', ACCOUNT_ID);
  const { data: existingCoupons } = await supabase
    .from('coupons')
    .select('id, code')
    .eq('account_id', ACCOUNT_ID);

  const partnershipByBrand = new Map((existingPartnerships || []).map((p) => [p.brand_name.toLowerCase(), p]));
  const existingCouponCodes = new Set((existingCoupons || []).map((c) => c.code.toLowerCase()));

  // Group extracted by brand_name (canonical)
  const byBrand = new Map();
  for (const ex of allExtracted) {
    const key = ex.brand_name.toLowerCase().trim();
    const cur = byBrand.get(key) || { brand_name: ex.brand_name, category: ex.brand_category, samples: [] };
    cur.samples.push(ex);
    byBrand.set(key, cur);
  }
  console.log(`${byBrand.size} unique brands to upsert`);

  let partnershipsCreated = 0, partnershipsUpdated = 0, couponsCreated = 0, couponsSkipped = 0;

  for (const [key, group] of byBrand.entries()) {
    let partnership = partnershipByBrand.get(key);
    const sampleWithLink = group.samples.find((s) => isAffiliate(s.affiliate_url));
    const link = sampleWithLink?.affiliate_url || null;

    if (!partnership) {
      const { data: newP, error: pErr } = await supabase
        .from('partnerships')
        .insert({
          account_id: ACCOUNT_ID,
          brand_name: group.brand_name,
          category: group.category,
          link,
          status: 'active',
          is_active: true,
          notes: 'Auto-extracted from reutbuyitforme.com',
        })
        .select('id, brand_name, coupon_code, link')
        .single();
      if (pErr) {
        console.warn(`Partnership insert failed: ${group.brand_name}: ${pErr.message}`);
        continue;
      }
      partnership = newP;
      partnershipByBrand.set(key, partnership);
      partnershipsCreated++;
    } else if (link && !partnership.link) {
      await supabase.from('partnerships').update({ link }).eq('id', partnership.id);
      partnershipsUpdated++;
    }

    // Insert coupons (deduped by code globally per account)
    for (const ex of group.samples) {
      if (!ex.coupon_code) continue;
      const codeKey = ex.coupon_code.toLowerCase();
      if (existingCouponCodes.has(codeKey)) { couponsSkipped++; continue; }
      const discountType = ex.discount_type === 'fixed' ? 'fixed' : 'percentage';
      const discountValue = ex.discount_value ?? 0;
      const { error: cErr } = await supabase.from('coupons').insert({
        account_id: ACCOUNT_ID,
        partnership_id: partnership.id,
        code: ex.coupon_code,
        discount_type: discountType,
        discount_value: discountValue,
        currency: ex.discount_currency || (discountType === 'fixed' ? 'ILS' : null),
        description: ex.discount_description || null,
        brand_name: group.brand_name,
        brand_category: group.category || null,
        brand_link: ex.affiliate_url || null,
        tracking_url: ex.affiliate_url || null,
        is_active: true,
      });
      if (cErr) {
        console.warn(`Coupon insert failed (${ex.coupon_code}): ${cErr.message}`);
      } else {
        couponsCreated++;
        existingCouponCodes.add(codeKey);
      }
    }
  }

  console.log(`\nDONE:
  partnerships created: ${partnershipsCreated}
  partnerships updated: ${partnershipsUpdated}
  coupons created:      ${couponsCreated}
  coupons skipped:      ${couponsSkipped} (already existed)`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
