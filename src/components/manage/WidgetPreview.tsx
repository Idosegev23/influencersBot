'use client';

// ============================================================================
// WidgetPreview
// ----------------------------------------------------------------------------
// A pure, non-interactive mock of the embedded chat widget's mobile welcome
// screen. Lives in the "מראה" (Appearance) card of /manage/[token] so the
// account owner can see how their edits (color, cover image, brand name,
// welcome message, tooltip, social links) will look on the real widget
// (public/widget.js → headerHtml/avatarHtml/socialRowHtml/showBubbleTooltip)
// without needing to open the live embed. No state, no fetch — every prop is
// defaulted so this can never crash on a half-filled form.
// ============================================================================

interface SocialLink {
  platform: string;
  url: string;
}

interface WidgetPreviewProps {
  primaryColor?: string;
  coverImage?: string;
  brandName?: string;
  welcomeMessage?: string;
  tooltip?: string;
  socialLinks?: SocialLink[];
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

// Simplified versions of the same glyphs public/widget.js draws in
// socialIconSvg(), so the preview reads as "the same icon" as production.
function SocialGlyph({ platform }: { platform: string }) {
  const p = (platform || '').toLowerCase();
  const common = { width: 14, height: 14, viewBox: '0 0 24 24' } as const;

  if (p === 'instagram') {
    return (
      <svg {...common} fill="currentColor" aria-hidden="true">
        <path d="M12 2.2c3.2 0 3.58 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.43.36 1.06.41 2.23.07 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.43.16-1.06.36-2.23.41-1.27.07-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.43-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.43-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zm0 4.86A4.94 4.94 0 1 0 16.94 12 4.94 4.94 0 0 0 12 7.06zm0 8.14A3.2 3.2 0 1 1 15.2 12 3.2 3.2 0 0 1 12 15.2zm5.13-8.34a1.15 1.15 0 1 0 1.15 1.15 1.15 1.15 0 0 0-1.15-1.15z" />
      </svg>
    );
  }
  if (p === 'facebook') {
    return (
      <svg {...common} fill="currentColor" aria-hidden="true">
        <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" />
      </svg>
    );
  }
  if (p === 'tiktok') {
    return (
      <svg {...common} fill="currentColor" aria-hidden="true">
        <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.27 0 .53.04.78.12V9.86a5.74 5.74 0 1 0 4.98 5.68V9.4a7.3 7.3 0 0 0 4.27 1.37V7.66a4.28 4.28 0 0 1-3.27-1.84z" />
      </svg>
    );
  }
  if (p === 'youtube') {
    return (
      <svg {...common} fill="currentColor" aria-hidden="true">
        <path d="M23 12s0-3.2-.4-4.74a2.5 2.5 0 0 0-1.77-1.77C19.3 5.3 12 5.3 12 5.3s-7.3 0-8.83.4A2.5 2.5 0 0 0 1.4 7.46 26 26 0 0 0 1 12a26 26 0 0 0 .4 4.54 2.5 2.5 0 0 0 1.77 1.77c1.53.4 8.83.4 8.83.4s7.3 0 8.83-.4a2.5 2.5 0 0 0 1.77-1.77C23 15.2 23 12 23 12zM9.75 15.5v-7l6 3.5z" />
      </svg>
    );
  }
  // "website" (or any unrecognized platform) — small globe, matching the
  // fallback glyph in socialIconSvg().
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
    </svg>
  );
}

// The brand avatar: the cover image if we have one (mirrors avatarHtml() in
// widget.js, which falls back to the cover image when there's no separate
// profile pic), else a colored circle with the brand's first initial.
function BrandAvatar({
  size,
  coverImage,
  initial,
  color,
  brandName,
}: {
  size: number;
  coverImage: string;
  initial: string;
  color: string;
  brandName: string;
}) {
  if (coverImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverImage}
        alt={brandName}
        className="w-full h-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="w-full h-full flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, backgroundColor: color, fontSize: Math.round(size * 0.42) }}
    >
      {initial}
    </div>
  );
}

export default function WidgetPreview({
  primaryColor,
  coverImage,
  brandName,
  welcomeMessage,
  tooltip,
  socialLinks,
}: WidgetPreviewProps) {
  // Defensive defaults — this component must render something sane no matter
  // how empty/half-filled the live form state is.
  const color = primaryColor && HEX_COLOR_RE.test(primaryColor.trim()) ? primaryColor.trim() : '#0c1013';
  const cover = typeof coverImage === 'string' ? coverImage.trim() : '';
  const name = (brandName || '').trim() || 'המותג שלך';
  const greeting = (welcomeMessage || '').trim() || 'שלום! איך אפשר לעזור? 😊';
  const tip = (tooltip || '').trim();
  const initial = (name.charAt(0) || '?').toUpperCase();
  const links = Array.isArray(socialLinks)
    ? socialLinks.filter((l): l is SocialLink => !!l && typeof l.url === 'string' && l.url.trim().length > 0 && !!l.platform)
    : [];

  return (
    <div dir="rtl" className="w-full max-w-[300px] mx-auto select-none">
      <div className="text-xs font-semibold text-[#655e51] mb-2 text-center">תצוגה מקדימה חיה</div>

      <div
        className="mx-auto rounded-[30px] border-[6px] border-[#1e1b15] bg-white overflow-hidden"
        style={{ width: 280, boxShadow: '0 20px 40px rgba(71, 71, 71, 0.18)' }}
      >
        {/* 1. Cover image band */}
        <div className="relative bg-[#faf2e9]" style={{ height: 120 }}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="w-full h-full object-cover" />
          ) : null}
          <div className="absolute top-2.5 left-3 flex items-center gap-1 bg-white/85 rounded-full px-2 py-0.5 text-[10px] text-[#15803d]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            מחובר עכשיו
          </div>
        </div>

        <div className="px-4 pb-4">
          {/* 2. Overlapping round logo, pulled up over the cover */}
          <div
            className="mx-auto rounded-full border-4 border-white overflow-hidden bg-[#faf2e9]"
            style={{ width: 72, height: 72, marginTop: -36, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}
          >
            <BrandAvatar size={72} coverImage={cover} initial={initial} color={color} brandName={name} />
          </div>

          {/* 3. Brand name */}
          <div className="text-center font-extrabold text-[#1e1b15] mt-2 text-[15px] truncate">{name}</div>

          {/* 4. Social icon row */}
          {links.length > 0 && (
            <div className="flex justify-center gap-2 mt-2 flex-wrap">
              {links.map((l, i) => (
                <div
                  key={`${l.platform}-${i}`}
                  className="w-7 h-7 rounded-full border border-[#e5e0d8] bg-white flex items-center justify-center text-[#1e1b15] flex-shrink-0"
                  title={l.platform}
                >
                  <SocialGlyph platform={l.platform} />
                </div>
              ))}
            </div>
          )}

          {/* 5. Greeting bubble */}
          <div className="mt-3 flex items-end gap-1.5">
            <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
              <BrandAvatar size={20} coverImage={cover} initial={initial} color={color} brandName={name} />
            </div>
            <div className="max-w-[85%] rounded-3xl px-3 py-2 text-[13px] leading-snug text-[#1e1b15] bg-[#f3f1ec] break-words">
              {greeting}
            </div>
          </div>
        </div>

        {/* 6. Launcher + tooltip */}
        <div className="border-t border-dashed border-[#e5e0d8] bg-[#faf9f6] px-4 py-4 flex flex-col items-end gap-2">
          {tip && (
            <div
              className="max-w-[220px] rounded-2xl px-3 py-2 text-[12px] leading-snug text-[#1e1b15] bg-white border border-[#e5e0d8]"
              style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
            >
              {tip}
            </div>
          )}
          <div
            className="rounded-full overflow-hidden flex-shrink-0"
            style={{ width: 56, height: 56, boxShadow: '0 4px 20px rgba(0,0,0,0.18)' }}
          >
            <BrandAvatar size={56} coverImage={cover} initial={initial} color={color} brandName={name} />
          </div>
        </div>
      </div>
    </div>
  );
}
