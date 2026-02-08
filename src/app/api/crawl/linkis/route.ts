import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scrapeLinkisProfile } from '@/lib/scraping/linkis-scraper';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, url } = body;

    if (!accountId || !url) {
      return NextResponse.json(
        { error: 'accountId and url are required' },
        { status: 400 }
      );
    }

    console.log(`[Crawl Linkis] Starting crawl for: ${url}`);

    // Call custom linkis scraper
    const profile = await scrapeLinkisProfile(url);

    const supabase = await createClient();

    // Format content for storage
    const pageContent = `
Linkis Profile: ${profile.name}
Bio: ${profile.bio}
${profile.isVerified ? 'Verified Profile ✓' : ''}

Social Links:
${profile.socialLinks.instagram ? `Instagram: ${profile.socialLinks.instagram}` : ''}
${profile.socialLinks.facebook ? `Facebook: ${profile.socialLinks.facebook}` : ''}
${profile.socialLinks.tiktok ? `TikTok: ${profile.socialLinks.tiktok}` : ''}
${profile.socialLinks.youtube ? `YouTube: ${profile.socialLinks.youtube}` : ''}

Links (${profile.links.length}):
${profile.links.map((link, i) => `${i + 1}. ${link.title} - ${link.url}`).join('\n')}

Coupons (${profile.coupons.length}):
${profile.coupons.map((coupon, i) => `${i + 1}. ${coupon.brand} - ${coupon.description}${coupon.code ? ` [${coupon.code}]` : ''}`).join('\n')}
    `.trim();

    // Save as website page
    const { error: saveError } = await supabase
      .from('instagram_bio_websites')
      .upsert(
        {
          account_id: accountId,
          url: url,
          page_title: `Linkis - ${profile.name}`,
          page_description: profile.bio,
          page_content: pageContent,
          scraped_at: new Date().toISOString(),
        },
        {
          onConflict: 'account_id,url',
        }
      );

    if (saveError) {
      console.error('[Crawl Linkis] Error saving to database:', saveError);
      return NextResponse.json(
        { error: 'Failed to save linkis data', details: saveError.message },
        { status: 500 }
      );
    }

    // Also save raw JSON
    await supabase.from('influencer_raw_data').insert({
      account_id: accountId,
      data_type: 'website',
      raw_json: profile,
      source_actor: 'linkis-scraper',
    });

    console.log(`[Crawl Linkis] Successfully crawled linkis profile`);

    return NextResponse.json({
      success: true,
      profile: {
        name: profile.name,
        bio: profile.bio,
        isVerified: profile.isVerified,
        linksCount: profile.links.length,
        couponsCount: profile.coupons.length,
        links: profile.links,
        coupons: profile.coupons,
      },
    });
  } catch (error: any) {
    console.error('[Crawl Linkis] Error:', error);
    return NextResponse.json(
      { error: 'Failed to crawl linkis', details: error.message },
      { status: 500 }
    );
  }
}
