import { useState } from "react";
import {
  Flame,
  TrendingUp,
  Eye,
  Clock,
  ChevronLeft,
  MessageCircle,
  Zap,
  AlertCircle,
  Play,
  Hash,
  ArrowUpRight,
  ThermometerSun,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// "מה חם" — What's Hot Tab Design Mockup
// Design System: Glassmorphism + Pastel Pills + RTL Hebrew
// ═══════════════════════════════════════════════════════════════

// ─── Mock Data ───────────────────────────────────────────────

const BREAKING_TOPIC = {
  id: "t1",
  name: "אייל גולן מודיע על פרישה מהמוזיקה",
  status: "breaking",
  heat_score: 98,
  summary:
    "הזמר אייל גולן הפתיע את כולם עם הודעה דרמטית על פרישה מעולם המוזיקה. לפי מקורות קרובים, מדובר בהחלטה סופית לאחר 25 שנות קריירה.",
  tags: ["אייל גולן", "מוזיקה", "פרישה"],
  channels_covered: 14,
  updated_at: "לפני 12 דקות",
};

const HOT_TOPICS = [
  {
    id: "t2",
    name: "עונה חדשה של ״הישרדות״ — הקאסט נחשף",
    status: "hot",
    heat_score: 87,
    tags: ["הישרדות", "ריאליטי"],
    channels_covered: 9,
    updated_at: "לפני שעה",
  },
  {
    id: "t3",
    name: "נועה קירל תופיע באירוויזיון 2027?",
    status: "hot",
    heat_score: 82,
    tags: ["נועה קירל", "אירוויזיון"],
    channels_covered: 7,
    updated_at: "לפני 2 שעות",
  },
  {
    id: "t4",
    name: "פרשת העוקבים המזויפים — משפיענים נתפסו",
    status: "hot",
    heat_score: 76,
    tags: ["משפיענים", "שערורייה"],
    channels_covered: 11,
    updated_at: "לפני 3 שעות",
  },
  {
    id: "t5",
    name: "סדרת נטפליקס ישראלית חדשה בהפקה",
    status: "cooling",
    heat_score: 61,
    tags: ["נטפליקס", "סדרות"],
    channels_covered: 5,
    updated_at: "לפני 5 שעות",
  },
  {
    id: "t6",
    name: "שירה איסקוב ועומרי בן נתן נפרדו",
    status: "cooling",
    heat_score: 54,
    tags: ["זוגיות", "סלבריטאים"],
    channels_covered: 8,
    updated_at: "לפני 6 שעות",
  },
];

const RECENT_POSTS = [
  {
    id: "p1",
    caption: "הבלעדי: אייל גולן בראיון אחרון לפני הפרישה 🎤",
    posted_at: "לפני 2 שעות",
    views: 124500,
    likes: 8700,
    type: "reel",
  },
  {
    id: "p2",
    caption: "סיכום שבועי — כל מה שקרה בעולם הבידור 🔥",
    posted_at: "לפני 8 שעות",
    views: 89200,
    likes: 5400,
    type: "reel",
  },
  {
    id: "p3",
    caption: "מאחורי הקלעים של העונה החדשה של הישרדות",
    posted_at: "לפני יום",
    views: 67800,
    likes: 4100,
    type: "reel",
  },
  {
    id: "p4",
    caption: "תגובות הרשת לפרשת העוקבים — ריכזנו הכל",
    posted_at: "אתמול",
    views: 51300,
    likes: 3200,
    type: "reel",
  },
];

const TICKER_ITEMS = [
  "🔴 אייל גולן מודיע על פרישה מהמוזיקה",
  "⚡ הקאסט של הישרדות 2027 נחשף",
  "🎵 נועה קירל בדרך לאירוויזיון?",
  "📺 נטפליקס מפיקה סדרה ישראלית חדשה",
  "💔 שירה איסקוב ועומרי בן נתן נפרדו",
  "🔥 פרשת העוקבים המזויפים מתרחבת",
];

// ─── Utility Components ─────────────────────────────────────

function formatViews(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function HeatBar({ score, size = "md" }) {
  const height = size === "sm" ? "4px" : "6px";
  const color =
    score >= 85
      ? "linear-gradient(90deg, #ef4444, #f97316)"
      : score >= 65
      ? "linear-gradient(90deg, #f97316, #eab308)"
      : "linear-gradient(90deg, #eab308, #22c55e)";

  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: "99px",
        background: "rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${score}%`,
          height: "100%",
          borderRadius: "99px",
          background: color,
          transition: "width 1s ease",
        }}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    breaking: {
      label: "BREAKING",
      bg: "rgba(239,68,68,0.15)",
      color: "#ef4444",
      border: "rgba(239,68,68,0.3)",
      pulse: true,
    },
    hot: {
      label: "חם",
      bg: "rgba(249,115,22,0.12)",
      color: "#f97316",
      border: "rgba(249,115,22,0.25)",
      pulse: false,
    },
    cooling: {
      label: "מתקרר",
      bg: "rgba(34,197,94,0.1)",
      color: "#22c55e",
      border: "rgba(34,197,94,0.2)",
      pulse: false,
    },
  };
  const c = config[status] || config.hot;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 10px",
        borderRadius: "99px",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: status === "breaking" ? "0.5px" : "0",
        color: c.color,
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      {c.pulse && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: c.color,
            animation: "pulse-dot 1.5s ease infinite",
          }}
        />
      )}
      {c.label}
    </span>
  );
}

function TagPill({ tag }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "8px",
        fontSize: "11px",
        fontWeight: 500,
        background: "rgba(147,52,235,0.08)",
        color: "rgba(147,52,235,0.8)",
        border: "1px solid rgba(147,52,235,0.12)",
      }}
    >
      {tag}
    </span>
  );
}

// ─── Section: Ticker ─────────────────────────────────────────

function NewsTicker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div
      style={{
        width: "100%",
        overflow: "hidden",
        background: "rgba(239,68,68,0.06)",
        borderBottom: "1px solid rgba(239,68,68,0.12)",
        padding: "8px 0",
        direction: "ltr",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "48px",
          whiteSpace: "nowrap",
          animation: "ticker-scroll 35s linear infinite",
          width: "max-content",
        }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--dash-text, #1a1a2e)",
              cursor: "pointer",
              direction: "rtl",
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Breaking Card ──────────────────────────────────

function BreakingCard({ topic, onOpenChat }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onOpenChat(topic)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: "20px",
        padding: "24px",
        cursor: "pointer",
        overflow: "hidden",
        background: hovered
          ? "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(249,115,22,0.08))"
          : "linear-gradient(135deg, rgba(239,68,68,0.06), rgba(249,115,22,0.04))",
        border: "1px solid rgba(239,68,68,0.2)",
        backdropFilter: "blur(20px)",
        transition: "all 0.3s ease",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered
          ? "0 8px 32px rgba(239,68,68,0.12)"
          : "0 2px 12px rgba(0,0,0,0.04)",
      }}
    >
      {/* Glow accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "120px",
          height: "120px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239,68,68,0.12), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <StatusBadge status="breaking" />
        <span style={{ fontSize: "11px", color: "var(--dash-text-3, #9194a8)" }}>
          {topic.updated_at}
        </span>
      </div>

      <h2
        style={{
          fontSize: "20px",
          fontWeight: 700,
          lineHeight: 1.4,
          color: "var(--dash-text, #1a1a2e)",
          marginBottom: "10px",
        }}
      >
        {topic.name}
      </h2>

      <p
        style={{
          fontSize: "14px",
          lineHeight: 1.7,
          color: "var(--dash-text-2, #555770)",
          marginBottom: "16px",
        }}
      >
        {topic.summary}
      </p>

      <div style={{ marginBottom: "14px" }}>
        <HeatBar score={topic.heat_score} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {topic.tags.map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "12px",
            color: "var(--dash-text-3, #9194a8)",
          }}
        >
          <Hash style={{ width: "13px", height: "13px" }} />
          <span>{topic.channels_covered} ערוצים כיסו</span>
        </div>
      </div>

      {/* CTA hint */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "16px",
          paddingTop: "14px",
          borderTop: "1px solid rgba(239,68,68,0.1)",
          fontSize: "13px",
          fontWeight: 600,
          color: "#ef4444",
          opacity: hovered ? 1 : 0.6,
          transition: "opacity 0.3s",
        }}
      >
        <MessageCircle style={{ width: "14px", height: "14px" }} />
        <span>לחצו לשיחה עם הבוט על הנושא</span>
        <ChevronLeft style={{ width: "14px", height: "14px" }} />
      </div>
    </div>
  );
}

// ─── Section: Hot Topics List ────────────────────────────────

function TopicRow({ topic, rank, onOpenChat }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onOpenChat(topic)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 16px",
        borderRadius: "16px",
        cursor: "pointer",
        background: hovered ? "var(--dash-surface-hover, rgba(147,52,235,0.04))" : "transparent",
        transition: "all 0.2s ease",
        transform: hovered ? "translateX(-2px)" : "none",
      }}
    >
      {/* Rank */}
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "13px",
          fontWeight: 700,
          flexShrink: 0,
          background:
            rank <= 2
              ? "rgba(249,115,22,0.1)"
              : "rgba(147,52,235,0.06)",
          color:
            rank <= 2 ? "#f97316" : "var(--dash-text-2, #555770)",
        }}
      >
        {rank}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--dash-text, #1a1a2e)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {topic.name}
          </span>
          <StatusBadge status={topic.status} />
        </div>
        <HeatBar score={topic.heat_score} size="sm" />
      </div>

      {/* Meta */}
      <div
        style={{
          textAlign: "left",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "4px",
        }}
      >
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: topic.heat_score >= 80 ? "#f97316" : "var(--dash-text-2, #555770)",
          }}
        >
          {topic.heat_score}
        </span>
        <span style={{ fontSize: "10px", color: "var(--dash-text-3, #9194a8)" }}>
          {topic.channels_covered} ערוצים
        </span>
      </div>
    </div>
  );
}

function HotTopicsList({ topics, onOpenChat }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
          padding: "0 4px",
        }}
      >
        <TrendingUp style={{ width: "18px", height: "18px", color: "#f97316" }} />
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--dash-text, #1a1a2e)",
          }}
        >
          נושאים חמים
        </h3>
        <span
          style={{
            fontSize: "12px",
            color: "var(--dash-text-3, #9194a8)",
            marginRight: "auto",
          }}
        >
          מדורג לפי חום
        </span>
      </div>

      <div
        style={{
          borderRadius: "20px",
          background: "var(--dash-surface, rgba(255,255,255,0.72))",
          backdropFilter: "blur(20px) saturate(1.4)",
          border: "1px solid var(--dash-glass-border, rgba(255,255,255,0.5))",
          overflow: "hidden",
        }}
      >
        {topics.map((topic, i) => (
          <div key={topic.id}>
            <TopicRow topic={topic} rank={i + 1} onOpenChat={onOpenChat} />
            {i < topics.length - 1 && (
              <div
                style={{
                  height: "1px",
                  background: "var(--dash-glass-border, rgba(0,0,0,0.06))",
                  margin: "0 16px",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Recent Posts ───────────────────────────────────

function PostCard({ post, onOpenChat }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onOpenChat(post)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: "16px",
        padding: "16px",
        cursor: "pointer",
        background: "var(--dash-surface, rgba(255,255,255,0.72))",
        backdropFilter: "blur(20px) saturate(1.4)",
        border: "1px solid var(--dash-glass-border, rgba(255,255,255,0.5))",
        transition: "all 0.3s ease",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered
          ? "0 8px 24px rgba(0,0,0,0.08)"
          : "0 1px 4px rgba(0,0,0,0.02)",
      }}
    >
      {/* Type badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 8px",
            borderRadius: "8px",
            fontSize: "11px",
            fontWeight: 600,
            background: "rgba(147,52,235,0.08)",
            color: "rgba(147,52,235,0.8)",
          }}
        >
          <Play style={{ width: "10px", height: "10px" }} />
          Reel
        </div>
        <span style={{ fontSize: "11px", color: "var(--dash-text-3, #9194a8)" }}>
          {post.posted_at}
        </span>
      </div>

      {/* Caption */}
      <p
        style={{
          fontSize: "13px",
          fontWeight: 500,
          lineHeight: 1.6,
          color: "var(--dash-text, #1a1a2e)",
          marginBottom: "12px",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {post.caption}
      </p>

      {/* Stats */}
      <div style={{ display: "flex", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Eye style={{ width: "13px", height: "13px", color: "var(--dash-text-3, #9194a8)" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--dash-text-2, #555770)" }}>
            {formatViews(post.views)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Flame style={{ width: "13px", height: "13px", color: "#ef4444" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--dash-text-2, #555770)" }}>
            {formatViews(post.likes)}
          </span>
        </div>
      </div>
    </div>
  );
}

function RecentPosts({ posts, onOpenChat }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
          padding: "0 4px",
        }}
      >
        <Play style={{ width: "18px", height: "18px", color: "var(--color-primary, #9334EB)" }} />
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--dash-text, #1a1a2e)",
          }}
        >
          פוסטים אחרונים
        </h3>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "12px",
        }}
      >
        {posts.map((post) => (
          <PostCard key={post.id} post={post} onOpenChat={onOpenChat} />
        ))}
      </div>
    </div>
  );
}

// ─── Toast / Click Feedback ──────────────────────────────────

function ChatRedirectToast({ item, onClose }) {
  if (!item) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "100px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        background: "#0c1013",
        color: "white",
        padding: "14px 24px",
        borderRadius: "16px",
        fontSize: "14px",
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
        animation: "toast-in 0.3s ease",
        direction: "rtl",
        maxWidth: "90vw",
      }}
    >
      <MessageCircle style={{ width: "18px", height: "18px", color: "#9334EB", flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        עובר לצ׳אט: {item.name || item.caption}
      </span>
      <ArrowUpRight style={{ width: "16px", height: "16px", opacity: 0.5, flexShrink: 0 }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function WhatsHotDesign() {
  const [selectedItem, setSelectedItem] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  const handleOpenChat = (item) => {
    setSelectedItem(item);
    setTimeout(() => setSelectedItem(null), 2500);
    // In real app: router.push(`/chat/${username}?context=${item.id}&type=topic`)
  };

  const bg = darkMode ? "#07070d" : "#f0f0f5";
  const surface = darkMode ? "rgba(255,255,255,0.028)" : "rgba(255,255,255,0.72)";
  const text = darkMode ? "#ede9f8" : "#1a1a2e";
  const text2 = darkMode ? "#8b8da0" : "#555770";
  const text3 = darkMode ? "#5c5e72" : "#9194a8";
  const glassBorder = darkMode ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.5)";

  return (
    <div
      dir="rtl"
      style={{
        fontFamily: "'Heebo', 'Inter', sans-serif",
        minHeight: "100vh",
        background: bg,
        color: text,
        "--dash-bg": bg,
        "--dash-surface": surface,
        "--dash-text": text,
        "--dash-text-2": text2,
        "--dash-text-3": text3,
        "--dash-glass-border": glassBorder,
        "--dash-surface-hover": darkMode
          ? "rgba(255,255,255,0.04)"
          : "rgba(147,52,235,0.04)",
        "--color-primary": "#9334EB",
        transition: "background 0.4s ease, color 0.4s ease",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap');

        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }

        @keyframes toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* Custom scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(147,52,235,0.2); border-radius: 99px; }
      `}</style>

      {/* ── Simulated Nav Bar ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: surface,
          backdropFilter: "blur(20px) saturate(1.4)",
          borderBottom: `1px solid ${glassBorder}`,
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            margin: "0 auto",
            padding: "0 24px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {["דשבורד", "שת״פים", "קופונים", "מה חם 🔥", "שיחות", "הבוט שלי"].map((label, i) => {
              const isActive = label.includes("מה חם");
              return (
                <button
                  key={label}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: 500,
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.3s",
                    background: isActive ? "rgba(147,52,235,0.08)" : "transparent",
                    color: isActive ? "#9334EB" : text2,
                    position: "relative",
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "-1px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "20px",
                        height: "2px",
                        borderRadius: "99px",
                        background: "#9334EB",
                      }}
                    />
                  )}
                  {label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "12px",
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: text3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
            }}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </nav>

      {/* ── Ticker ── */}
      <NewsTicker />

      {/* ── Main Content ── */}
      <main
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "20px 16px 120px",
          display: "flex",
          flexDirection: "column",
          gap: "28px",
        }}
      >
        {/* Page Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "0 4px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "12px",
              background: "rgba(239,68,68,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Flame style={{ width: "20px", height: "20px", color: "#ef4444" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, lineHeight: 1.2 }}>
              מה חם עכשיו
            </h1>
            <p style={{ fontSize: "13px", color: text3 }}>
              351 נושאים פעילים · עודכן לפני 12 דקות
            </p>
          </div>
        </div>

        {/* Breaking Story */}
        <BreakingCard topic={BREAKING_TOPIC} onOpenChat={handleOpenChat} />

        {/* Hot Topics List */}
        <HotTopicsList topics={HOT_TOPICS} onOpenChat={handleOpenChat} />

        {/* Recent Posts */}
        <RecentPosts posts={RECENT_POSTS} onOpenChat={handleOpenChat} />
      </main>

      {/* ── Simulated Mobile Bottom Bar ── */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          background: surface,
          backdropFilter: "blur(20px) saturate(1.4)",
          borderTop: `1px solid ${glassBorder}`,
          display: "none",
        }}
        className="mobile-bar"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            height: "56px",
          }}
        >
          {[
            { icon: "📊", label: "דשבורד" },
            { icon: "💼", label: "שת״פים" },
            { icon: "🔥", label: "מה חם", active: true },
            { icon: "💬", label: "שיחות" },
            { icon: "🤖", label: "הבוט שלי" },
          ].map((item) => (
            <button
              key={item.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: item.active ? "#9334EB" : text3,
                position: "relative",
              }}
            >
              {item.active && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    width: "32px",
                    height: "2px",
                    borderRadius: "99px",
                    background: "#9334EB",
                    boxShadow: "0 0 8px rgba(147,52,235,0.4)",
                  }}
                />
              )}
              <span style={{ fontSize: "20px" }}>{item.icon}</span>
              <span style={{ fontSize: "10px" }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CSS for mobile */}
      <style>{`
        @media (max-width: 640px) {
          .mobile-bar { display: block !important; }
        }
      `}</style>

      {/* Toast */}
      <ChatRedirectToast item={selectedItem} />
    </div>
  );
}
