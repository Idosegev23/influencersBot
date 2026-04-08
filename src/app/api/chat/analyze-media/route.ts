import { NextRequest, NextResponse } from 'next/server';
import { analyzeMediaForChat } from '@/lib/chat/vision-analyzer';
import { checkRateLimit } from '@/lib/rate-limit';
import { sanitizeUsername } from '@/lib/sanitize';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const storagePath = (body.storagePath || '').replace(/[^a-zA-Z0-9_\-./]/g, '').slice(0, 500);
    const mediaType = body.mediaType;
    const username = sanitizeUsername(body.username || '');

    if (!storagePath || !mediaType || !username) {
      return NextResponse.json(
        { error: 'Missing required fields: storagePath, mediaType, username' },
        { status: 400 }
      );
    }

    if (!['image', 'video'].includes(mediaType)) {
      return NextResponse.json(
        { error: 'mediaType must be "image" or "video"' },
        { status: 400 }
      );
    }

    // Rate limit using chat bucket
    const rl = await checkRateLimit('account', 'chat', { accountId: username });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
      );
    }

    const result = await analyzeMediaForChat(storagePath, mediaType);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[analyze-media] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to analyze media' },
      { status: 500 }
    );
  }
}
