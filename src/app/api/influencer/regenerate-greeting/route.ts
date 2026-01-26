import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getInfluencerByUsername,
  getProductsByInfluencer,
  getContentByInfluencer,
  updateInfluencer,
} from '@/lib/supabase';
import { generateGreetingAndQuestions } from '@/lib/openai';
import { requireAuth } from '@/lib/auth/api-helpers';

export async function POST(req: NextRequest) {
  try {
    // Auth check (new RBAC)
    const auth = await requireAuth(req, 'partnerships', 'update');
    if (!auth.authorized) {
      return auth.response!;
    }

    const { username } = await req.json();

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Check authentication (legacy)
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(`influencer_auth_${username}`);

    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get influencer
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Get products and content for AI context
    const [products, content] = await Promise.all([
      getProductsByInfluencer(influencer.id),
      getContentByInfluencer(influencer.id),
    ]);

    // Generate new greeting and questions
    const { greeting, questions } = await generateGreetingAndQuestions(
      influencer.display_name,
      influencer.influencer_type,
      influencer.persona || {
        tone: 'friendly',
        style: 'casual',
        interests: [],
        signature_phrases: [],
        emoji_style: 'minimal' as const,
        language: 'he' as const,
      },
      products.map(p => ({
        name: p.name,
        brand: p.brand || undefined,
        coupon_code: p.coupon_code || undefined,
      })),
      content.map(c => ({
        title: c.title,
        type: c.type,
      }))
    );

    // Update in database
    await updateInfluencer(influencer.id, {
      greeting_message: greeting,
      suggested_questions: questions,
    });

    return NextResponse.json({
      greeting,
      questions,
    });
  } catch (error) {
    console.error('Error regenerating greeting:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

