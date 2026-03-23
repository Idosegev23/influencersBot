/**
 * GET /api/discovery/hot-topics
 * Returns hot topics for news discovery UI.
 * Query params: limit (default 10), status (comma-separated, default 'breaking,hot')
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTopHotTopics, getHotTopicsByTag } from '@/lib/hot-topics/query';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const statusParam = searchParams.get('status') || 'breaking,hot';
    const tag = searchParams.get('tag');
    const statuses = statusParam.split(',').map(s => s.trim());

    let topics;
    if (tag) {
      topics = await getHotTopicsByTag(tag, limit);
    } else {
      topics = await getTopHotTopics(limit, statuses);
    }

    return NextResponse.json({
      topics,
      count: topics.length,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error: any) {
    console.error('[API/discovery/hot-topics] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
