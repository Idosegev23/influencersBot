/**
 * GET /widget-preview?accountId=xxx
 * Returns a minimal HTML page that loads the widget for live preview
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return new NextResponse('Missing accountId', { status: 400 });
  }

  const origin = req.nextUrl.origin;

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>תצוגה מקדימה — ווידג׳ט</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Heebo', system-ui, sans-serif;
      background: #f8f9fa;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .preview-hint {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.75);
      color: #fff;
      padding: 8px 20px;
      border-radius: 20px;
      font-size: 13px;
      z-index: 999;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="preview-hint">תצוגה מקדימה — לחצו על הבועה למטה</div>
  <script src="${origin}/widget.js" data-account-id="${accountId}"></script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
