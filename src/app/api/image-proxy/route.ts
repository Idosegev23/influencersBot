import { NextRequest, NextResponse } from 'next/server';

// Proxy for Instagram images to bypass CORS/403 restrictions
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    // Validate that the URL is from Instagram/Facebook CDN
    const allowedDomains = [
      'instagram.com',
      'cdninstagram.com',
      'fbcdn.net',
      'scontent',
    ];

    const isAllowed = allowedDomains.some(domain => imageUrl.includes(domain));
    if (!isAllowed) {
      return NextResponse.json({ error: 'Invalid image domain' }, { status: 400 });
    }

    // Fetch the image with appropriate headers
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      },
      // Add timeout
      signal: AbortSignal.timeout(10000), // 10 seconds
    });

    if (!response.ok) {
      console.error(`[Image Proxy] Failed to fetch: ${response.status} ${response.statusText} for ${imageUrl.substring(0, 100)}...`);
      
      // Return a placeholder SVG instead of redirect
      const placeholderSvg = `
        <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="#374151"/>
          <text x="50" y="50" font-family="Arial" font-size="40" fill="#9CA3AF" text-anchor="middle" dominant-baseline="middle">?</text>
        </svg>
      `;
      
      return new NextResponse(placeholderSvg, {
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
        'Cache-Control': 'public, max-age=86400', // Cache for 1 day
      },
    });
  } catch (error: any) {
    console.error('[Image Proxy] Error:', error.message || error);
    
    // Return a placeholder SVG on error
    const placeholderSvg = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#374151"/>
        <text x="50" y="50" font-family="Arial" font-size="40" fill="#9CA3AF" text-anchor="middle" dominant-baseline="middle">!</text>
      </svg>
    `;
    
    return new NextResponse(placeholderSvg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=300', // 5 minutes for errors
      },
    });
  }
}





