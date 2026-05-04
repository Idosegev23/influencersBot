import { useState, useEffect, useRef } from "react";

// ============================================================
// INFLUENCER BOT — Playful & Colorful Landing Page
// Bilingual (EN/HE) with RTL support
// Inspired by: Raycast glow effects, Linear animations,
// Mixpanel structure — with a bold, playful twist
// ============================================================

const TRANSLATIONS = {
  en: {
    dir: "ltr",
    nav: { features: "Features", pricing: "Pricing", testimonials: "Stories", faq: "FAQ", cta: "Get Started Free" },
    hero: {
      badge: "AI-Powered Influencer Management",
      title: "Manage Partnerships.",
      titleGradient: "Like Magic.",
      subtitle: "The all-in-one platform that helps influencers track partnerships, parse contracts with AI, chat with followers, and grow their brand — effortlessly.",
      cta1: "Start Free Trial",
      cta2: "Watch Demo",
    },
    logos: { title: "Trusted by creators and agencies worldwide" },
    features: {
      badge: "Superpowers",
      title: "Everything you need to",
      titleGradient: "level up",
      items: [
        { icon: "🤖", title: "AI Document Parser", desc: "Upload contracts, briefs & invoices — our AI extracts every detail in seconds. Supports Hebrew, English, Arabic & Russian.", color: "from-violet-500 to-purple-500" },
        { icon: "💬", title: "Smart Chatbot", desc: "Your personal AI assistant that knows your content, partnerships, and audience — and chats with your followers 24/7.", color: "from-pink-500 to-rose-500" },
        { icon: "📊", title: "Analytics Dashboard", desc: "Track audience growth, engagement rates, content performance and ROI — all in real-time with beautiful charts.", color: "from-amber-500 to-orange-500" },
        { icon: "🔔", title: "Smart Notifications", desc: "Never miss a deadline. Get alerts for upcoming deliverables, expiring contracts, and partnership milestones.", color: "from-emerald-500 to-teal-500" },
        { icon: "📸", title: "Instagram Insights", desc: "Deep-dive into your Instagram analytics. Track follower demographics, best posting times, and content trends.", color: "from-blue-500 to-cyan-500" },
        { icon: "🎯", title: "Coupon & ROI Tracking", desc: "Create unique coupon codes, track usage, and measure the real ROI of every partnership automatically.", color: "from-fuchsia-500 to-pink-500" },
      ],
    },
    stats: [
      { value: "10K+", label: "Partnerships Managed" },
      { value: "98%", label: "AI Accuracy" },
      { value: "3min", label: "Avg. Contract Parse" },
      { value: "24/7", label: "Chatbot Availability" },
    ],
    testimonials: {
      badge: "Love Letters",
      title: "Creators who",
      titleGradient: "love us",
      items: [
        { name: "Maya Cohen", role: "Fashion Influencer • 250K followers", text: "This platform literally changed how I manage my brand deals. The AI parser saves me hours every week!", avatar: "👩‍🎨" },
        { name: "Tom Levy", role: "Tech Reviewer • 180K followers", text: "The analytics dashboard is insane. I can finally show brands real ROI data from my campaigns.", avatar: "👨‍💻" },
        { name: "Noa Klein", role: "Food Blogger • 320K followers", text: "Having a chatbot that actually knows my recipes and partnerships? Game changer for engagement.", avatar: "👩‍🍳" },
      ],
    },
    pricing: {
      badge: "Simple Pricing",
      title: "Plans that",
      titleGradient: "grow with you",
      plans: [
        { name: "Starter", price: "$0", period: "/month", desc: "Perfect for getting started", features: ["1 Instagram account", "Basic analytics", "5 document parses/mo", "Community support"], cta: "Start Free", popular: false },
        { name: "Pro", price: "$29", period: "/month", desc: "For serious creators", features: ["3 Instagram accounts", "Advanced analytics & ROI", "Unlimited document parses", "AI Chatbot", "Priority support"], cta: "Start Pro Trial", popular: true },
        { name: "Agency", price: "$99", period: "/month", desc: "For teams & agencies", features: ["Unlimited accounts", "White-label chatbot", "Team collaboration", "API access", "Dedicated account manager"], cta: "Contact Sales", popular: false },
      ],
    },
    faq: {
      badge: "Got Questions?",
      title: "Frequently",
      titleGradient: "asked",
      items: [
        { q: "How does the AI document parser work?", a: "Upload any contract, brief, or invoice (PDF, Word, Excel, or image) and our multi-model AI chain (Gemini → Claude → GPT-4o) extracts all key details with 98% accuracy. You can review and edit before saving." },
        { q: "Is my data secure?", a: "Absolutely. We use Supabase with Row-Level Security, encrypted storage, and role-based access control. Your data is only accessible to you and your authorized team members." },
        { q: "Can the chatbot speak Hebrew?", a: "Yes! Our chatbot supports Hebrew, English, Arabic, and Russian. It uses your actual content and partnership data to provide accurate, personalized responses." },
        { q: "Do you support Instagram analytics?", a: "Yes, we provide deep Instagram analytics including follower growth, demographics, engagement rates, best posting times, and content performance tracking." },
      ],
    },
    footer: {
      cta: { title: "Ready to level up your creator game?", subtitle: "Join thousands of creators managing partnerships smarter.", button: "Get Started Free" },
      copyright: "© 2026 InfluencerBot. All rights reserved.",
      links: ["Privacy Policy", "Terms of Service", "Contact"],
    },
  },
  he: {
    dir: "rtl",
    nav: { features: "פיצ׳רים", pricing: "מחירים", testimonials: "סיפורים", faq: "שאלות", cta: "התחל בחינם" },
    hero: {
      badge: "ניהול משפיענים מונע AI",
      title: "נהל שיתופי פעולה.",
      titleGradient: "כמו קסם.",
      subtitle: "הפלטפורמה האולטימטיבית שעוזרת למשפיענים לנהל שת״פים, לנתח חוזים עם AI, לשוחח עם עוקבים ולצמוח — בלי מאמץ.",
      cta1: "התחל תקופת ניסיון",
      cta2: "צפה בדמו",
    },
    logos: { title: "יוצרים וסוכנויות מובילות סומכות עלינו" },
    features: {
      badge: "כוחות-על",
      title: "כל מה שצריך כדי",
      titleGradient: "לעלות רמה",
      items: [
        { icon: "🤖", title: "ניתוח מסמכים AI", desc: "העלו חוזים, בריפים וחשבוניות — ה-AI שלנו מחלץ כל פרט תוך שניות. תמיכה בעברית, אנגלית, ערבית ורוסית.", color: "from-violet-500 to-purple-500" },
        { icon: "💬", title: "צ׳אטבוט חכם", desc: "עוזר AI אישי שמכיר את התוכן, השת״פים והקהל שלכם — ומשוחח עם העוקבים 24/7.", color: "from-pink-500 to-rose-500" },
        { icon: "📊", title: "דשבורד אנליטיקס", desc: "עקבו אחר צמיחת קהל, מעורבות, ביצועי תוכן ו-ROI — הכל בזמן אמת עם גרפים מרהיבים.", color: "from-amber-500 to-orange-500" },
        { icon: "🔔", title: "התראות חכמות", desc: "לא מפספסים דדליין. קבלו התראות על משימות קרובות, חוזים שפגים ואבני דרך בשת״פים.", color: "from-emerald-500 to-teal-500" },
        { icon: "📸", title: "תובנות אינסטגרם", desc: "צללו לעומק האנליטיקס של האינסטגרם. עקבו אחר דמוגרפיית עוקבים, זמני פרסום מיטביים וטרנדים.", color: "from-blue-500 to-cyan-500" },
        { icon: "🎯", title: "מעקב קופונים ו-ROI", desc: "צרו קודי קופון ייחודיים, עקבו אחר שימוש ומדדו את ה-ROI האמיתי של כל שת״פ אוטומטית.", color: "from-fuchsia-500 to-pink-500" },
      ],
    },
    stats: [
      { value: "10K+", label: "שת״פים מנוהלים" },
      { value: "98%", label: "דיוק AI" },
      { value: "3 דק׳", label: "ניתוח חוזה ממוצע" },
      { value: "24/7", label: "זמינות צ׳אטבוט" },
    ],
    testimonials: {
      badge: "מכתבי אהבה",
      title: "יוצרים ש",
      titleGradient: "אוהבים אותנו",
      items: [
        { name: "מאיה כהן", role: "משפיענית אופנה • 250K עוקבים", text: "הפלטפורמה הזו שינתה לי את הדרך שבה אני מנהלת עסקאות. ה-AI Parser חוסך לי שעות כל שבוע!", avatar: "👩‍🎨" },
        { name: "תום לוי", role: "סוקר טכנולוגיה • 180K עוקבים", text: "הדשבורד אנליטיקס פשוט מטורף. סוף סוף אני יכול להראות למותגים נתוני ROI אמיתיים.", avatar: "👨‍💻" },
        { name: "נועה קליין", role: "בלוגרית אוכל • 320K עוקבים", text: "צ׳אטבוט שבאמת מכיר את המתכונים והשת״פים שלי? Game changer למעורבות.", avatar: "👩‍🍳" },
      ],
    },
    pricing: {
      badge: "תמחור פשוט",
      title: "תוכניות ש",
      titleGradient: "גדלות איתכם",
      plans: [
        { name: "סטארטר", price: "₪0", period: "/חודש", desc: "מושלם להתחלה", features: ["חשבון אינסטגרם אחד", "אנליטיקס בסיסי", "5 ניתוחי מסמכים/חודש", "תמיכה קהילתית"], cta: "התחל בחינם", popular: false },
        { name: "פרו", price: "₪99", period: "/חודש", desc: "ליוצרים רציניים", features: ["3 חשבונות אינסטגרם", "אנליטיקס מתקדם + ROI", "ניתוח מסמכים ללא הגבלה", "צ׳אטבוט AI", "תמיכה עדיפה"], cta: "התחל ניסיון פרו", popular: true },
        { name: "סוכנות", price: "₪349", period: "/חודש", desc: "לצוותים וסוכנויות", features: ["חשבונות ללא הגבלה", "צ׳אטבוט White-label", "שיתוף פעולה צוותי", "גישת API", "מנהל חשבון ייעודי"], cta: "צור קשר", popular: false },
      ],
    },
    faq: {
      badge: "יש שאלות?",
      title: "שאלות",
      titleGradient: "נפוצות",
      items: [
        { q: "איך עובד ניתוח המסמכים ב-AI?", a: "העלו כל חוזה, בריף או חשבונית (PDF, Word, Excel או תמונה) ושרשרת ה-AI המולטי-מודל שלנו (Gemini → Claude → GPT-4o) מחלצת את כל הפרטים המרכזיים בדיוק של 98%. ניתן לבדוק ולערוך לפני השמירה." },
        { q: "האם המידע שלי מאובטח?", a: "בהחלט. אנו משתמשים ב-Supabase עם Row-Level Security, אחסון מוצפן ובקרת גישה מבוססת תפקידים. המידע שלכם נגיש רק לכם ולחברי הצוות המורשים." },
        { q: "האם הצ׳אטבוט מדבר עברית?", a: "כן! הצ׳אטבוט שלנו תומך בעברית, אנגלית, ערבית ורוסית. הוא משתמש בתוכן ובנתוני השת״פים שלכם כדי לספק תשובות מדויקות ומותאמות אישית." },
        { q: "האם יש תמיכה באנליטיקס אינסטגרם?", a: "כן, אנו מספקים אנליטיקס אינסטגרם מעמיק כולל צמיחת עוקבים, דמוגרפיה, שיעורי מעורבות, זמני פרסום מיטביים ומעקב ביצועי תוכן." },
      ],
    },
    footer: {
      cta: { title: "מוכנים לעלות רמה?", subtitle: "הצטרפו לאלפי יוצרים שמנהלים שת״פים חכם יותר.", button: "התחל בחינם" },
      copyright: "© 2026 InfluencerBot. כל הזכויות שמורות.",
      links: ["מדיניות פרטיות", "תנאי שימוש", "צור קשר"],
    },
  },
};

// ─── Animated gradient orbs background ───────────────────────
function GradientOrbs() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      <div
        style={{
          position: "absolute", top: "-20%", left: "-10%", width: "50vw", height: "50vw",
          borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)",
          animation: "orbFloat1 20s ease-in-out infinite", filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute", top: "30%", right: "-15%", width: "45vw", height: "45vw",
          borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.2) 0%, transparent 70%)",
          animation: "orbFloat2 25s ease-in-out infinite", filter: "blur(80px)",
        }}
      />
      <div
        style={{
          position: "absolute", bottom: "-10%", left: "20%", width: "40vw", height: "40vw",
          borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 70%)",
          animation: "orbFloat3 22s ease-in-out infinite", filter: "blur(70px)",
        }}
      />
      <div
        style={{
          position: "absolute", top: "60%", right: "30%", width: "30vw", height: "30vw",
          borderRadius: "50%", background: "radial-gradient(circle, rgba(251,191,36,0.15) 0%, transparent 70%)",
          animation: "orbFloat1 18s ease-in-out infinite reverse", filter: "blur(60px)",
        }}
      />
    </div>
  );
}

// ─── Animated grid pattern ───────────────────────────────────
function GridPattern() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, opacity: 0.03 }}>
      <svg width="100%" height="100%">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

// ─── Scroll-reveal wrapper ───────────────────────────────────
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.7s cubic-bezier(.16,1,.3,1) ${delay}ms, transform 0.7s cubic-bezier(.16,1,.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Badge component ─────────────────────────────────────────
function Badge({ children }) {
  return (
    <span
      style={{
        display: "inline-block", padding: "6px 16px", borderRadius: "999px", fontSize: "13px",
        fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
        background: "rgba(168,85,247,0.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)",
        backdropFilter: "blur(8px)",
      }}
    >
      {children}
    </span>
  );
}

// ─── Section title ───────────────────────────────────────────
function SectionTitle({ text, gradient, center = true }) {
  return (
    <h2
      style={{
        fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, lineHeight: 1.1,
        textAlign: center ? "center" : undefined, color: "white",
      }}
    >
      {text}{" "}
      <span
        style={{
          background: "linear-gradient(135deg, #a855f7, #ec4899, #f59e0b)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}
      >
        {gradient}
      </span>
    </h2>
  );
}

// ─── Navbar ──────────────────────────────────────────────────
function Navbar({ t, lang, setLang }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h); return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <nav
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 24px",
        transition: "all 0.3s ease",
        background: scrolled ? "rgba(10,10,20,0.8)" : "transparent",
        backdropFilter: scrolled ? "blur(20px) saturate(1.5)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #a855f7, #ec4899)", fontSize: 18,
          }}>
            ✦
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: "white" }}>InfluencerBot</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {["features", "pricing", "testimonials", "faq"].map((s) => (
            <a key={s} href={`#${s}`}
              style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", fontSize: 14, fontWeight: 500, transition: "color 0.2s" }}
              onMouseEnter={(e) => (e.target.style.color = "white")}
              onMouseLeave={(e) => (e.target.style.color = "rgba(255,255,255,0.6)")}
            >
              {t.nav[s]}
            </a>
          ))}
          <button
            onClick={() => setLang(lang === "en" ? "he" : "en")}
            style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "6px 12px", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => (e.target.style.background = "rgba(255,255,255,0.15)")}
            onMouseLeave={(e) => (e.target.style.background = "rgba(255,255,255,0.08)")}
          >
            {lang === "en" ? "🇮🇱 עברית" : "🇺🇸 English"}
          </button>
          <a href="#pricing" style={{
            background: "linear-gradient(135deg, #a855f7, #ec4899)", color: "white", textDecoration: "none",
            padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, transition: "all 0.2s",
            boxShadow: "0 0 20px rgba(168,85,247,0.3)",
          }}
            onMouseEnter={(e) => (e.target.style.boxShadow = "0 0 30px rgba(168,85,247,0.5)")}
            onMouseLeave={(e) => (e.target.style.boxShadow = "0 0 20px rgba(168,85,247,0.3)")}
          >
            {t.nav.cta}
          </a>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero Section ────────────────────────────────────────────
function Hero({ t }) {
  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", maxWidth: 800, position: "relative", zIndex: 1 }}>
        <Reveal>
          <Badge>{t.hero.badge}</Badge>
        </Reveal>
        <Reveal delay={100}>
          <h1 style={{ fontSize: "clamp(2.8rem, 7vw, 5rem)", fontWeight: 900, lineHeight: 1.05, color: "white", margin: "24px 0 0" }}>
            {t.hero.title}
            <br />
            <span style={{
              background: "linear-gradient(135deg, #a855f7 0%, #ec4899 40%, #f59e0b 70%, #34d399 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              animation: "gradientShift 5s ease-in-out infinite",
              backgroundSize: "200% 200%",
            }}>
              {t.hero.titleGradient}
            </span>
          </h1>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)", color: "rgba(255,255,255,0.55)", maxWidth: 600, margin: "20px auto 0", lineHeight: 1.7 }}>
            {t.hero.subtitle}
          </p>
        </Reveal>
        <Reveal delay={300}>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 40, flexWrap: "wrap" }}>
            <button style={{
              background: "linear-gradient(135deg, #a855f7, #ec4899)", color: "white", border: "none",
              padding: "14px 32px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 0 40px rgba(168,85,247,0.4), 0 8px 32px rgba(0,0,0,0.3)",
              transition: "all 0.3s ease",
            }}
              onMouseEnter={(e) => { e.target.style.transform = "translateY(-2px)"; e.target.style.boxShadow = "0 0 60px rgba(168,85,247,0.5), 0 12px 40px rgba(0,0,0,0.3)"; }}
              onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 0 40px rgba(168,85,247,0.4), 0 8px 32px rgba(0,0,0,0.3)"; }}
            >
              {t.hero.cta1}
            </button>
            <button style={{
              background: "rgba(255,255,255,0.06)", color: "white",
              border: "1px solid rgba(255,255,255,0.12)", padding: "14px 32px", borderRadius: 12,
              fontSize: 16, fontWeight: 600, cursor: "pointer", transition: "all 0.3s ease",
              backdropFilter: "blur(8px)",
            }}
              onMouseEnter={(e) => { e.target.style.background = "rgba(255,255,255,0.1)"; e.target.style.borderColor = "rgba(255,255,255,0.25)"; }}
              onMouseLeave={(e) => { e.target.style.background = "rgba(255,255,255,0.06)"; e.target.style.borderColor = "rgba(255,255,255,0.12)"; }}
            >
              ▶ {t.hero.cta2}
            </button>
          </div>
        </Reveal>

        {/* Hero glow effect */}
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: "120%", height: "120%", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168,85,247,0.15) 0%, rgba(236,72,153,0.08) 40%, transparent 70%)",
          filter: "blur(40px)", pointerEvents: "none", zIndex: -1,
        }} />
      </div>
    </section>
  );
}

// ─── Logo strip ──────────────────────────────────────────────
function LogoStrip({ t }) {
  const logos = ["Instagram", "TikTok", "YouTube", "Spotify", "Pinterest", "Twitter"];
  return (
    <section style={{ padding: "40px 24px 80px", position: "relative", zIndex: 1 }}>
      <Reveal>
        <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 32 }}>
          {t.logos.title}
        </p>
      </Reveal>
      <div style={{ display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap", opacity: 0.3 }}>
        {logos.map((name, i) => (
          <Reveal key={name} delay={i * 80}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "white", letterSpacing: "0.05em" }}>{name}</span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ─── Features section ────────────────────────────────────────
function Features({ t }) {
  return (
    <section id="features" style={{ padding: "80px 24px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Reveal><div style={{ textAlign: "center" }}><Badge>{t.features.badge}</Badge></div></Reveal>
        <Reveal delay={100}>
          <SectionTitle text={t.features.title} gradient={t.features.titleGradient} />
        </Reveal>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 20, marginTop: 56,
        }}>
          {t.features.items.map((f, i) => (
            <Reveal key={i} delay={i * 100}>
              <div
                style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 20, padding: 32, transition: "all 0.4s cubic-bezier(.16,1,.3,1)",
                  cursor: "default", position: "relative", overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 20px 60px rgba(0,0,0,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ color: "white", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.7, fontSize: 15 }}>{f.desc}</p>
                {/* Card glow on hover */}
                <div style={{
                  position: "absolute", top: 0, right: 0, width: 150, height: 150,
                  background: `radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)`,
                  filter: "blur(30px)", pointerEvents: "none",
                }} />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Stats bar ───────────────────────────────────────────────
function Stats({ t }) {
  return (
    <section style={{ padding: "60px 24px", position: "relative", zIndex: 1 }}>
      <div style={{
        maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 24, padding: "48px 24px",
      }}>
        {t.stats.map((s, i) => (
          <Reveal key={i} delay={i * 100}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 900,
                background: "linear-gradient(135deg, #a855f7, #ec4899, #f59e0b)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>
                {s.value}
              </div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 4, fontWeight: 500 }}>{s.label}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ─── Testimonials ────────────────────────────────────────────
function Testimonials({ t }) {
  return (
    <section id="testimonials" style={{ padding: "80px 24px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Reveal><div style={{ textAlign: "center" }}><Badge>{t.testimonials.badge}</Badge></div></Reveal>
        <Reveal delay={100}>
          <SectionTitle text={t.testimonials.title} gradient={t.testimonials.titleGradient} />
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 56 }}>
          {t.testimonials.items.map((item, i) => (
            <Reveal key={i} delay={i * 120}>
              <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 20, padding: 32, transition: "all 0.3s ease",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.3)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              >
                <div style={{ fontSize: 24, marginBottom: 16, opacity: 0.3 }}>"</div>
                <p style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.8, fontSize: 15, marginBottom: 24 }}>{item.text}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(236,72,153,0.2))",
                    fontSize: 22,
                  }}>
                    {item.avatar}
                  </div>
                  <div>
                    <div style={{ color: "white", fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>{item.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ─────────────────────────────────────────────────
function Pricing({ t }) {
  return (
    <section id="pricing" style={{ padding: "80px 24px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Reveal><div style={{ textAlign: "center" }}><Badge>{t.pricing.badge}</Badge></div></Reveal>
        <Reveal delay={100}>
          <SectionTitle text={t.pricing.title} gradient={t.pricing.titleGradient} />
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginTop: 56 }}>
          {t.pricing.plans.map((plan, i) => (
            <Reveal key={i} delay={i * 120}>
              <div style={{
                background: plan.popular ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.03)",
                border: plan.popular ? "1px solid rgba(168,85,247,0.3)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 24, padding: 36, position: "relative", overflow: "hidden",
                transition: "all 0.3s ease",
                transform: plan.popular ? "scale(1.03)" : "none",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = plan.popular ? "scale(1.05)" : "scale(1.02)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = plan.popular ? "scale(1.03)" : "none"; }}
              >
                {plan.popular && (
                  <div style={{
                    position: "absolute", top: 16, right: 16, background: "linear-gradient(135deg, #a855f7, #ec4899)",
                    padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "white",
                  }}>
                    POPULAR
                  </div>
                )}
                <h3 style={{ color: "white", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{plan.name}</h3>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 24 }}>{plan.desc}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 24 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: "white" }}>{plan.price}</span>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 16 }}>{plan.period}</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {plan.features.map((f, j) => (
                    <li key={j} style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#a855f7", fontSize: 16 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button style={{
                  width: "100%", padding: "12px 0", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.3s ease",
                  background: plan.popular ? "linear-gradient(135deg, #a855f7, #ec4899)" : "rgba(255,255,255,0.08)",
                  color: "white",
                  boxShadow: plan.popular ? "0 0 30px rgba(168,85,247,0.3)" : "none",
                }}
                  onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; }}
                >
                  {plan.cta}
                </button>
                {plan.popular && (
                  <div style={{
                    position: "absolute", bottom: -50, left: "50%", transform: "translateX(-50%)",
                    width: "80%", height: 100, background: "radial-gradient(ellipse, rgba(168,85,247,0.15), transparent)",
                    filter: "blur(30px)", pointerEvents: "none",
                  }} />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────
function FAQ({ t }) {
  const [open, setOpen] = useState(null);
  return (
    <section id="faq" style={{ padding: "80px 24px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Reveal><div style={{ textAlign: "center" }}><Badge>{t.faq.badge}</Badge></div></Reveal>
        <Reveal delay={100}>
          <SectionTitle text={t.faq.title} gradient={t.faq.titleGradient} />
        </Reveal>
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", gap: 12 }}>
          {t.faq.items.map((item, i) => (
            <Reveal key={i} delay={i * 80}>
              <div
                style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 16, overflow: "hidden", transition: "all 0.3s ease",
                  borderColor: open === i ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.06)",
                }}
              >
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  style={{
                    width: "100%", padding: "20px 24px", background: "none", border: "none", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "start",
                  }}
                >
                  <span style={{ color: "white", fontSize: 16, fontWeight: 600 }}>{item.q}</span>
                  <span style={{
                    color: "#a855f7", fontSize: 20, transition: "transform 0.3s ease",
                    transform: open === i ? "rotate(45deg)" : "rotate(0deg)",
                  }}>
                    +
                  </span>
                </button>
                <div style={{
                  maxHeight: open === i ? 300 : 0, overflow: "hidden", transition: "max-height 0.4s cubic-bezier(.16,1,.3,1)",
                }}>
                  <p style={{ padding: "0 24px 20px", color: "rgba(255,255,255,0.5)", lineHeight: 1.8, fontSize: 15, margin: 0 }}>
                    {item.a}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Footer CTA + Footer ────────────────────────────────────
function Footer({ t }) {
  return (
    <footer style={{ padding: "40px 24px 60px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Reveal>
          <div style={{
            background: "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(236,72,153,0.08))",
            border: "1px solid rgba(168,85,247,0.15)", borderRadius: 32, padding: "64px 40px",
            textAlign: "center", position: "relative", overflow: "hidden",
          }}>
            <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 800, color: "white", marginBottom: 12 }}>
              {t.footer.cta.title}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 17, marginBottom: 32 }}>
              {t.footer.cta.subtitle}
            </p>
            <button style={{
              background: "linear-gradient(135deg, #a855f7, #ec4899)", color: "white", border: "none",
              padding: "16px 40px", borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 0 50px rgba(168,85,247,0.4)", transition: "all 0.3s ease",
            }}
              onMouseEnter={(e) => { e.target.style.boxShadow = "0 0 70px rgba(168,85,247,0.6)"; e.target.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.target.style.boxShadow = "0 0 50px rgba(168,85,247,0.4)"; e.target.style.transform = "translateY(0)"; }}
            >
              {t.footer.cta.button}
            </button>
            <div style={{
              position: "absolute", top: -40, right: -40, width: 200, height: 200,
              background: "radial-gradient(circle, rgba(236,72,153,0.15), transparent)",
              filter: "blur(50px)", pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute", bottom: -40, left: -40, width: 200, height: 200,
              background: "radial-gradient(circle, rgba(168,85,247,0.15), transparent)",
              filter: "blur(50px)", pointerEvents: "none",
            }} />
          </div>
        </Reveal>
        <div style={{ marginTop: 60, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>{t.footer.copyright}</span>
          <div style={{ display: "flex", gap: 24 }}>
            {t.footer.links.map((link) => (
              <a key={link} href="#" style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none", fontSize: 13, transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.target.style.color = "rgba(255,255,255,0.6)")}
                onMouseLeave={(e) => (e.target.style.color = "rgba(255,255,255,0.3)")}
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Global CSS Animations ───────────────────────────────────
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body { font-family: 'Inter', -apple-system, sans-serif; background: #07060b; color: white; overflow-x: hidden; }
      ::selection { background: rgba(168,85,247,0.3); }
      @keyframes orbFloat1 {
        0%, 100% { transform: translate(0, 0) scale(1); }
        33% { transform: translate(30px, -50px) scale(1.05); }
        66% { transform: translate(-20px, 30px) scale(0.95); }
      }
      @keyframes orbFloat2 {
        0%, 100% { transform: translate(0, 0) scale(1); }
        33% { transform: translate(-40px, 30px) scale(1.08); }
        66% { transform: translate(20px, -40px) scale(0.92); }
      }
      @keyframes orbFloat3 {
        0%, 100% { transform: translate(0, 0) scale(1); }
        33% { transform: translate(50px, 20px) scale(0.95); }
        66% { transform: translate(-30px, -30px) scale(1.05); }
      }
      @keyframes gradientShift {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
      @media (max-width: 768px) {
        nav > div > div:nth-child(2) > a:not(:last-child):not(:nth-last-child(2)) { display: none; }
        section > div { padding: 0 8px; }
      }
    `}</style>
  );
}

// ─── Main App ────────────────────────────────────────────────
export default function LandingPage() {
  const [lang, setLang] = useState("en");
  const t = TRANSLATIONS[lang];

  return (
    <div dir={t.dir} style={{ position: "relative", minHeight: "100vh" }}>
      <GlobalStyles />
      <GradientOrbs />
      <GridPattern />
      <Navbar t={t} lang={lang} setLang={setLang} />
      <Hero t={t} />
      <LogoStrip t={t} />
      <Features t={t} />
      <Stats t={t} />
      <Testimonials t={t} />
      <Pricing t={t} />
      <FAQ t={t} />
      <Footer t={t} />
    </div>
  );
}
