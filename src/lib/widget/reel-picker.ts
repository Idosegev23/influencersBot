/**
 * Picks which reels are fit to sit behind a banner.
 *
 * View count is the obvious ranking and the wrong one. On the first account
 * this ran for, the three most-watched reels were a talking-head about
 * relationships, a bit about dating, and a soldier's memorial — while the ones
 * that suited the assistant (a pan of pasta, a bowl of orzo) sat far down the
 * list. Views measure what an audience chose to watch; a banner needs a frame
 * that reads well muted, cropped to a wide strip, and looping behind text.
 *
 * So a vision model is asked that question directly about the poster frame.
 *
 * What disqualifies a frame is narrower than it first appears. An early version
 * rejected any frame with a prominent face, generalising from one food account
 * whose faces happened to crop badly. Applied broadly it returned nothing:
 * reels are mostly people talking, and on a creator's page the creator's face
 * is the point — the visitor came for that person. Burned-in captions are the
 * real problem, because they fight the headline the banner puts underneath.
 */

import { getGeminiClient, MODELS } from '@/lib/ai/google-client';

export interface ReelCandidate {
  shortcode: string;
  /** Public URL of the stored poster frame. */
  poster: string;
  viewsCount?: number | null;
  caption?: string | null;
}

/** What the account is, so the judge can score fit rather than generic prettiness. */
export interface AccountContext {
  /** `influencer_type`: food, fashion, tech, lifestyle… */
  type?: string | null;
  /** `config.archetype`: influencer, brand, service_provider… */
  archetype?: string | null;
  brandName?: string | null;
}

export interface ReelVerdict {
  shortcode: string;
  /** 0-10. Higher is a better silent, looping, cropped backdrop for this account. */
  score: number;
  /** The one hard disqualifier: text baked into the frame. */
  burnedInText: boolean;
  reason: string;
}

function subject(ctx: AccountContext): string {
  const kind = (ctx.type || '').toLowerCase();
  const isBrand = (ctx.archetype || '') === 'brand';
  if (kind === 'food') return 'dishes, ingredients, cooking';
  if (kind === 'fashion') return 'outfits, garments, styling';
  if (kind === 'beauty') return 'skin, makeup, product textures';
  if (kind === 'tech') return 'devices, screens, hardware';
  if (kind === 'travel') return 'places, landscapes, interiors';
  if (kind === 'fitness') return 'movement, training, bodies in action';
  return isBrand ? 'products and the places they are used' : 'the creator and what they make';
}

function buildPrompt(ctx: AccountContext): string {
  const who = ctx.brandName ? `"${ctx.brandName}"` : 'this account';
  const isBrand = (ctx.archetype || '') === 'brand';

  return `You judge whether a single video frame works as the BACKGROUND of a chat
banner for ${who} — ${isBrand ? 'a brand' : 'a creator'} whose content is about ${subject(ctx)}.

The frame will be cropped to a wide strip, played silently on a loop, with the
headline text sitting BELOW it (not on top of it).

Score 0-10 on how well it represents this account and holds up as that backdrop:
 - 8-10: bright, clear, instantly recognisable as this account's world. A
   person is entirely fine${isBrand ? ' when they are clearly using or presenting the product' : ' — for a creator, their own face is on-brand'}.
 - 4-7: acceptable but compromised — dim, cluttered, subject small or off-centre.
 - 0-3: unusable — heavy burned-in caption text, a title card, a screenshot,
   near-black, or motion blur leaving nothing recognisable.

Set burnedInText true when words are baked into the picture (subtitles, captions,
meme text, a title card). Small logos and package labels do NOT count.

Judge ONLY what is visible. Ignore how popular the video is.

Return STRICT JSON, no prose:
{"score": <0-10>, "burnedInText": <bool>, "reason": "<12 words max>"}`;
}

async function fetchAsInline(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    if (!mimeType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Posters are Instagram-sized JPEGs (~100-500KB). Anything far larger is
    // not worth the upload for a yes/no judgement.
    if (buf.byteLength > 4_000_000) return null;
    return { mimeType, data: buf.toString('base64') };
  } catch {
    return null;
  }
}

function parseVerdict(text: string): Omit<ReelVerdict, 'shortcode'> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]);
    const score = Number(raw.score);
    if (!Number.isFinite(score)) return null;
    return {
      score: Math.max(0, Math.min(10, score)),
      burnedInText: raw.burnedInText === true,
      reason: String(raw.reason || '').slice(0, 120),
    };
  } catch {
    return null;
  }
}

/** Score one candidate. Returns null when the frame could not be judged. */
export async function scoreReel(
  candidate: ReelCandidate,
  ctx: AccountContext = {},
): Promise<ReelVerdict | null> {
  const image = await fetchAsInline(candidate.poster);
  if (!image) return null;

  try {
    const res = await getGeminiClient().models.generateContent({
      model: MODELS.CHAT_FAST,
      contents: [{
        role: 'user',
        parts: [
          { text: buildPrompt(ctx) },
          { inlineData: { mimeType: image.mimeType, data: image.data } },
        ],
      }],
    });
    const verdict = parseVerdict(res.text || '');
    return verdict ? { shortcode: candidate.shortcode, ...verdict } : null;
  } catch {
    return null;
  }
}

export interface PickOptions {
  /** How many to return. */
  count: number;
  /** Reject anything below this score. */
  minScore?: number;
  /** Hard ceiling on how many frames get judged. */
  maxJudged?: number;
  account?: AccountContext;
}

/**
 * Stop judging once this many usable frames are in hand — enough to choose
 * between rather than merely fill the slots.
 *
 * The pool has to be wide even though the cost is per frame, because ranking
 * candidates by views feeds the judge the frames most likely to be captioned
 * clip-of-the-week posts. Judging in view order with an early exit keeps the
 * common case cheap and still reaches down when the popular frames are noisy.
 */
const ENOUGH_MULTIPLIER = 2;

export async function pickReels(
  candidates: ReelCandidate[],
  opts: PickOptions,
): Promise<{ picked: ReelVerdict[]; rejected: ReelVerdict[]; unjudged: string[] }> {
  const minScore = opts.minScore ?? 6;
  const pool = candidates.slice(0, opts.maxJudged ?? 30);
  const enough = opts.count * ENOUGH_MULTIPLIER;

  const verdicts: ReelVerdict[] = [];
  const unjudged: string[] = [];
  const isUsable = (v: ReelVerdict) => !v.burnedInText && v.score >= minScore;

  for (const c of pool) {
    const v = await scoreReel(c, opts.account);
    if (v) verdicts.push(v);
    else unjudged.push(c.shortcode);
    if (verdicts.filter(isUsable).length >= enough) break;
  }

  const usable = verdicts.filter(isUsable);
  usable.sort((a, b) => b.score - a.score);

  const picked = usable.slice(0, opts.count);
  const pickedCodes = new Set(picked.map((p) => p.shortcode));
  return {
    picked,
    rejected: verdicts.filter((v) => !pickedCodes.has(v.shortcode)),
    unjudged,
  };
}
