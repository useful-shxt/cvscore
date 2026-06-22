/**
 * client/src/components/FreeBanner.tsx — ADD as new file
 * Shows free period status + soft token counter
 */
import { useEffect, useState } from "react";

export function FreeBanner() {
  const [info, setInfo] = useState<{ tokensUsed: number; isFree: boolean; freeUntil: string | null } | null>(null);

  useEffect(() => {
    const email = localStorage.getItem("cvscore_email") || "";
    const url = `/api/tokens/summary${email ? `?email=${encodeURIComponent(email)}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (d.isFree) setInfo(d); })
      .catch(() => {});
  }, []);

  if (!info) return null;

  return (
    <div
      style={{
        background: "linear-gradient(90deg, rgba(16,185,129,0.12), rgba(59,130,246,0.12))",
        borderBottom: "1px solid rgba(16,185,129,0.2)",
        padding: "8px 20px",
        textAlign: "center",
        fontSize: "12px",
      }}
    >
      <span style={{ color: "#34D399", fontWeight: 700 }}>
        Free until {info.freeUntil || "launch"}
      </span>
      {info.tokensUsed > 0 && (
        <span style={{ color: "#8895B3", marginLeft: "12px" }}>
          · You've used{" "}
          <strong style={{ color: "#F0F4FF" }}>{info.tokensUsed} tokens</strong> worth of features for free
        </span>
      )}
      <span style={{ color: "#3D4F6E", marginLeft: "12px" }}>
        · No card required
      </span>
    </div>
  );
}
