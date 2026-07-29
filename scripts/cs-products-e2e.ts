/**
 * Live check for WhatsApp product cards. The unit tests mock `global.fetch` (tests/setup.ts), so
 * nothing in the suite proves that Meta actually ACCEPTS a cta_url message with our JPEG header —
 * only a real send does. Run this against your own number after deploying.
 *
 * It walks the whole path a shopper's turn would: pick a real product for the brand, verify the
 * JPEG proxy serves image/jpeg, then send the card.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/cs-products-e2e.ts <to> [accountId]
 *   <to>        E.164 destination, e.g. 972501112222 (must have messaged the number in the last 24h)
 *   [accountId] defaults to the first CS-enabled brand with products_enabled
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const [to, accountIdArg] = process.argv.slice(2);
  if (!to) {
    console.error('Usage: cs-products-e2e.ts <to> [accountId]');
    process.exit(1);
  }

  const { supabase } = await import('../src/lib/supabase');
  const { sendProductCards, productImageUrl, appBaseUrl } = await import('../src/lib/cs/cs-product-cards');

  let accountId = accountIdArg;
  if (!accountId) {
    const { data } = await supabase.from('accounts').select('id, config');
    const hit = ((data as any[]) || []).find((a) => a.config?.whatsapp_cs?.products_enabled === true);
    if (!hit) {
      console.error('No account has config.whatsapp_cs.products_enabled = true. Enable one first, or pass an accountId.');
      process.exit(1);
    }
    accountId = hit.id;
    console.log(`Brand: ${hit.config?.display_name || accountId}`);
  }

  const { data: products } = await supabase
    .from('widget_products')
    .select('id, name, name_he, price, original_price, is_on_sale, product_url, image_url')
    .eq('account_id', accountId)
    .eq('is_available', true)
    .not('image_url', 'is', null)
    .limit(2);

  const rows = (products as any[]) || [];
  if (!rows.length) {
    console.error(`No usable products for account ${accountId}`);
    process.exit(1);
  }

  // The header image is fetched by Meta, not by us — so if this URL doesn't serve real JPEG bytes,
  // the card silently arrives without a photo. Check it before sending, not after.
  for (const r of rows) {
    const url = productImageUrl(r.id);
    const res = await fetch(url);
    const type = res.headers.get('content-type');
    const len = res.headers.get('content-length');
    console.log(`  image ${r.id}: ${res.status} ${type} ${len}b  ${url}`);
    if (!res.ok || type !== 'image/jpeg') {
      console.error(`  ✗ expected 200 image/jpeg — is ${appBaseUrl()} reachable from here?`);
      process.exit(1);
    }
  }

  const cards = rows.map((r) => ({
    productId: r.id,
    name: (r.name_he || r.name || '').trim(),
    price: r.price === null ? null : Number(r.price),
    originalPrice: r.original_price === null ? null : Number(r.original_price),
    isOnSale: r.is_on_sale === true,
    productUrl: r.product_url,
    imageUrl: r.image_url,
  }));

  const sent = await sendProductCards(to, cards);
  console.log(`\nSent ${sent}/${cards.length} cards to ${to}.`);
  console.log('Check the phone: each should show a photo, name + price, and a "לצפייה במוצר" button.');
  process.exit(sent === cards.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
