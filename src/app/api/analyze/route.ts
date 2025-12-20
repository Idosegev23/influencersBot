import { NextRequest, NextResponse } from 'next/server';
import {
  detectInfluencerType,
  generatePersona,
  analyzeAllPosts,
  extractRecipeFromPost,
} from '@/lib/openai';
import { themePresets } from '@/lib/theme';
import type { ApifyProfileData, ApifyPostData, ContentItem, Product } from '@/types';

interface AnalyzeRequest {
  profile: ApifyProfileData;
  posts: ApifyPostData[];
}

export async function POST(req: NextRequest) {
  try {
    const { profile, posts }: AnalyzeRequest = await req.json();

    if (!profile || !posts) {
      return NextResponse.json(
        { error: 'Profile and posts are required' },
        { status: 400 }
      );
    }

    // Extract captions for analysis
    const captions = posts.map((p) => p.caption).filter(Boolean);

    // Step 1: Detect influencer type
    const { type: influencerType, confidence } = await detectInfluencerType(
      profile.biography,
      captions
    );

    // Step 2: Generate persona
    const persona = await generatePersona(
      profile.biography,
      captions,
      influencerType
    );

    // Step 3: Analyze all posts for brands/coupons
    const postAnalysis = await analyzeAllPosts(posts);

    // Step 4: Extract content items based on type
    const contentItems: Partial<ContentItem>[] = [];
    const extractedProducts: Partial<Product>[] = [];
    const brandSet = new Set<string>();
    const couponSet = new Map<string, { code: string; brand: string }>();

    // Process each post's analysis
    for (const [shortcode, data] of postAnalysis) {
      // Collect brands
      data.brands.forEach((brand) => brandSet.add(brand));

      // Collect coupons
      data.coupons.forEach((coupon) => {
        couponSet.set(coupon.code, coupon);
      });

      // Collect products
      const post = posts.find((p) => p.shortCode === shortcode);
      data.products.forEach((product) => {
        extractedProducts.push({
          name: product.name,
          brand: data.brands[0] || '',
          link: product.link,
          image_url: post?.displayUrl,
          is_manual: false,
        });
      });
    }

    // Extract recipes for food influencers
    if (influencerType === 'food') {
      for (const post of posts.slice(0, 20)) {
        const recipe = await extractRecipeFromPost(post.caption);
        if (recipe) {
          contentItems.push({
            type: 'recipe',
            title: recipe.title,
            description: post.caption.slice(0, 200),
            content: {
              ingredients: recipe.ingredients,
              instructions: recipe.instructions,
            },
            image_url: post.displayUrl,
          });
        }
      }
    }

    // Convert coupon set to products
    for (const [code, coupon] of couponSet) {
      // Check if we already have this coupon as a product
      const exists = extractedProducts.some(
        (p) => p.coupon_code === code
      );
      if (!exists) {
        extractedProducts.push({
          name: `קופון ${coupon.brand}`,
          brand: coupon.brand,
          coupon_code: code,
          is_manual: false,
        });
      } else {
        // Add coupon code to existing product
        const product = extractedProducts.find(
          (p) => p.brand === coupon.brand && !p.coupon_code
        );
        if (product) {
          product.coupon_code = code;
        }
      }
    }

    // Get default theme for this type
    const theme = themePresets[influencerType];

    // Build context for assistant
    const context = buildContext(extractedProducts, contentItems);

    return NextResponse.json({
      success: true,
      influencerType,
      confidence,
      persona,
      theme,
      brands: Array.from(brandSet),
      products: extractedProducts,
      contentItems,
      context,
    });
  } catch (error) {
    console.error('Analyze API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}

// Build context string for assistant
function buildContext(
  products: Partial<Product>[],
  contentItems: Partial<ContentItem>[]
): string {
  let context = '';

  if (products.length > 0) {
    context += '## מוצרים וקופונים:\n';
    products.forEach((p) => {
      context += `- ${p.name}`;
      if (p.brand) context += ` (${p.brand})`;
      if (p.coupon_code) context += ` - קופון: ${p.coupon_code}`;
      if (p.link) context += ` - לינק: ${p.link}`;
      context += '\n';
    });
  }

  if (contentItems.length > 0) {
    context += '\n## תוכן:\n';
    contentItems.forEach((item) => {
      context += `### ${item.title}\n`;
      if (item.description) context += `${item.description}\n`;
      if (item.type === 'recipe' && item.content) {
        const recipe = item.content as { ingredients: string[]; instructions: string[] };
        if (recipe.ingredients) {
          context += `מרכיבים: ${recipe.ingredients.join(', ')}\n`;
        }
      }
      context += '\n';
    });
  }

  return context;
}

// Note: We no longer need a PUT endpoint to create assistants
// With Responses API, we build instructions dynamically during chat
// This endpoint is kept for backwards compatibility
export async function PUT(req: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Assistants are no longer needed with Responses API',
  });
}

