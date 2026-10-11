/**
 * fitplan.tsx — client/src/pages/fitplan.tsx
 *
 * Coming Soon placeholder. Plan generation is not available yet.
 */

export default function FitPlan() {
  return (
    <div
      style={{
        background: "#080D1A",
        minHeight: "100vh",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#0F1629",
          border: "1px solid #2A3558",
          borderRadius: "16px",
          padding: "48px 40px",
          maxWidth: "440px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "40px", marginBottom: "16px" }}>💪</div>

        <h1
          style={{
            fontFamily: "Sora, sans-serif",
            fontSize: "26px",
            fontWeight: 800,
            color: "#F0F4FF",
            letterSpacing: "-0.02em",
            margin: "0 0 10px",
          }}
        >
          FitPlan
        </h1>

        <span
          style={{
            display: "inline-block",
            padding: "4px 14px",
            borderRadius: "100px",
            fontSize: "12px",
            fontWeight: 600,
            background: "rgba(245,158,11,0.12)",
            color: "#F59E0B",
            border: "1px solid rgba(245,158,11,0.25)",
            marginBottom: "20px",
          }}
        >
          Coming Soon
        </span>

        <p
          style={{
            color: "#8895B3",
            fontSize: "14px",
            lineHeight: 1.65,
            margin: "0 0 28px",
          }}
        >
          Personalised meal and training plans are on the way. We're still
          building this one — check back soon.
        </p>

        <a
          href="#/"
          style={{
            display: "inline-block",
            background: "#3B82F6",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 600,
            padding: "12px 28px",
            borderRadius: "10px",
            textDecoration: "none",
          }}
        >
          Back to usefulshxt
        </a>
      </div>
    </div>
  );
}
