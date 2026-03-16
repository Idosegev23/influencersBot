import { NextRequest, NextResponse } from 'next/server';
import { analyzeMediaForChat } from '@/lib/chat/vision-analyzer';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const { storagePath, mediaType, username } = await req.json();

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
