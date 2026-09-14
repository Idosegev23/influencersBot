#!/usr/bin/env node
/**
 * After `next build`: prove the WhatsApp product-image function bundle carries sharp's native
 * addon AND the libvips shared library it links against.
 *
 * Why this exists: sharp 0.35 dlopens libvips-cpp through the dynamic loader, so no JS names the
 * file and tracing left it out. Production 500'd on every /api/wa/product-image request with
 * "ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3". next.config.ts's outputFileTracingIncludes puts it
 * back; this script is how you check that it still does (a Next upgrade can change include matching).
 *
 *   node scripts/check-sharp-trace.mjs            # exits 1 if either file is missing
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const trace = join(process.cwd(), '.next/server/app/api/wa/product-image/[productId]/route.js.nft.json');
if (!existsSync(trace)) {
  console.error(`no trace at ${trace} — run \`next build\` first`);
  process.exit(2);
}

const files = JSON.parse(readFileSync(trace, 'utf8')).files || [];
// Linux on Vercel (libvips-cpp.so.8.x), darwin locally (libvips-cpp.8.x.dylib).
const libvips = files.filter((f) => /@img\/sharp-libvips-[^/]+\/lib\/libvips-cpp\.(so\.\d|[\d.]+dylib)/.test(f));
const addon = files.filter((f) => /@img\/sharp-[^/]+\/lib\/sharp-[^/]+\.node$/.test(f));

console.log(`trace: ${files.length} files`);
console.log('libvips:', libvips.length ? `\n  ${libvips.join('\n  ')}` : 'MISSING');
console.log('addon:  ', addon.length ? `\n  ${addon.join('\n  ')}` : 'MISSING');

if (!libvips.length || !addon.length) {
  console.error('\nFAIL: the product-image function would not be able to load sharp.');
  process.exit(1);
}
console.log('\nOK');
