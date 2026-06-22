/**
 * client/src/pages/platform-home.tsx
 * The usefulshxt platform homepage — shown at /
 * Add as a new file. Update App.tsx to show this at "/" and CVScore at "/cvscore"
 */
import { Link } from "wouter";

const tools = [
  {
    path: "/cvscore",
    emoji: "📄",
    name: "CVScore",
    tagline: "Get hired faster.",
    description: "Score your CV against any job description in seconds. Get AI rewrites, cover letters, interview prep, LinkedIn optimisation, and salary benchmarking.",
    features: ["CV scoring & gap analysis", "AI rewrite + cover letters", "LinkedIn optimisation", "Salary benchmarking"],
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.2)",
    pill: "Career",
    pillColor: "#60A5FA",
    pillBg: "rgba(59,130,246,0.12)",
  },
  {
    path: "/predict",
    emoji: "⚽",
    name: "Predict",
    tagline: "One pick. Maximum conviction.",
    description: "Claude analyses form, injuries, head-to-head records, and tactical matchups to produce a single high-confidence prediction per sport per day.",
    features: ["World Cup 2026", "Premier League", "IPL Cricket", "Confidence score + full analysis"],
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    pill: "Sports",
    pillColor: "#FCD34D",
    pillBg: "rgba(245,158,11,0.12)",
  },
  {
    path: "/fitplan",
    emoji: "💪",
    name: "FitPlan",
    tagline: "Your plan. Built around you.",
    description: "Claude builds a personalised 7-day meal plan and training programme based on your goals, measurements, dietary requirements, and available equipment.",
    features: ["7-day meal plan with food quality ratings", "Training split with coaching notes", "Weekly grocery list with prices", "Adaptive weekly updates"],
    color: "#10B981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.2)",
    pill: "Fitness",
    pillColor: "#34D399",
    pillBg: "rgba(16,185,129,0.12)",
  },
];

export default function PlatformHome() {
  return (
    <div style={{ background: "#080D1A", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "60px 24px 100px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: "100px", padding: "4px 16px", marginBottom: "20px",
          }}>
            <span style={{ color: "#60A5FA", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Free during launch
            </span>
          </div>
          <h1 style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: "clamp(2rem, 5vw, 3.2rem)",
            fontWeight: 800, letterSpacing: "-0.03em",
            color: "#F0F4FF", margin: "0 0 16px", lineHeight: 1.15,
          }}>
            AI tools that do<br />
            <span style={{ color: "#60A5FA" }}>the actual work.</span>
          </h1>
          <p style={{
            color: "#8895B3", fontSize: "1.05rem", maxWidth: "480px",
            margin: "0 auto", lineHeight: 1.7,
          }}>
            Three tools. One platform. Built to help you get hired, stay fit, and back the right team.
          </p>
        </div>

        {/* Tool cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {tools.map((tool) => (
            <Link key={tool.path} href={tool.path}>
              <a style={{ textDecoration: "none", display: "block" }}>
                <div style={{
                  background: tool.bg, border: `1px solid ${tool.border}`,
                  borderRadius: "20px", padding: "28px 32px",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  cursor: "pointer",
                }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 16px 48px rgba(0,0,0,0.3)`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "20px" }}>
                    <div style={{ fontSize: "2.2rem", flexShrink: 0, marginTop: "2px" }}>{tool.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <span style={{
                          fontFamily: "'Sora', sans-serif", fontSize: "1.2rem",
                          fontWeight: 800, color: "#F0F4FF",
                        }}>{tool.name}</span>
                        <span style={{
                          fontSize: "10px", fontWeight: 700, padding: "2px 9px",
                          borderRadius: "100px", background: tool.pillBg,
                          color: tool.pillColor, letterSpacing: "0.08em", textTransform: "uppercase",
                        }}>{tool.pill}</span>
                      </div>
                      <p style={{
                        fontFamily: "'Sora', sans-serif", fontSize: "0.95rem",
                        fontWeight: 700, color: tool.color, margin: "0 0 8px",
                      }}>{tool.tagline}</p>
                      <p style={{ color: "#8895B3", fontSize: "0.85rem", margin: "0 0 16px", lineHeight: 1.65 }}>
                        {tool.description}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {tool.features.map((f) => (
                          <span key={f} style={{
                            fontSize: "11px", fontWeight: 600, padding: "3px 10px",
                            borderRadius: "6px", background: "rgba(255,255,255,0.05)",
                            color: "#C8D4EE", border: "1px solid rgba(255,255,255,0.08)",
                          }}>{f}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{
                      color: tool.color, fontSize: "1.4rem", flexShrink: 0,
                      alignSelf: "center", opacity: 0.7,
                    }}>→</div>
                  </div>
                </div>
              </a>
            </Link>
          ))}
        </div>

        {/* Bottom note */}
        <div style={{ textAlign: "center", marginTop: "48px" }}>
          <p style={{ color: "#3D4F6E", fontSize: "13px" }}>
            All tools are free during our launch period. No card required.
          </p>
        </div>
      </div>
    </div>
  );
}
