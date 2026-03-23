# 🎬 bestieAI Promo Video

סרטון שיווקי מקצועי שנבנה עם Remotion.

## 🚀 הרצה מהירה

```bash
# Preview (development)
npm start

# Render video
npm run build
```

## 📦 מבנה הסרטון

**Duration:** 17 שניות (510 frames @ 30fps)

### Scenes:

1. **Problem** (3s) - הבעיה: כאוס, עבודה ידנית
2. **Solution** (2.5s) - הפתרון: Influencer OS
3. **AI Magic** (3.5s) - AI Document Parsing
4. **Features Grid** (3s) - 6 יכולות מרכזיות
5. **Dashboard** (3s) - ממשק הניהול
6. **ROI** (2.5s) - 90% חיסכון
7. **CTA** (2.5s) - קריאה לפעולה

**Total:** ~17 seconds

## 🎨 עיצוב

### Colors:
- Problem: Red (#7f1d1d)
- Solution: Indigo (#1e1b4b)
- AI: Emerald (#064e3b)
- Features: Slate (#0f172a)
- Dashboard: Navy (#1e293b)
- CTA: Black (#000)

### Typography:
- Font: Heebo (Google Fonts)
- Weights: 300 (Light), 400 (Regular), 700 (Bold), 900 (Black)
- RTL Support: ✅

### Effects:
- Noise Background (subtle grain)
- Spring Animations (natural movement)
- 3D Transforms (depth)
- Smooth Transitions (slide, fade, wipe)

## 🔧 Customization

### Change duration:
`src/Root.tsx` → `durationInFrames: 510`

### Change text:
`src/scenes/Scene*.tsx` → Edit text content

### Change colors:
`NoiseBackground color="#..."` בכל סצנה

### Export settings:
`remotion.config.ts` → Image format, codec, etc.

## 📤 Export Options

```bash
# MP4 (default)
npm run build

# High quality
remotion render Video out/video.mp4 --codec h264 --crf 18

# For social media
remotion render Video out/video.mp4 --codec h264 --crf 23

# GIF
remotion render Video out/video.gif

# Image sequence
remotion render Video out/frames --sequence
```

## 🎯 רזולוציות שונות

### For Instagram (1:1):
```tsx
// src/Root.tsx
width={1080}
height={1080}
```

### For Stories (9:16):
```tsx
width={1080}
height={1920}
```

### For YouTube (16:9) - current:
```tsx
width={1920}
height={1080}
```

## 📊 Performance

- Render time: ~2-5 minutes (depends on hardware)
- File size: ~5-10 MB (h264, crf 23)
- Quality: Production-ready

## 🎵 Adding Music

1. הוסף קובץ מוזיקה ל-`public/music.mp3`
2. בקובץ `PromoVideo.tsx`:

```tsx
import { Audio, staticFile } from 'remotion';

// בתוך ה-<AbsoluteFill>:
<Audio src={staticFile('music.mp3')} volume={0.3} />
```

## 🚀 Next Steps

1. **Review:** `npm start` → בדוק את הסרטון
2. **Customize:** שנה צבעים/טקסט לפי צורך
3. **Render:** `npm run build`
4. **Upload:** YouTube, Instagram, Website

## 💡 Tips

- Preview מהיר: כנס ל-http://localhost:3000
- Render fast: השתמש ב-`--concurrency 4`
- קובץ קטן: העלה `--crf` ל-28
- איכות גבוהה: הורד `--crf` ל-15

---

**🎊 זהו! הסרטון מוכן!**
