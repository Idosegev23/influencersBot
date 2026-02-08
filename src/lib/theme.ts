import type { InfluencerTheme, InfluencerType } from '@/types';

// Default theme presets based on influencer type
export const themePresets: Record<InfluencerType, InfluencerTheme> = {
  food: {
    colors: {
      primary: '#ea580c',
      accent: '#f97316',
      background: '#fffbeb',
      text: '#1c1917',
      surface: '#ffffff',
      border: '#fed7aa',
    },
    fonts: {
      heading: 'Heebo',
      body: 'Heebo',
    },
    style: 'playful',
    darkMode: false,
  },
  fashion: {
    colors: {
      primary: '#171717',
      accent: '#a855f7',
      background: '#fafafa',
      text: '#0a0a0a',
      surface: '#ffffff',
      border: '#e5e5e5',
    },
    fonts: {
      heading: 'Playfair Display',
      body: 'Inter',
    },
    style: 'elegant',
    darkMode: false,
  },
  tech: {
    colors: {
      primary: '#2563eb',
      accent: '#3b82f6',
      background: '#0f172a',
      text: '#f8fafc',
      surface: '#1e293b',
      border: '#334155',
    },
    fonts: {
      heading: 'Space Grotesk',
      body: 'Inter',
    },
    style: 'minimal',
    darkMode: true,
  },
  lifestyle: {
    colors: {
      primary: '#6366f1',
      accent: '#818cf8',
      background: '#ffffff',
      text: '#111827',
      surface: '#f9fafb',
      border: '#e5e7eb',
    },
    fonts: {
      heading: 'Heebo',
      body: 'Heebo',
    },
    style: 'minimal',
    darkMode: false,
  },
  fitness: {
    colors: {
      primary: '#059669',
      accent: '#10b981',
      background: '#ffffff',
      text: '#0f172a',
      surface: '#f0fdf4',
      border: '#bbf7d0',
    },
    fonts: {
      heading: 'Oswald',
      body: 'Open Sans',
    },
    style: 'bold',
    darkMode: false,
  },
  beauty: {
    colors: {
      primary: '#db2777',
      accent: '#ec4899',
      background: '#fdf2f8',
      text: '#1f2937',
      surface: '#ffffff',
      border: '#fbcfe8',
    },
    fonts: {
      heading: 'Cormorant Garamond',
      body: 'Lato',
    },
    style: 'elegant',
    darkMode: false,
  },
  parenting: {
    colors: {
      primary: "#7c3aed",
      accent: "#a78bfa",
      background: "#faf5ff",
      text: "#1f2937",
      surface: "#ffffff",
      border: "#ddd6fe",
    },
    fonts: {
      heading: "Heebo",
      body: "Heebo",
    },
    style: "playful",
    darkMode: false,
  },
  travel: {
    colors: {
      primary: "#0891b2",
      accent: "#06b6d4",
      background: "#ecfeff",
      text: "#0f172a",
      surface: "#ffffff",
      border: "#a5f3fc",
    },
    fonts: {
      heading: "Heebo",
      body: "Heebo",
    },
    style: "playful",
    darkMode: false,
  },
  other: {
    colors: {
      primary: '#6366f1',
      accent: '#818cf8',
      background: '#ffffff',
      text: '#111827',
      surface: '#f9fafb',
      border: '#e5e7eb',
    },
    fonts: {
      heading: 'Heebo',
      body: 'Heebo',
    },
    style: 'minimal',
    darkMode: false,
  },
};

// Generate CSS variables from theme
export function generateThemeCSS(theme: InfluencerTheme): string {
  return `
    :root {
      --color-primary: ${theme.colors.primary};
      --color-accent: ${theme.colors.accent};
      --color-background: ${theme.colors.background};
      --color-text: ${theme.colors.text};
      --color-surface: ${theme.colors.surface};
      --color-border: ${theme.colors.border};
      --font-heading: '${theme.fonts.heading}', sans-serif;
      --font-body: '${theme.fonts.body}', sans-serif;
    }
  `;
}

// Apply theme to document
export function applyTheme(theme?: InfluencerTheme): void {
  if (typeof document === 'undefined') return;
  if (!theme || !theme.colors) {
    console.warn('Theme or colors undefined, skipping theme application');
    return;
  }

  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-accent', theme.colors.accent);
  root.style.setProperty('--color-background', theme.colors.background);
  root.style.setProperty('--color-text', theme.colors.text);
  root.style.setProperty('--color-surface', theme.colors.surface);
  root.style.setProperty('--color-border', theme.colors.border);
  
  if (theme.fonts) {
    root.style.setProperty('--font-heading', `'${theme.fonts.heading}', sans-serif`);
    root.style.setProperty('--font-body', `'${theme.fonts.body}', sans-serif`);
  }

  // Handle dark mode
  if (theme.darkMode) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

// Get Google Fonts URL for a theme
export function getGoogleFontsUrl(theme?: InfluencerTheme): string {
  if (!theme || !theme.fonts || !theme.fonts.heading || !theme.fonts.body) {
    // Return default fonts if theme is not available
    return 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Heebo:wght@400;500;600;700&display=swap';
  }
  
  const fonts = new Set([theme.fonts.heading, theme.fonts.body]);
  const fontsParam = Array.from(fonts)
    .map((font) => font.replace(/ /g, '+') + ':wght@400;500;600;700')
    .join('&family=');
  return `https://fonts.googleapis.com/css2?family=${fontsParam}&display=swap`;
}

// Extract dominant colors from an image (placeholder - would use a library in production)
export function extractColorsFromImage(_imageUrl: string): Promise<string[]> {
  // In production, use a library like colorthief or vibrant.js
  // For now, return default colors
  return Promise.resolve(['#6366f1', '#818cf8', '#c4b5fd']);
}

// Blend two colors
export function blendColors(color1: string, color2: string, ratio: number = 0.5): string {
  const hex = (c: number) => Math.round(c).toString(16).padStart(2, '0');
  
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  
  const r = r1 * ratio + r2 * (1 - ratio);
  const g = g1 * ratio + g2 * (1 - ratio);
  const b = b1 * ratio + b2 * (1 - ratio);
  
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// Check if color is dark
export function isColorDark(color: string): boolean {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// Generate contrasting text color
export function getContrastColor(backgroundColor: string): string {
  return isColorDark(backgroundColor) ? '#ffffff' : '#000000';
}









