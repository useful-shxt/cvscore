import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import PlatformHome from "@/pages/platform-home";
import Home from "@/pages/home";
import Predict from "@/pages/predict";
import FitPlan from "@/pages/fitplan";
import NotFound from "@/pages/not-found";

// ─── Platform nav ──────────────────────────────────────────────────────────────
function PlatformNav() {
  const [location] = useLocation();

  const navItems = [
    { path: "/cvscore", label: "CVScore", emoji: "📄" },
    { path: "/predict", label: "Predict", emoji: "⚽" },
    { path: "/fitplan", label: "FitPlan", emoji: "💪" },
  ];

  return (
    <nav
      style={{
        borderBottom: "1px solid #2A3558",
        background: "#080D1A",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: "0 20px",
          height: "52px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/">
          <a style={{ textDecoration: "none" }}>
            <span
              style={{
                fontFamily: "Sora, sans-serif",
                fontWeight: 800,
                fontSize: "17px",
                color: "#F0F4FF",
                letterSpacing: "-0.01em",
              }}
            >
              useful<span style={{ color: "#60A5FA" }}>shxt</span>
            </span>
          </a>
        </Link>

        <div style={{ display: "flex", gap: "4px" }}>
          {navItems.map((item) => {
            const isActive = location === item.path || (item.path === "/cvscore" && location === "/");
            return (
              <Link key={item.path} href={item.path}>
                <a
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "6px 14px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                    transition: "all 0.15s",
                    color: isActive ? "#F0F4FF" : "#8895B3",
                    background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                    border: isActive
                      ? "1px solid rgba(255,255,255,0.1)"
                      : "1px solid transparent",
                  }}
                >
                  <span>{item.emoji}</span>
                  <span>{item.label}</span>
                </a>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <PlatformNav />
        <Switch>
          <Route path="/" component={PlatformHome} />
          <Route path="/cvscore" component={Home} />
          <Route path="/predict" component={Predict} />
          <Route path="/fitplan" component={FitPlan} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
