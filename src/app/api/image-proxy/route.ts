import { NextRequest, NextResponse } from 'next/server';

const INSTAGRAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.instagram.com/',
  'Origin': 'https://www.instagram.com',
  'Sec-Fetch-Dest': 'image',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'cross-site',
};

function placeholderSvg(char = '?') {
  return `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="14" fill="#f4f5f7"/>
    <text x="50" y="50" font-family="Arial" font-size="32" fill="#9CA3AF" text-anchor="middle" dominant-baseline="middle">${char}</text>
  </svg>`;
}

/**
 * Fetch image from a direct CDN URL
 */
async function fetchFromUrl(imageUrl: string): Promise<Response | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: INSTAGRAM_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return response;
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch image via Instagram's shortcode media endpoint (always fresh)
 */
async function fetchFromShortcode(shortcode: string): Promise<Response | null> {
  try {
    // Instagram's /media/ endpoint redirects to the current CDN URL
    const mediaUrl = `https://www.instagram.com/p/${shortcode}/media/?size=m`;
    const response = await fetch(mediaUrl, {
      headers: {
        ...INSTAGRAM_HEADERS,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return response;
    return null;
  } catch {
    return null;
  }
}

// Proxy for Instagram images to bypass CORS/403 restrictions
// Supports: ?url=<cdn_url> and/or ?shortcode=<ig_shortcode> (fallback chain)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');
    const shortcode = searchParams.get('shortcode');

    if (!imageUrl && !shortcode) {
      return NextResponse.json({ error: 'URL or shortcode required' }, { status: 400 });
    }

    // Validate URL domain if provided
    if (imageUrl) {
      const allowedDomains = ['instagram.com', 'cdninstagram.com', 'fbcdn.net', 'scontent'];
      const isAllowed = allowedDomains.some(domain => imageUrl.includes(domain));
      if (!isAllowed) {
        return NextResponse.json({ error: 'Invalid image domain' }, { status: 400 });
      }
    }

    // Validate shortcode format
    if (shortcode && !/^[A-Za-z0-9_-]{6,20}$/.test(shortcode)) {
      return NextResponse.json({ error: 'Invalid shortcode' }, { status: 400 });
    }

    // Try fetching: first CDN URL, then shortcode fallback
    let response: Response | null = null;

    if (imageUrl) {
      response = await fetchFromUrl(imageUrl);
    }

    if (!response && shortcode) {
      response = await fetchFromShortcode(shortcode);
    }

    if (!response) {
      return new NextResponse(placeholderSvg('?'), {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error: any) {
    console.error('[Image Proxy] Error:', error.message || error);

    return new NextResponse(placeholderSvg('!'), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }
}





