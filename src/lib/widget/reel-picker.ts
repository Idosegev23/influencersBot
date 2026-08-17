/**
 * Picks which reels are fit to sit behind a banner.
 *
 * View count is the obvious ranking and the wrong one. On the first account
 * this ran for, the three most-watched reels were a talking-head about
 * relationships, a bit about dating, and a soldier's memorial — while the ones
 * that actually suited the assistant (a pan of pasta, a bowl of orzo) sat far
 * down the list. Views measure what an audience chose to watch; a banner needs
 * something that reads well muted, cropped to a wide strip, and looping
 * forever behind text.
 *
 * So a vision model looks at the poster frame and answers that question
 * directly. Hand-picking worked for one account; it does not scale to fifty.
 */

import { getGeminiClient, MODELS } from '@/lib/ai/google-client';

export interface ReelCandidate {
  shortcode: string;
  /** Public URL of the stored poster frame. */
  poster: string;
  viewsCount?: number | null;
  caption?: string | null;
}

export interface ReelVerdict {
  shortcode: string;
  /** 0-10. Higher is a better silent, looping, cropped backdrop. */
  score: number;
  /** Hard disqualifiers, kept separate so the log says why something lost. */
  faceDominant: boolean;
  burnedInText: boolean;
  reason: string;
}

const SYSTEM = `You judge whether a single video frame works as the BACKGROUND of a
website banner. The frame will be cropped to a wide strip, played silently on a
loop, and have headline text laid near it.

Score 0-10 on how well it serves that job:
 - 8-10: a clear subject filling the frame (food, product, place, texture),
   bright, legible when cropped to a horizontal band.
 - 4-7: acceptable but compromised — busy, dim, off-centre, or the subject is
   small.
 - 0-3: unusable — a person's face dominates the frame, heavy burned-in
   caption text, a title card, a screenshot, near-black, or motion blur that
   leaves nothing recognisable.

Judge ONLY what is visible. Ignore how popular the video is.

Return STRICT JSON, no prose:
{"score": <0-10>, "faceDominant": <bool>, "burnedInText": <bool>, "reason": "<12 words max>"}`;

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
      faceDominant: raw.faceDominant === true,
      burnedInText: raw.burnedInText === true,
      reason: String(raw.reason || '').slice(0, 120),
    };
  } catch {
    return null;
  }
}

/** Score one candidate. Returns null when the frame could not be judged. */
export async function scoreReel(candidate: ReelCandidate): Promise<ReelVerdict | null> {
  const image = await fetchAsInline(candidate.poster);
  if (!image) return null;

  try {
    const res = await getGeminiClient().models.generateContent({
      model: MODELS.CHAT_FAST,
      contents: [{
        role: 'user',
        parts: [
          { text: SYSTEM },
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
  /** Reject anything at or below this score. */
  minScore?: number;
  /** Hard ceiling on how many frames get judged. */
  maxJudged?: number;
}

/**
 * Stop judging once this many usable frames are in hand — enough to choose
 * between rather than merely fill the slots.
 *
 * The pool has to be wide even though the cost is per frame, because ranking
 * candidates by views feeds the judge exactly the frames it is going to reject:
 * the most-watched posts are the ones with a face filling the frame. On the
 * first account tried, the top twelve by views yielded a single usable frame,
 * while good ones sat further down the list. Judging in view order with an
 * early exit keeps the common case cheap and still reaches down when the
 * popular frames are all faces.
 */
const ENOUGH_MULTIPLIER = 2;

/**
 * Score candidates and return the best `count`.
 *
 * A frame is rejected outright when a face dominates it or it carries burned-in
 * captions, whatever else it scores: both are things that look fine as a
 * thumbnail and fall apart the moment the frame is cropped into a strip with
 * our own headline over it.
 */
export async function pickReels(
  candidates: ReelCandidate[],
  opts: PickOptions,
): Promise<{ picked: ReelVerdict[]; rejected: ReelVerdict[]; unjudged: string[] }> {
  const minScore = opts.minScore ?? 6;
  const pool = candidates.slice(0, opts.maxJudged ?? 30);
  const enough = opts.count * ENOUGH_MULTIPLIER;

  const verdicts: ReelVerdict[] = [];
  const unjudged: string[] = [];
  const isUsable = (v: ReelVerdict) =>
    !v.faceDominant && !v.burnedInText && v.score >= minScore;

  for (const c of pool) {
    const v = await scoreReel(c);
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
