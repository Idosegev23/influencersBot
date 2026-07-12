/**
 * Per-account scan sources.
 *   GET   — current sources ({instagram, website, youtube, tiktok}) + what each
 *           produced (post/transcription/page/product counts) + isDemo.
 *   PATCH — persist edited sources to config.sources (canonical).
 *   POST  — save sources + kick off a re-scan. Demo accounts get a light "quote"
 *           scan (recent items only); real accounts get a full scan.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { startPipeline } from '@/lib/pipeline/start';

interface Sources {
  instagram: string;
  website: string;
  youtube: string;
  tiktok: string;
}

/** Seed sources from config: prefer explicit config.sources, else best-effort. */
function deriveSources(cfg: Record<string, any>): Sources {
  const s = cfg.sources || {};
  const uname: string = cfg.username || '';
  const unameIsDomain = /\./.test(uname);
  return {
    instagram: s.instagram ?? cfg.instagram_username ?? (uname && !unameIsDomain ? uname : ''),
    website: s.website ?? cfg.website ?? (unameIsDomain ? uname : ''),
    youtube: s.youtube ?? cfg.youtube?.handle ?? '',
    tiktok: s.tiktok ?? cfg.tiktok?.uniqueId ?? '',
  };
}

function cleanSources(body: any): Sources {
  const str = (v: any) => (typeof v === 'string' ? v.trim() : '');
  return {
    instagram: str(body?.instagram),
    website: str(body?.website),
    youtube: str(body?.youtube),
    tiktok: str(body?.tiktok),
  };
}

async function countBy(supabase: any, table: string, filters: Record<string, any>): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count } = await q;
  return count || 0;
}

export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  const supabase = await createClient();

  const { data: account, error } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  if (error || !account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const cfg = account.config || {};
  const sources = deriveSources(cfg);

  // Instagram posts have platform='instagram' OR (legacy) NULL — count the rest by tag.
  const [igPosts, ytPosts, ttPosts, transcriptions, websites, products] = await Promise.all([
    supabase
      .from('instagram_posts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .or('platform.eq.instagram,platform.is.null')
      .then((r: any) => r.count || 0),
    countBy(supabase, 'instagram_posts', { account_id: accountId, platform: 'youtube' }),
    countBy(supabase, 'instagram_posts', { account_id: accountId, platform: 'tiktok' }),
    countBy(supabase, 'instagram_transcriptions', { account_id: accountId }),
    countBy(supabase, 'instagram_bio_websites', { account_id: accountId }),
    countBy(supabase, 'widget_products', { account_id: accountId }),
  ]);

  return NextResponse.json({
    sources,
    isDemo: cfg.isDemo !== false, // default demo unless explicitly false
    archetype: cfg.archetype || 'brand',
    counts: {
      instagramPosts: igPosts,
      youtubePosts: ytPosts,
      tiktokPosts: ttPosts,
      transcriptions,
      websitePages: websites,
      products,
    },
  });
}

async function saveSources(supabase: any, accountId: string, sources: Sources) {
  const { data: account, error } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  if (error || !account) return { error: 'Account not found', status: 404 as const };
  const cfg = account.config || {};
  cfg.sources = sources;
  const { error: upErr } = await supabase.from('accounts').update({ config: cfg }).eq('id', accountId);
  if (upErr) return { error: upErr.message, status: 500 as const };
  return { cfg };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  const sources = cleanSources(await request.json());
  const supabase = await createClient();

  const res = await saveSources(supabase, accountId, sources);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ success: true, sources });
}

const SOURCE_KEYS = ['instagram', 'website', 'youtube', 'tiktok'] as const;
type SourceKey = (typeof SOURCE_KEYS)[number];

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  const body = await request.json();
  const sources = cleanSources(body);
  // `enrich`: incremental mode — scrape ONLY these sources, then re-ingest RAG +
  // rebuild the persona over the combined content. Empty/absent = full re-scan.
  const enrich: SourceKey[] = Array.isArray(body?.enrich)
    ? body.enrich.filter((k: any): k is SourceKey => SOURCE_KEYS.includes(k))
    : [];
  const supabase = await createClient();

  // Persist the (possibly edited) sources, then (re)scan off them.
  const res = await saveSources(supabase, accountId, sources);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });

  const cfg = res.cfg;
  const isDemo = cfg.isDemo !== false;

  if (!sources.instagram && !sources.website && !sources.youtube && !sources.tiktok) {
    return NextResponse.json({ error: 'לפחות מקור אחד נדרש (אינסטגרם / אתר / יוטיוב / טיקטוק)' }, { status: 400 });
  }
  // Enrich must target a source that actually has a value to scrape.
  if (enrich.length && !enrich.some((k) => sources[k])) {
    return NextResponse.json({ error: 'המקור לעיבוי ריק — הזן קישור/שם משתמש למקור שנבחר' }, { status: 400 });
  }

  const result = await startPipeline({
    accountId,
    username: sources.instagram || undefined,
    websiteUrl: sources.website || undefined,
    youtube: sources.youtube || undefined,
    tiktok: sources.tiktok || undefined,
    isDemo,
    // Demo accounts → light "quote" scan (recent items only); real accounts → full.
    scanMode: isDemo ? 'quote' : 'full',
    archetype: cfg.archetype || 'brand',
    enrichSources: enrich.length ? enrich : undefined,
    requestedBy: enrich.length ? 'admin:enrich' : 'admin:rescan',
  });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    jobId: result.jobId,
    mode: enrich.length ? 'enrich' : isDemo ? 'quote' : 'full',
    enrich,
  });
}
