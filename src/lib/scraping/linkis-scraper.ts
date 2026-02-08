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

  // Extract coupons - improved to get actual codes
  const coupons: LinkisCoupon[] = [];
  
  // Look for all coupon containers (various selectors)
  const couponSelectors = ['.coupon-card', '.coupon-item', '[class*="coupon"]', '.discount-card'];
  
  couponSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $coupon = $(el);
      
      // Try multiple ways to get brand name
      const brand = $coupon.find('h4, h3, .brand-name, [class*="brand"]').first().text().trim();
      
      // Try to find actual coupon code
      let code: string | undefined;
      const codePatterns = [
        $coupon.find('[data-code]').attr('data-code'),
        $coupon.find('.coupon-code, .code, [class*="code"]').text().trim(),
        $coupon.find('input[type="text"]').val() as string,
        $coupon.find('span').filter((_, span) => {
          const text = $(span).text().trim();
          return /^[A-Z0-9]{4,20}$/i.test(text);
        }).first().text().trim(),
      ];
      
      for (const pattern of codePatterns) {
        if (pattern && pattern.length >= 4 && pattern.length <= 20) {
          code = pattern;
          break;
        }
      }
      
      // Get discount/description
      let discount = $coupon.find('.amount-coupon, .discount, [class*="discount"], [class*="amount"]').text().trim();
      
      // If no specific discount found, look for percentage in text
      if (!discount) {
        const allText = $coupon.text();
        const percentMatch = allText.match(/(\d+)%/);
        if (percentMatch) {
          discount = `${percentMatch[1]}% הנחה`;
        }
      }
      
      // Get URL
      const url = $coupon.find('a[href]').attr('href');
      
      // Button text as fallback
      const buttonText = $coupon.find('button, a.btn').text().trim();
      
      // Only add if we have a brand and some useful info
      if (brand && brand.length > 2) {
        const existingCoupon = coupons.find(c => c.brand === brand);
        if (!existingCoupon) {
          coupons.push({
            brand: brand,
            code: code || undefined,
            description: discount || buttonText || 'קופון זמין',
            url: url ? (url.startsWith('http') ? url : `${new URL(profileUrl).origin}${url.startsWith('/') ? '' : '/'}${url}`) : undefined,
          });
        }
      }
    });
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
