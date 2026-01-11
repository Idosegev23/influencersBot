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
        'Referer': 'https://www.instagram.com/',
      },
    });

    if (!response.ok) {
      // Return a placeholder image on error
      return NextResponse.redirect(new URL('/icons/icon.svg', req.url));
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 1 day
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    // Return redirect to placeholder on error
    return NextResponse.redirect(new URL('/icons/icon.svg', req.url));
  }
}





