/**
 * Linkis.co.il Scraper
 * מיוחד לסריקת אתרי linkis של משפיענים
 */

import * as cheerio from 'cheerio';

export interface LinkisLink {
  id: string;
  title: string;
  url: string;
  imageUrl?: string;
  category?: string;
}

export interface LinkisCoupon {
  brand: string;
  code?: string;
  description: string;
  url?: string;
}

export interface LinkisProfile {
  name: string;
  bio?: string;
  profileImage?: string;
  isVerified: boolean;
  socialLinks: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    youtube?: string;
  };
  links: LinkisLink[];
  coupons: LinkisCoupon[];
}

/**
 * סריקת פרופיל linkis
 */
export async function scrapeLinkisProfile(profileUrl: string): Promise<LinkisProfile> {
  console.log(`[Linkis Scraper] Fetching: ${profileUrl}`);

  const response = await fetch(profileUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch linkis profile: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract profile info
  const name = $('h1').first().text().trim();
  const bio = $('h1').first().next('.text-sm').text().trim();
  const profileImage = $('img.profile-image').attr('src');
  const isVerified = $('i.ri-verified-badge-fill').length > 0;

  // Extract social links
  const socialLinks: LinkisProfile['socialLinks'] = {};
  $('a[href*="instagram.com"]').each((_, el) => {
    socialLinks.instagram = $(el).attr('href');
  });
  $('a[href*="facebook.com"]').each((_, el) => {
    socialLinks.facebook = $(el).attr('href');
  });
  $('a[href*="tiktok.com"]').each((_, el) => {
    socialLinks.tiktok = $(el).attr('href');
  });
  $('a[href*="youtube.com"]').each((_, el) => {
    socialLinks.youtube = $(el).attr('href');
  });

  // Extract links
  const links: LinkisLink[] = [];
  $('.link-button').each((_, el) => {
    const $link = $(el);
    const href = $link.attr('href');
    const title = $link.find('span.truncate').text().trim();
    const imageUrl = $link.find('img').attr('src');

    if (href && title) {
      const idMatch = href.match(/id=(\d+)/);
      const id = idMatch ? idMatch[1] : '';
      links.push({
        id,
        title,
        url: href.startsWith('http') ? href : `${new URL(profileUrl).origin}/${href}`,
        imageUrl: imageUrl ? (imageUrl.startsWith('http') ? imageUrl : `${new URL(profileUrl).origin}/${imageUrl}`) : undefined,
      });
    }
  });

  // Extract coupons
  const coupons: LinkisCoupon[] = [];
  $('.coupon-card').each((_, el) => {
    const $coupon = $(el);
    
    // Brand name is in h4
    const brand = $coupon.find('h4').first().text().trim();
    
    // Discount amount is in .amount-coupon
    const discount = $coupon.find('.amount-coupon').text().trim();
    
    // URL is in the link button
    const url = $coupon.find('a.buy-btn, a.copy-btn, a').attr('href');
    
    // Button text might have "קוד" or other info
    const buttonText = $coupon.find('button, a').text().trim();
    
    if (brand) {
      coupons.push({
        brand: brand,
        code: undefined, // linkis doesn't show codes directly
        description: discount || buttonText || 'קופון',
        url: url ? (url.startsWith('http') ? url : `${new URL(profileUrl).origin}/${url}`) : undefined,
      });
    }
  });

  return {
    name,
    bio,
    profileImage: profileImage ? (profileImage.startsWith('http') ? profileImage : `${new URL(profileUrl).origin}/${profileImage}`) : undefined,
    isVerified,
    socialLinks,
    links,
    coupons,
  };
}
