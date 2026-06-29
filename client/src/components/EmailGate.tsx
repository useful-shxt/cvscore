import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  name: string;
  runCount: number;
}

interface EmailGateProps {
  onUser: (user: User, isNew: boolean, freeTokensAwarded?: number) => void;
}

function CVScoreLogo() {
  return (
    <svg width="40" height="40" viewBox="0 0 32 32" fill="none" aria-label="CVScore">
      <rect width="32" height="32" rx="8" fill="#3B82F6" />
      <rect x="7" y="8" width="12" height="2" rx="1" fill="white" opacity="0.9" />
      <rect x="7" y="13" width="18" height="2" rx="1" fill="white" opacity="0.7" />
      <rect x="7" y="18" width="14" height="2" rx="1" fill="white" opacity="0.5" />
      <circle cx="23" cy="22" r="5" fill="#080D1A" />
      <path d="M20.5 22L22 23.5L25.5 20" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getUrlReferral(): { ref: string | null; gift: number } {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const giftRaw = params.get("gift");
  const gift = giftRaw ? Math.max(0, parseInt(giftRaw, 10) || 0) : 0;
  return { ref, gift };
}

export function EmailGate({ onUser }: EmailGateProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { ref, gift } = getUrlReferral();
  const hasGift = !!ref && gift > 0;

  const isValid = name.trim().length > 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
      };
      if (ref) body.ref = ref;
      if (gift > 0) body.gift = gift;

      const res = await apiRequest("POST", "/api/user/register", body);
      const { user, isNew, freeTokensAwarded } = await res.json();
      onUser({ ...user, email: email.trim().toLowerCase() }, isNew, freeTokensAwarded);
    } catch (err: any) {
      setError("Something went wrong — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080D1A]/95 backdrop-blur-sm px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[#2A3558] bg-[#0F1629] overflow-hidden shadow-2xl">
          {/* Gift banner — only shown when arriving via a gift link */}
          {hasGift ? (
            <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-b border-green-500/30 px-6 py-3 text-center">
              <p className="text-xs font-semibold text-green-300">
                🎁 You've been gifted {gift} tokens — sign up below to claim them!
              </p>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-b border-[#2A3558] px-6 py-3 text-center">
              <p className="text-xs font-semibold text-blue-300">
                🚀 Free Early Access — CV Rewrite &amp; Cover Letters free until 29 July 2026
              </p>
            </div>
          )}

          <div className="p-8">
            {/* Logo + heading */}
            <div className="flex flex-col items-center text-center mb-8">
              <CVScoreLogo />
              <h1 className="font-display text-xl font-bold text-white mt-4 mb-2">
                Score your CV for free
              </h1>
              <p className="text-sm text-[#8895B3] leading-relaxed max-w-xs">
                {hasGift
                  ? `Your friend gifted you ${gift} tokens — plus your free welcome tokens. Sign up to start.`
                  : "Enter your details to get your score, AI rewrite, and 3 tailored cover letters — all free right now."}
              </p>
            </div>

            {/* What you get */}
            <div className="grid grid-cols-3 gap-3 mb-7">
              {[
                { icon: "📊", label: "ATS Score", sub: "Instant" },
                { icon: "✏️", label: "CV Rewrite", sub: "AI-optimised" },
                { icon: "📬", label: "Cover Letters", sub: "3 styles" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-[#1A2340] border border-[#2A3558] p-3 text-center">
                  <div className="text-xl mb-1">{item.icon}</div>
                  <p className="text-xs font-semibold text-white">{item.label}</p>
                  <p className="text-xs text-[#8895B3]">{item.sub}</p>
                </div>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium text-[#8895B3]">First name</Label>
                <Input
                  id="name"
                  data-testid="input-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex"
                  autoComplete="given-name"
                  className="bg-[#1A2340] border-[#2A3558] text-white placeholder:text-[#8895B3]/50 focus:border-blue-500 h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-[#8895B3]">Email address</Label>
                <Input
                  id="email"
                  data-testid="input-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  autoComplete="email"
                  className="bg-[#1A2340] border-[#2A3558] text-white placeholder:text-[#8895B3]/50 focus:border-blue-500 h-11"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              <Button
                type="submit"
                data-testid="button-get-started"
                disabled={!isValid || loading}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold h-12 rounded-xl text-base disabled:opacity-40"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Getting started...
                  </span>
                ) : hasGift ? `Claim my ${gift} gifted tokens →` : "Get my free score →"}
              </Button>
            </form>

            <p className="text-center text-xs text-[#8895B3] mt-4 leading-relaxed">
              No payment needed. We'll email your results to you.{" "}
              <span className="text-[#8895B3]/60">No spam, ever.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
