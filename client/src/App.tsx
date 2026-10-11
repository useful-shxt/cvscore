/**
 * client/src/App.tsx
 *
 * The CVScore website has been retired. This is a single static holding page —
 * no router, no forms, no email capture, no API calls.
 * CVScore is being rebuilt as a Claude (MCP) connector.
 */

function App() {
  return (
    <div
      style={{
        background: "#080D1A",
        minHeight: "100vh",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      {/* usefulshxt logo */}
      <div style={{ marginBottom: "32px" }}>
        <span
          style={{
            fontFamily: "Sora, sans-serif",
            fontWeight: 800,
            fontSize: "18px",
            color: "#F0F4FF",
            letterSpacing: "-0.01em",
          }}
        >
          useful<span style={{ color: "#60A5FA" }}>shxt</span>
        </span>
      </div>

      <div
        style={{
          background: "#0F1629",
          border: "1px solid #2A3558",
          borderRadius: "16px",
          padding: "48px 40px",
          maxWidth: "560px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "Sora, sans-serif",
            fontSize: "28px",
            fontWeight: 800,
            color: "#F0F4FF",
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
            margin: "0 0 18px",
          }}
        >
          CVScore is moving into Claude
        </h1>

        <p
          style={{
            color: "#8895B3",
            fontSize: "15px",
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          We're rebuilding CVScore as a Claude connector that helps you apply to
          the right jobs — you pick, you approve every application. Coming soon.
        </p>
      </div>
    </div>
  );
}

export default App;
